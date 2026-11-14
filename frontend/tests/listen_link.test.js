import React from 'react';
import { Linking } from 'react-native';
import { render, act, waitFor, fireEvent, cleanup } from '@testing-library/react-native';
import App from '../App';
import MicButton from '../src/components/MicButton';
import { isMicBusy } from '../src/utils/micActivity';
import { resetVoiceOverlayForTests } from '../src/utils/voiceOverlayStore';
import * as client from '../src/api/client';
import * as supabaseApi from '../src/api/supabase';
import * as SecureStore from 'expo-secure-store';
import { mockAudioRecorder, requestRecordingPermissionsAsync } from 'expo-audio';
import * as QuickActions from 'expo-quick-actions';
import {
  TALK_QUICK_ACTION,
  isListenUrl,
  handleIncomingUrl,
  takeListenRequest,
  resetListenTriggerForTests,
  SIGN_IN_WINDOW_MS,
  LISTEN_REQUEST_MAX_AGE_MS,
} from '../src/utils/listenTrigger';

jest.mock('../src/api/client');
jest.mock('../src/api/supabase');
jest.mock('expo-secure-store');

let mockInitialQuickAction = null;
const mockQuickActionListeners = [];
jest.mock('expo-quick-actions', () => ({
  get initial() {
    return mockInitialQuickAction;
  },
  setItems: jest.fn(() => Promise.resolve()),
  addListener: jest.fn((fn) => {
    mockQuickActionListeners.push(fn);
    return { remove: jest.fn() };
  }),
}));

const session = { access_token: 'mock_jwt_token', user: { email: 'test@pappu.dev' } };
const summary = {
  balance: 0,
  total_income: 0,
  total_expense: 0,
  category_breakdown: [],
  transaction_count: 0,
};

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let urlListeners;
let authCallback;
let clock;

async function emitUrl(url) {
  await act(async () => {
    urlListeners.forEach((fn) => fn({ url }));
  });
}

async function signIn() {
  await act(async () => {
    authCallback('SIGNED_IN', session);
  });
}

describe('isListenUrl', () => {
  test.each(['pappu://listen', 'pappu:///listen', 'pappu://listen/', 'PAPPU://listen?src=tile'])(
    'accepts %s',
    (url) => expect(isListenUrl(url)).toBe(true)
  );
  test.each(['pappu://home', 'pappu://listener', 'https://pappu.app/listen', '', null])(
    'rejects %s',
    (url) => expect(isListenUrl(url)).toBe(false)
  );
});

describe('pappu://listen deep link', () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.clearAllMocks();
    resetListenTriggerForTests();
    resetVoiceOverlayForTests();
    clock = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);

    urlListeners = [];
    mockInitialQuickAction = null;
    mockQuickActionListeners.length = 0;
    Linking.addEventListener.mockImplementation((type, fn) => {
      urlListeners.push(fn);
      return { remove: () => (urlListeners = urlListeners.filter((f) => f !== fn)) };
    });
    Linking.getInitialURL.mockResolvedValue(null);

    supabaseApi.getSession.mockResolvedValue(session);
    supabaseApi.supabase = {
      auth: {
        onAuthStateChange: jest.fn((cb) => {
          authCallback = cb;
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        }),
      },
    };
    SecureStore.getItemAsync.mockResolvedValue('true');
    client.fetchSummary.mockResolvedValue(summary);
    client.fetchTransactions.mockResolvedValue([]);
    client.fetchChatHistory.mockResolvedValue({ messages: [] });
    client.fetchActivePending.mockResolvedValue(null);
    client.fetchProfile.mockResolvedValue({ voice_replies: true });
    requestRecordingPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
  });

  afterEach(() => {
    cleanup();
    Date.now.mockRestore();
  });

  test('cold start: waits for the session restore, then Pappu emerges and records', async () => {
    const restore = deferred();
    supabaseApi.getSession.mockReturnValue(restore.promise);
    Linking.getInitialURL.mockResolvedValue('pappu://listen');

    const utils = await render(<App />);
    expect(await utils.findByTestId('auth-loading-screen')).toBeTruthy();
    expect(mockAudioRecorder.record).not.toHaveBeenCalled();

    await act(async () => restore.resolve(session));

    expect(await utils.findByTestId('voice-overlay')).toBeTruthy();
    await waitFor(() => expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1));
    expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect((await utils.findByTestId('voice-overlay-status')).props.children).toBe('Listening…');
  });

  test('warm start: a link while the app is open summons the overlay and records', async () => {
    const utils = await render(<App />);
    expect(await utils.findByTestId('dashboard-view')).toBeTruthy();
    expect(utils.queryByTestId('voice-overlay')).toBeNull();

    await emitUrl('pappu://listen');

    expect(await utils.findByTestId('voice-overlay')).toBeTruthy();
    await waitFor(() => expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1));
  });

  test('warm start with the Assistant chat open: Pappu emerges over the chat and records', async () => {
    const utils = await render(<App />);
    fireEvent.press(await utils.findByTestId('tab-assistant'));
    expect(await utils.findByTestId('assistant-modal')).toBeTruthy();
    expect(utils.queryByTestId('voice-overlay')).toBeNull();

    await emitUrl('pappu://listen');

    expect(await utils.findByTestId('voice-overlay')).toBeTruthy();
    await waitFor(() => expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1));
    expect(utils.getByTestId('assistant-modal')).toBeTruthy();
  });

  test('other URLs are ignored', async () => {
    const utils = await render(<App />);
    expect(await utils.findByTestId('dashboard-view')).toBeTruthy();

    await emitUrl('pappu://somewhere-else');

    expect(utils.queryByTestId('voice-overlay')).toBeNull();
    expect(mockAudioRecorder.record).not.toHaveBeenCalled();
  });

  test('a link while a recording is already active is ignored', async () => {
    const utils = await render(<App />);
    fireEvent.press(await utils.findByTestId('tab-assistant'));
    await fireEvent.press(await utils.findByTestId('mic-button'));
    expect(await utils.findByTestId('mic-recording-label')).toBeTruthy();

    await emitUrl('pappu://listen');

    expect(mockAudioRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1);
    expect(mockAudioRecorder.stop).not.toHaveBeenCalled();
    expect(utils.getByTestId('mic-recording-label')).toBeTruthy();
    expect(utils.queryByTestId('voice-overlay')).toBeNull();
  });

  test('a link while another mic (outside the assistant) records queues nothing', async () => {
    const utils = await render(<MicButton token="t" onTranscribed={jest.fn()} />);
    await fireEvent.press(await utils.findByTestId('mic-button'));
    expect(await utils.findByTestId('mic-recording-label')).toBeTruthy();

    expect(handleIncomingUrl('pappu://listen')).toBe(false);
    expect(takeListenRequest()).toBeNull();

    await fireEvent.press(utils.getByTestId('mic-button'));
    await waitFor(() => expect(client.transcribeAudio).toHaveBeenCalled());
    await waitFor(() => expect(handleIncomingUrl('pappu://listen')).toBe(true));
  });

  test('two links while the recorder is starting start one recording', async () => {
    const permission = deferred();
    requestRecordingPermissionsAsync.mockImplementationOnce(() => permission.promise);
    const utils = await render(<App />);
    expect(await utils.findByTestId('dashboard-view')).toBeTruthy();

    await emitUrl('pappu://listen');
    expect(await utils.findByTestId('voice-overlay')).toBeTruthy();
    await emitUrl('pappu://listen');
    await act(async () => permission.resolve({ status: 'granted', granted: true }));

    await waitFor(() => expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1));
    expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  test('signed out: shows sign in, then listens if sign in finishes within the window', async () => {
    supabaseApi.getSession.mockResolvedValue(null);
    const utils = await render(<App />);
    expect(await utils.findByTestId('auth-screen')).toBeTruthy();

    await emitUrl('pappu://listen');
    expect(utils.getByTestId('auth-screen')).toBeTruthy();
    expect(mockAudioRecorder.record).not.toHaveBeenCalled();

    clock += SIGN_IN_WINDOW_MS - 5000;
    await signIn();

    expect(await utils.findByTestId('voice-overlay')).toBeTruthy();
    await waitFor(() => expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1));
  });

  test('signed out: a sign in after the window just opens the app', async () => {
    supabaseApi.getSession.mockResolvedValue(null);
    const utils = await render(<App />);
    expect(await utils.findByTestId('auth-screen')).toBeTruthy();

    await emitUrl('pappu://listen');
    clock += SIGN_IN_WINDOW_MS + 1000;
    await signIn();

    expect(await utils.findByTestId('dashboard-view')).toBeTruthy();
    expect(utils.queryByTestId('voice-overlay')).toBeNull();
    expect(mockAudioRecorder.record).not.toHaveBeenCalled();
  });

  test('a link left waiting longer than the max age (e.g. server offline) is dropped', async () => {
    handleIncomingUrl('pappu://listen');
    clock += LISTEN_REQUEST_MAX_AGE_MS + 1000;
    expect(takeListenRequest()).toBeNull();
  });

  test('mic permission denied: never records and the mic returns to idle', async () => {
    requestRecordingPermissionsAsync.mockResolvedValue({ status: 'denied', granted: false });
    Linking.getInitialURL.mockResolvedValue('pappu://listen');

    const utils = await render(<App />);

    expect(await utils.findByTestId('voice-overlay-error-permission')).toBeTruthy();
    expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockAudioRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(mockAudioRecorder.record).not.toHaveBeenCalled();
    expect(client.transcribeAudio).not.toHaveBeenCalled();
    expect(isMicBusy()).toBe(false);
    expect(utils.getByTestId('voice-overlay-retry')).toBeTruthy();
    expect(utils.getByTestId('voice-overlay-settings')).toBeTruthy();
  });

  describe('"Talk to Pappu" icon quick action', () => {
    const action = { ...TALK_QUICK_ACTION };

    test('is registered with the listen link on start', async () => {
      await render(<App />);
      await waitFor(() => expect(QuickActions.setItems).toHaveBeenCalledWith([TALK_QUICK_ACTION]));
      expect(TALK_QUICK_ACTION.title).toBe('Talk to Pappu');
      expect(TALK_QUICK_ACTION.params.href).toBe('pappu://listen');
    });

    test('cold start from the icon summons the overlay and records', async () => {
      mockInitialQuickAction = action;
      const utils = await render(<App />);

      expect(await utils.findByTestId('voice-overlay')).toBeTruthy();
      await waitFor(() => expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1));
    });

    test('warm start from the icon summons the overlay and records', async () => {
      const utils = await render(<App />);
      expect(await utils.findByTestId('dashboard-view')).toBeTruthy();

      await act(async () => mockQuickActionListeners.forEach((fn) => fn(action)));

      expect(await utils.findByTestId('voice-overlay')).toBeTruthy();
      await waitFor(() => expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1));
    });

    test('an action without the listen link is ignored', async () => {
      const utils = await render(<App />);
      expect(await utils.findByTestId('dashboard-view')).toBeTruthy();

      await act(async () =>
        mockQuickActionListeners.forEach((fn) => fn({ id: 'x', title: 'X', params: { href: '/x' } }))
      );

      expect(utils.queryByTestId('voice-overlay')).toBeNull();
      expect(mockAudioRecorder.record).not.toHaveBeenCalled();
    });
  });
});

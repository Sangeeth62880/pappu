import React from 'react';
import { Linking } from 'react-native';
import { render, act, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import VoiceOverlayHost from '../src/components/voiceOverlay/VoiceOverlayHost';
import { AUTO_DISMISS_MS } from '../src/components/voiceOverlay/overlayMachine';
import { HANDS_FREE } from '../src/utils/useVoiceRecorder';
import * as client from '../src/api/client';
import {
  mockAudioRecorder,
  mockAudioPlayer,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { isMicBusy } from '../src/utils/micActivity';
import { stopAudio } from '../src/utils/audioPlayer';
import { queryClient } from '../src/data/queryClient';
import {
  openVoiceOverlay,
  isVoiceOverlayOpen,
  resetVoiceOverlayForTests,
} from '../src/utils/voiceOverlayStore';

jest.mock('../src/api/client', () => ({
  ...jest.createMockFromModule('../src/api/client'),
  isStillProcessingError: (err) => err?.status === 409 && err?.data?.code === 'still_processing',
}));

const token = 'tok';
const CUE_SOURCE = 1;
const SPEECH = -20;
const QUIET = -60;
const speaksBriefly = (ms) => (ms >= 400 && ms <= 1500 ? SPEECH : QUIET);
const STOP_AFTER_SPEECH_MS = 1500 + HANDS_FREE.silenceMs + 200;

let levelAt;
let recordStartedAt;
let ttsPlayers;

function fakePlayer() {
  const listeners = {};
  return {
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn((event, cb) => {
      listeners[event] = cb;
      return { remove: jest.fn() };
    }),
    finish: () => listeners.playbackStatusUpdate?.({ didJustFinish: true }),
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function advance(ms) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function summon(props = {}) {
  const onTransactionMutated = jest.fn();
  const utils = await render(
    <VoiceOverlayHost token={token} onTransactionMutated={onTransactionMutated} {...props} />
  );
  await act(async () => openVoiceOverlay('link'));
  return { ...utils, onTransactionMutated };
}

async function finishSpeaking() {
  await waitFor(() => expect(Object.keys(ttsPlayers).length).toBeGreaterThan(0));
  await act(async () => {
    Object.values(ttsPlayers).forEach((p) => p.finish());
  });
  ttsPlayers = {};
}

const pose = (utils) =>
  utils.getByTestId('voice-overlay-mascot').children.find((c) => c.props?.testID?.startsWith('pappu-pose-'))
    ?.props.testID.replace('pappu-pose-', '');

const added = {
  display_text: 'Added ₹20 to Food.',
  spoken_text: 'Added 20 rupees to food.',
  language: 'en',
  mood: 'happy',
  results: [
    {
      ok: true,
      action: 'add',
      data: { amount: 20, type: 'expense', category_name: 'Food', contact_name: null },
    },
  ],
  pending: null,
  changed: true,
};

describe('Voice overlay session', () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    resetVoiceOverlayForTests();
    queryClient.clear();
    levelAt = speaksBriefly;
    ttsPlayers = {};
    mockAudioRecorder.record.mockImplementation(() => {
      recordStartedAt = Date.now();
    });
    mockAudioRecorder.getStatus = jest.fn(() => ({
      isRecording: true,
      metering: levelAt(Date.now() - recordStartedAt),
    }));
    createAudioPlayer.mockImplementation((source) => {
      if (source === CUE_SOURCE) return mockAudioPlayer;
      ttsPlayers[source] = fakePlayer();
      return ttsPlayers[source];
    });
    requestRecordingPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    client.fetchProfile.mockResolvedValue({ language: 'en' });
    client.transcribeAudio.mockResolvedValue({ transcript: 'chaya 20' });
    client.synthesizeSpeech.mockResolvedValue({ audio_base64: 'UklGRg==' });
    client.sendAssistantMessage.mockResolvedValue(added);
    client.undoTransaction.mockResolvedValue({ ok: true });
  });

  afterEach(async () => {
    cleanup();
    await stopAudio();
    delete mockAudioRecorder.getStatus;
    mockAudioRecorder.record.mockReset();
    createAudioPlayer.mockImplementation(() => mockAudioPlayer);
    jest.useRealTimers();
  });

  test('summon -> listening -> thinking -> speaking -> result -> dismiss', async () => {
    const reply = deferred();
    client.sendAssistantMessage.mockReturnValueOnce(reply.promise);
    const utils = await summon();

    // listening
    expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1);
    expect(pose(utils)).toBe('listening');
    expect(utils.getByTestId('voice-overlay-status').props.children).toBe('Listening…');
    expect(utils.getByTestId('voice-overlay-halo-level')).toBeTruthy();

    // thinking: the final transcript shows as soon as STT returns
    await advance(STOP_AFTER_SPEECH_MS);
    await waitFor(() => expect(utils.getByTestId('voice-overlay-transcript')).toBeTruthy());
    expect(utils.getByTestId('voice-overlay-transcript').props.children).toEqual(['“', 'chaya 20', '”']);
    expect(pose(utils)).toBe('thinking');
    expect(utils.getByTestId('voice-overlay-status').props.children).toBe('One sec…');
    expect(utils.getByTestId('voice-overlay-halo-dots')).toBeTruthy();
    expect(client.sendAssistantMessage).toHaveBeenCalledWith(token, {
      text: 'chaya 20',
      input: 'voice',
      client_msg_id: expect.any(String),
    });

    // speaking
    await act(async () => reply.resolve(added));
    await waitFor(() => expect(Object.keys(ttsPlayers)).toHaveLength(1));
    expect(pose(utils)).toBe('speaking');
    expect(utils.getByText('Added ₹20 to Food.')).toBeTruthy();
    expect(client.synthesizeSpeech).toHaveBeenCalledWith(token, 'Added 20 rupees to food.', 'en-IN');

    // result
    await finishSpeaking();
    expect(pose(utils)).toBe('happy');
    expect(utils.getByTestId('voice-overlay-result-card')).toBeTruthy();
    expect(utils.getByText('Food')).toBeTruthy();
    expect(utils.getByTestId('voice-overlay-undo')).toBeTruthy();

    // dismiss about 2.5s after speaking ends
    await advance(AUTO_DISMISS_MS - 100);
    expect(isVoiceOverlayOpen()).toBe(true);
    await advance(600);
    expect(isVoiceOverlayOpen()).toBe(false);
    expect(utils.queryByTestId('voice-overlay')).toBeNull();
  });

  test('Undo on the result card calls the existing undo and refreshes data', async () => {
    const utils = await summon();
    await advance(STOP_AFTER_SPEECH_MS);
    await finishSpeaking();

    await act(async () => fireEvent.press(utils.getByTestId('voice-overlay-undo')));

    expect(client.undoTransaction).toHaveBeenCalledWith(token);
    expect(utils.getByTestId('voice-overlay-undone')).toBeTruthy();
    expect(utils.onTransactionMutated).toHaveBeenCalledTimes(2);
  });

  test('touching the card keeps the overlay open', async () => {
    const utils = await summon();
    await advance(STOP_AFTER_SPEECH_MS);
    await finishSpeaking();

    await fireEvent(utils.getByTestId('voice-overlay-stack'), 'touchStart');
    await advance(AUTO_DISMISS_MS * 3);

    expect(isVoiceOverlayOpen()).toBe(true);
  });

  test('a query answer shows the text, a budget alert the warning with the concerned pose', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      ...added,
      display_text: 'Added ₹600 to Food. You are over your Food budget.',
      mood: 'concerned',
      results: [
        {
          ok: true,
          action: 'add',
          data: {
            amount: 600,
            type: 'expense',
            category_name: 'Food',
            budget_alert: { alert: 'over', category: 'Food', spent: 5200, budget: 5000, percent: 104 },
          },
        },
      ],
    });
    const utils = await summon();
    await advance(STOP_AFTER_SPEECH_MS);
    await finishSpeaking();

    expect(pose(utils)).toBe('concerned');
    expect(utils.getByTestId('voice-overlay-budget-alert')).toBeTruthy();
    expect(utils.getByText('Over your Food budget: ₹5,200 of ₹5,000')).toBeTruthy();
  });

  describe('errors show a friendly message and Retry, never a stuck spinner', () => {
    function expectErrorState(utils, kind) {
      expect(utils.getByTestId(`voice-overlay-error-${kind}`)).toBeTruthy();
      expect(utils.getByTestId('voice-overlay-retry')).toBeTruthy();
      expect(utils.queryByTestId('voice-overlay-status')).toBeNull();
      expect(utils.queryByTestId('voice-overlay-halo-dots')).toBeNull();
      expect(pose(utils)).toBe('concerned');
      expect(isMicBusy()).toBe(false);
    }

    test('no mic permission: Retry asks again, Settings opens app settings', async () => {
      requestRecordingPermissionsAsync.mockResolvedValueOnce({ status: 'denied', granted: false });
      Linking.openSettings = jest.fn();
      const utils = await summon();

      expectErrorState(utils, 'permission');
      expect(utils.getByText('Pappu needs the microphone to hear you.')).toBeTruthy();
      expect(mockAudioRecorder.record).not.toHaveBeenCalled();

      await fireEvent.press(utils.getByTestId('voice-overlay-settings'));
      expect(Linking.openSettings).toHaveBeenCalled();

      await act(async () => fireEvent.press(utils.getByTestId('voice-overlay-retry')));
      expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(2);
      expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1);
    });

    test('nothing said: discarded, Retry listens again', async () => {
      levelAt = () => QUIET;
      const utils = await summon();
      await advance(HANDS_FREE.maxMs + 200);

      expectErrorState(utils, 'empty');
      expect(client.transcribeAudio).not.toHaveBeenCalled();

      await act(async () => fireEvent.press(utils.getByTestId('voice-overlay-retry')));
      expect(mockAudioRecorder.record).toHaveBeenCalledTimes(2);
      expect(utils.getByTestId('voice-overlay-status')).toBeTruthy();
    });

    test('empty transcript from STT', async () => {
      client.transcribeAudio.mockResolvedValueOnce({ transcript: '   ' });
      const utils = await summon();
      await advance(STOP_AFTER_SPEECH_MS);
      await waitFor(() => expectErrorState(utils, 'empty'));
      expect(client.sendAssistantMessage).not.toHaveBeenCalled();
    });

    test('STT failure: Retry listens again', async () => {
      client.transcribeAudio.mockRejectedValueOnce(new Error('Speech transcription failed with status 502'));
      const utils = await summon();
      await advance(STOP_AFTER_SPEECH_MS);

      await waitFor(() => expectErrorState(utils, 'stt'));
      await act(async () => fireEvent.press(utils.getByTestId('voice-overlay-retry')));
      expect(mockAudioRecorder.record).toHaveBeenCalledTimes(2);
    });

    test.each([
      ['network', new Error('Network request failed')],
      ['processing', Object.assign(new Error('still processing'), { status: 409, data: { code: 'still_processing' } })],
      ['server', Object.assign(new Error('Internal error'), { status: 500 })],
    ])('%s on the assistant call: Retry resends with the same client_msg_id', async (kind, err) => {
      client.sendAssistantMessage.mockRejectedValueOnce(err);
      const utils = await summon();
      await advance(STOP_AFTER_SPEECH_MS);

      await waitFor(() => expectErrorState(utils, kind));
      await act(async () => fireEvent.press(utils.getByTestId('voice-overlay-retry')));

      await waitFor(() => expect(client.sendAssistantMessage).toHaveBeenCalledTimes(2));
      const [first, second] = client.sendAssistantMessage.mock.calls.map(([, body]) => body);
      expect(second).toEqual(first);
      expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1);
      expect(await utils.findByText('Added ₹20 to Food.')).toBeTruthy();
    });
  });

  describe('confirmation', () => {
    const pendingReply = {
      display_text: 'Delete Food ₹20 on 7 Nov?',
      spoken_text: 'Delete food 20 rupees on 7 November?',
      language: 'en',
      mood: 'concerned',
      results: [],
      pending: { id: 'p-1', kind: 'confirm', question: 'Delete Food ₹20 on 7 Nov?' },
      changed: false,
    };
    const deleted = {
      display_text: 'Deleted Food ₹20.',
      spoken_text: 'Deleted food 20 rupees.',
      language: 'en',
      mood: 'neutral',
      results: [{ ok: true, action: 'delete', data: { amount: 20, type: 'expense', category_name: 'Food' } }],
      pending: null,
      changed: true,
    };

    test('shows Yes/No, listens once more after the question, and sends the spoken answer', async () => {
      client.transcribeAudio
        .mockResolvedValueOnce({ transcript: 'delete the tea' })
        .mockResolvedValueOnce({ transcript: 'sheri' });
      client.sendAssistantMessage.mockResolvedValueOnce(pendingReply).mockResolvedValueOnce(deleted);
      const utils = await summon();

      await advance(STOP_AFTER_SPEECH_MS);
      await waitFor(() => expect(utils.getByTestId('voice-overlay-yes')).toBeTruthy());
      expect(utils.getByTestId('voice-overlay-no')).toBeTruthy();
      await advance(1000);
      expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1);

      await finishSpeaking();
      await waitFor(() => expect(mockAudioRecorder.record).toHaveBeenCalledTimes(2));
      expect(utils.getByTestId('voice-overlay-yes')).toBeTruthy();

      await advance(STOP_AFTER_SPEECH_MS);
      await waitFor(() => expect(client.sendAssistantMessage).toHaveBeenCalledTimes(2));
      const [first, second] = client.sendAssistantMessage.mock.calls.map(([, body]) => body);
      expect(second).toEqual({ text: 'sheri', input: 'voice', client_msg_id: expect.any(String) });
      expect(second.client_msg_id).not.toBe(first.client_msg_id);
      expect(await utils.findByText('Deleted Food ₹20.')).toBeTruthy();

      await finishSpeaking();
      await advance(AUTO_DISMISS_MS + 500);
      expect(isVoiceOverlayOpen()).toBe(false);
      expect(mockAudioRecorder.record).toHaveBeenCalledTimes(2);
    });

    test('Yes during the re-listen stops the mic, discards it and answers the pending', async () => {
      client.sendAssistantMessage.mockResolvedValueOnce(pendingReply);
      client.answerPending.mockResolvedValueOnce(deleted);
      const utils = await summon();
      await advance(STOP_AFTER_SPEECH_MS);
      await finishSpeaking();
      await waitFor(() => expect(mockAudioRecorder.record).toHaveBeenCalledTimes(2));

      await act(async () => fireEvent.press(utils.getByTestId('voice-overlay-yes')));

      expect(client.answerPending).toHaveBeenCalledWith(token, 'p-1', 'confirm', null);
      expect(mockAudioRecorder.stop).toHaveBeenCalledTimes(2);
      expect(client.transcribeAudio).toHaveBeenCalledTimes(1);
      expect(await utils.findByText('Deleted Food ₹20.')).toBeTruthy();
    });

    test('No on a contact question answers no', async () => {
      client.sendAssistantMessage.mockResolvedValueOnce({
        ...pendingReply,
        spoken_text: '',
        pending: { id: 'p-2', kind: 'contact_confirm', question: 'Is this Pooja?' },
      });
      client.answerPending.mockResolvedValueOnce({ ...deleted, display_text: 'OK.' });
      const utils = await summon();
      await advance(STOP_AFTER_SPEECH_MS);
      await waitFor(() => expect(utils.getByTestId('voice-overlay-no')).toBeTruthy());

      await act(async () => fireEvent.press(utils.getByTestId('voice-overlay-no')));
      expect(client.answerPending).toHaveBeenCalledWith(token, 'p-2', 'no', null);
    });

    test('no auto dismiss while a confirmation is pending', async () => {
      client.transcribeAudio
        .mockResolvedValueOnce({ transcript: 'delete the tea' })
        .mockResolvedValueOnce({ transcript: 'hmm' });
      client.sendAssistantMessage
        .mockResolvedValueOnce(pendingReply)
        .mockResolvedValueOnce({ ...pendingReply, pending: { ...pendingReply.pending, id: 'p-3' } });
      const utils = await summon();
      await advance(STOP_AFTER_SPEECH_MS);
      await finishSpeaking();
      await advance(STOP_AFTER_SPEECH_MS);
      await finishSpeaking();

      await advance(AUTO_DISMISS_MS * 4);

      expect(isVoiceOverlayOpen()).toBe(true);
      expect(utils.getByTestId('voice-overlay-yes')).toBeTruthy();
      expect(mockAudioRecorder.record).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancel discards the audio and sends nothing', () => {
    test.each([
      ['Android back', (u) => fireEvent(u.getByTestId('voice-overlay'), 'requestClose')],
      ['scrim tap', (u) => fireEvent.press(u.getByTestId('voice-overlay-scrim'))],
      ['close button', (u) => fireEvent.press(u.getByTestId('voice-overlay-close'))],
      [
        'swipe down',
        (u) =>
          fireGestureHandler(getByGestureTestId('voice-overlay-swipe'), [
            { state: State.BEGAN, translationY: 0 },
            { state: State.ACTIVE, translationY: 60 },
            { state: State.END, translationY: 160, velocityY: 1200 },
          ]),
      ],
    ])('%s while listening', async (_name, dismiss) => {
      levelAt = () => SPEECH;
      const utils = await summon();
      expect(isMicBusy()).toBe(true);

      await act(async () => dismiss(utils));
      await advance(HANDS_FREE.maxMs + 1000);

      expect(mockAudioRecorder.stop).toHaveBeenCalledTimes(1);
      expect(client.transcribeAudio).not.toHaveBeenCalled();
      expect(client.sendAssistantMessage).not.toHaveBeenCalled();
      expect(isVoiceOverlayOpen()).toBe(false);
      expect(isMicBusy()).toBe(false);
    });

    test('closing while thinking ignores the late reply (no speech, no data refresh)', async () => {
      const reply = deferred();
      client.sendAssistantMessage.mockReturnValueOnce(reply.promise);
      const utils = await summon();
      await advance(STOP_AFTER_SPEECH_MS);
      await waitFor(() => expect(client.sendAssistantMessage).toHaveBeenCalled());

      await act(async () => fireEvent.press(utils.getByTestId('voice-overlay-close')));
      await act(async () => reply.resolve(added));

      expect(isVoiceOverlayOpen()).toBe(false);
      expect(client.synthesizeSpeech).not.toHaveBeenCalled();
      expect(utils.onTransactionMutated).not.toHaveBeenCalled();
    });

    test('a short drag springs back instead of closing', async () => {
      await summon();
      await act(async () =>
        fireGestureHandler(getByGestureTestId('voice-overlay-swipe'), [
          { state: State.BEGAN, translationY: 0 },
          { state: State.ACTIVE, translationY: 30 },
          { state: State.END, translationY: 40, velocityY: 100 },
        ])
      );
      expect(isVoiceOverlayOpen()).toBe(true);
    });
  });
});

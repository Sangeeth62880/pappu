import React from 'react';
import { render, fireEvent, act, cleanup } from '@testing-library/react-native';
import HomeScreen from '../src/screens/HomeScreen';
import VoiceOverlayHost from '../src/components/voiceOverlay/VoiceOverlayHost';
import * as client from '../src/api/client';
import * as supabaseApi from '../src/api/supabase';
import * as SecureStore from 'expo-secure-store';
import {
  openVoiceOverlay,
  closeVoiceOverlay,
  isVoiceOverlayOpen,
  resetVoiceOverlayForTests,
} from '../src/utils/voiceOverlayStore';

jest.mock('../src/api/client');
jest.mock('../src/api/supabase');
jest.mock('expo-secure-store');

describe('voice overlay store', () => {
  beforeEach(() => resetVoiceOverlayForTests());

  test('opens once; a second trigger while open is ignored', () => {
    expect(openVoiceOverlay('link')).toBe(true);
    expect(openVoiceOverlay('coin')).toBe(false);
    expect(isVoiceOverlayOpen()).toBe(true);
  });

  test('close lets the next trigger open a new session', () => {
    openVoiceOverlay('link');
    closeVoiceOverlay();
    expect(isVoiceOverlayOpen()).toBe(false);
    expect(openVoiceOverlay('quick_action')).toBe(true);
  });
});

describe('VoiceOverlayHost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetVoiceOverlayForTests();
    client.fetchProfile.mockResolvedValue({ language: 'en' });
  });
  afterEach(() => cleanup());

  test('renders nothing until opened', async () => {
    const utils = await render(<VoiceOverlayHost token="t" />);
    expect(utils.queryByTestId('voice-overlay')).toBeNull();

    await act(async () => openVoiceOverlay('link'));
    expect(utils.getByTestId('voice-overlay')).toBeTruthy();
    expect(utils.getByTestId('voice-overlay-mascot')).toBeTruthy();
  });

  test.each([
    ['close button', (u) => fireEvent.press(u.getByTestId('voice-overlay-close'))],
    ['Android back', (u) => fireEvent(u.getByTestId('voice-overlay'), 'requestClose')],
    ['scrim tap', (u) => fireEvent.press(u.getByTestId('voice-overlay-scrim'))],
  ])('%s closes it', async (_name, dismiss) => {
    const utils = await render(<VoiceOverlayHost token="t" />);
    await act(async () => openVoiceOverlay('link'));

    await act(async () => dismiss(utils));

    expect(isVoiceOverlayOpen()).toBe(false);
    expect(utils.queryByTestId('voice-overlay')).toBeNull();
  });

  test('signed out: an open request is closed instead of shown', async () => {
    openVoiceOverlay('link');
    const utils = await render(<VoiceOverlayHost token={null} />);
    await act(async () => {});
    expect(utils.queryByTestId('voice-overlay')).toBeNull();
    expect(isVoiceOverlayOpen()).toBe(false);
  });
});

describe('coin button', () => {
  const session = { access_token: 'tok', user: { email: 'test@pappu.dev' } };

  beforeEach(() => {
    jest.clearAllMocks();
    resetVoiceOverlayForTests();
    supabaseApi.getSession.mockResolvedValue(null);
    supabaseApi.supabase = {
      auth: {
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      },
    };
    SecureStore.getItemAsync.mockResolvedValue('true');
    client.fetchSummary.mockResolvedValue({
      balance: 0,
      total_income: 0,
      total_expense: 0,
      category_breakdown: [],
      transaction_count: 0,
    });
    client.fetchTransactions.mockResolvedValue([]);
    client.fetchChatHistory.mockResolvedValue({ messages: [] });
    client.fetchActivePending.mockResolvedValue(null);
    client.fetchProfile.mockResolvedValue({ language: 'en' });
  });
  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  test('press and hold summons the overlay over the current screen', async () => {
    const utils = await render(<HomeScreen initialSession={session} />);
    const coin = await utils.findByTestId('tab-assistant');
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});

    fireEvent(coin, 'pressIn');
    act(() => jest.advanceTimersByTime(350));
    await act(async () => fireEvent(coin, 'pressOut'));

    expect(utils.getByTestId('voice-overlay')).toBeTruthy();
    expect(utils.getByTestId('dashboard-view')).toBeTruthy();
    expect(utils.queryByTestId('assistant-modal')).toBeNull();
    console.log.mockRestore();
  });

  test('a tap still opens the Assistant chat, not the overlay', async () => {
    const utils = await render(<HomeScreen initialSession={session} />);
    fireEvent.press(await utils.findByTestId('tab-assistant'));

    expect(await utils.findByTestId('assistant-modal')).toBeTruthy();
    expect(utils.queryByTestId('voice-overlay')).toBeNull();
  });
});

import React from 'react';
import { AppState } from 'react-native';
import { render, act, waitFor, cleanup } from '@testing-library/react-native';
import VoiceOverlayHost from '../src/components/voiceOverlay/VoiceOverlayHost';
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

jest.mock('../src/api/client');

const token = 'tok';
const CUE_SOURCE = 1;
const STOP_AFTER_SPEECH_MS = 1500 + HANDS_FREE.silenceMs + 200;
let recordStartedAt;
let ttsPlayers;
let appStateListeners;
let level;

const added = {
  display_text: 'Added ₹20 to Food.',
  spoken_text: 'Added 20 rupees to food.',
  language: 'en',
  mood: 'happy',
  results: [],
  pending: null,
  changed: true,
};

function fakePlayer() {
  const listeners = {};
  return {
    play: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn((event, cb) => {
      listeners[event] = cb;
      return { remove: jest.fn() };
    }),
    finish: () => listeners.playbackStatusUpdate?.({ didJustFinish: true }),
  };
}

async function advance(ms) {
  await act(async () => jest.advanceTimersByTime(ms));
}

async function summon(props = {}) {
  const utils = await render(<VoiceOverlayHost token={token} {...props} />);
  await act(async () => openVoiceOverlay('link'));
  return utils;
}

async function setAppState(next) {
  await act(async () => appStateListeners.forEach((fn) => fn(next)));
}

describe('Voice overlay robustness', () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    resetVoiceOverlayForTests();
    queryClient.clear();
    level = (ms) => (ms >= 400 && ms <= 1500 ? -20 : -60);
    ttsPlayers = {};
    appStateListeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      appStateListeners.push(fn);
      return { remove: () => (appStateListeners = appStateListeners.filter((f) => f !== fn)) };
    });
    mockAudioRecorder.record.mockImplementation(() => {
      recordStartedAt = Date.now();
    });
    mockAudioRecorder.getStatus = jest.fn(() => ({ metering: level(Date.now() - recordStartedAt) }));
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
  });

  afterEach(async () => {
    cleanup();
    await stopAudio();
    AppState.addEventListener.mockRestore();
    delete mockAudioRecorder.getStatus;
    mockAudioRecorder.record.mockReset();
    createAudioPlayer.mockImplementation(() => mockAudioPlayer);
    jest.useRealTimers();
  });

  test('going to the background while listening drops the audio and closes', async () => {
    level = () => -20;
    await summon();
    expect(isMicBusy()).toBe(true);

    await setAppState('background');
    await advance(HANDS_FREE.maxMs + 500);

    expect(isVoiceOverlayOpen()).toBe(false);
    expect(mockAudioRecorder.stop).toHaveBeenCalledTimes(1);
    expect(client.transcribeAudio).not.toHaveBeenCalled();
    expect(client.sendAssistantMessage).not.toHaveBeenCalled();
    expect(isMicBusy()).toBe(false);
  });

  test('going to the background while speaking stops the reply', async () => {
    await summon();
    await advance(STOP_AFTER_SPEECH_MS);
    await waitFor(() => expect(Object.keys(ttsPlayers)).toHaveLength(1));
    const player = Object.values(ttsPlayers)[0];

    await setAppState('background');

    expect(player.remove).toHaveBeenCalled();
    expect(isVoiceOverlayOpen()).toBe(false);
  });

  test('inactive (iOS Control Center, a call banner) keeps the session', async () => {
    await summon();
    await setAppState('inactive');
    expect(isVoiceOverlayOpen()).toBe(true);
  });

  test('the mic permission prompt (backgrounds the app on Android) does not close it', async () => {
    let grant;
    requestRecordingPermissionsAsync.mockImplementationOnce(() => new Promise((r) => (grant = r)));
    await summon();

    await setAppState('background');
    expect(isVoiceOverlayOpen()).toBe(true);

    await setAppState('active');
    await act(async () => grant({ status: 'granted', granted: true }));
    expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1);
  });

  test('a second trigger while open is ignored: one overlay, one recording', async () => {
    const utils = await summon();
    let second;
    await act(async () => {
      second = openVoiceOverlay('coin');
    });
    expect(second).toBe(false);
    expect(utils.getAllByTestId('voice-overlay')).toHaveLength(1);
    expect(mockAudioRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
  });

  test('signing out mid request: the late reply is ignored', async () => {
    let resolveReply;
    client.sendAssistantMessage.mockReturnValueOnce(new Promise((r) => (resolveReply = r)));
    const utils = await summon();
    await advance(STOP_AFTER_SPEECH_MS);
    await waitFor(() => expect(client.sendAssistantMessage).toHaveBeenCalled());

    await act(async () => utils.rerender(<VoiceOverlayHost token={null} />));
    await act(async () => resolveReply(added));

    expect(isVoiceOverlayOpen()).toBe(false);
    expect(client.synthesizeSpeech).not.toHaveBeenCalled();
  });

  test('closing leaves no recorder poll, listener or second close behind', async () => {
    const closes = jest.spyOn(require('../src/utils/voiceOverlayStore'), 'closeVoiceOverlay');
    level = () => -20;
    await summon();
    await advance(1000);
    expect(mockAudioRecorder.getStatus).toHaveBeenCalled();

    await setAppState('background');
    const polls = mockAudioRecorder.getStatus.mock.calls.length;
    await advance(HANDS_FREE.maxMs * 2);

    expect(mockAudioRecorder.getStatus.mock.calls.length).toBe(polls);
    expect(isVoiceOverlayOpen()).toBe(false);
    expect(isMicBusy()).toBe(false);
    expect(appStateListeners).toHaveLength(0);
    expect(closes.mock.calls.length).toBeLessThanOrEqual(1);
    closes.mockRestore();
  });
});

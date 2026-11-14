import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { render, act, waitFor, cleanup } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import VoiceOverlayHost from '../src/components/voiceOverlay/VoiceOverlayHost';
import { HANDS_FREE } from '../src/utils/useVoiceRecorder';
import * as client from '../src/api/client';
import {
  mockAudioRecorder,
  mockAudioPlayer,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { setGlobalReduceMotion } from '../src/utils/reduceMotion';
import { stopAudio } from '../src/utils/audioPlayer';
import { queryClient } from '../src/data/queryClient';
import { queryKeys } from '../src/data/queryKeys';
import { openVoiceOverlay, resetVoiceOverlayForTests } from '../src/utils/voiceOverlayStore';

jest.mock('../src/api/client');
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    withSpring: jest.fn(actual.withSpring),
    withRepeat: jest.fn(actual.withRepeat),
    withSequence: jest.fn(actual.withSequence),
  };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const token = 'tok';
const CUE_SOURCE = 1;
const STOP_AFTER_SPEECH_MS = 1500 + HANDS_FREE.silenceMs + 200;
let recordStartedAt;
let ttsPlayers;
let level;

const added = {
  display_text: 'Added ₹20 to Food.',
  spoken_text: 'Added 20 rupees to food.',
  language: 'en',
  mood: 'happy',
  results: [{ ok: true, action: 'add', data: { amount: 20, type: 'expense', category_name: 'Food' } }],
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

async function summon() {
  const utils = await render(<VoiceOverlayHost token={token} />);
  await act(async () => openVoiceOverlay('link'));
  return utils;
}

async function finishSpeaking() {
  await waitFor(() => expect(Object.keys(ttsPlayers).length).toBeGreaterThan(0));
  await act(async () => Object.values(ttsPlayers).forEach((p) => p.finish()));
  ttsPlayers = {};
}

const hidden = { includeHiddenElements: true };

describe('Voice overlay comfort and accessibility', () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    resetVoiceOverlayForTests();
    queryClient.clear();
    setGlobalReduceMotion(false);
    level = (ms) => (ms >= 400 && ms <= 1500 ? -20 : -60);
    ttsPlayers = {};
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
    AccessibilityInfo.announceForAccessibility = jest.fn();
  });

  afterEach(async () => {
    cleanup();
    await stopAudio();
    setGlobalReduceMotion(false);
    delete mockAudioRecorder.getStatus;
    mockAudioRecorder.record.mockReset();
    createAudioPlayer.mockImplementation(() => mockAudioPlayer);
    jest.useRealTimers();
  });

  describe('reduce motion', () => {
    test('fades instead of springs, a static halo and no animation loops', async () => {
      setGlobalReduceMotion(true);
      let resolveReply;
      client.sendAssistantMessage.mockReturnValueOnce(new Promise((r) => (resolveReply = r)));
      const utils = await summon();
      expect(utils.getByTestId('voice-overlay-halo-level-static', hidden)).toBeTruthy();

      await advance(STOP_AFTER_SPEECH_MS);
      await waitFor(() =>
        expect(utils.getByTestId('voice-overlay-halo-dots-static', hidden)).toBeTruthy()
      );
      await act(async () => resolveReply(added));
      await finishSpeaking();
      expect(utils.getByTestId('voice-overlay-result-card')).toBeTruthy();

      expect(Reanimated.withSpring).not.toHaveBeenCalled();
      expect(Reanimated.withRepeat).not.toHaveBeenCalled();
      expect(Reanimated.withSequence).not.toHaveBeenCalled();
    });

    test('with motion on, the summon springs and the halo loops', async () => {
      const utils = await summon();
      expect(utils.getByTestId('voice-overlay-halo-level', hidden)).toBeTruthy();
      expect(Reanimated.withSpring).toHaveBeenCalled();
      expect(Reanimated.withRepeat).toHaveBeenCalled();
    });
  });

  describe('haptics', () => {
    test('a light tick on summon and a success tick on a successful result', async () => {
      await summon();
      expect(Haptics.impactAsync).toHaveBeenCalledWith('light');

      await advance(STOP_AFTER_SPEECH_MS);
      await finishSpeaking();
      expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
      expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    });

    test('an error tick on an error', async () => {
      client.transcribeAudio.mockRejectedValueOnce(new Error('Speech transcription failed with status 502'));
      const utils = await summon();
      await advance(STOP_AFTER_SPEECH_MS);
      await waitFor(() => expect(utils.getByTestId('voice-overlay-error-stt')).toBeTruthy());
      expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
    });

    test('no ticks when haptic feedback is off', async () => {
      queryClient.setQueryData(queryKeys.profile(), { language: 'en', haptic_feedback: false });
      await summon();
      await advance(STOP_AFTER_SPEECH_MS);
      await finishSpeaking();
      expect(Haptics.impactAsync).not.toHaveBeenCalled();
      expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    });
  });

  describe('screen readers', () => {
    test('state changes and the reply are announced (VoiceOver) and live (TalkBack)', async () => {
      const utils = await summon();
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Listening…');
      expect(utils.getByTestId('voice-overlay-status').props.accessibilityLiveRegion).toBe('polite');

      await advance(STOP_AFTER_SPEECH_MS);
      await waitFor(() => expect(utils.getByTestId('voice-overlay-reply')).toBeTruthy());
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('One sec…');
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Added ₹20 to Food.');
      expect(utils.getByTestId('voice-overlay-reply').props.accessibilityLiveRegion).toBe('polite');
    });

    test('an error is an assertive alert', async () => {
      client.sendAssistantMessage.mockRejectedValueOnce(new Error('Network request failed'));
      const utils = await summon();
      await advance(STOP_AFTER_SPEECH_MS);

      const card = await utils.findByTestId('voice-overlay-error-network');
      expect(card.props.accessibilityRole).toBe('alert');
      expect(card.props.accessibilityLiveRegion).toBe('assertive');
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
        "Can't reach Pappu. Check your connection."
      );
    });

    test('the overlay traps focus, the mascot is decorative, controls are labelled', async () => {
      const utils = await summon();
      const modal = utils.getByTestId('voice-overlay');
      expect(modal.children[0].props.accessibilityViewIsModal).toBe(true);
      const mascotArea = utils.getByTestId('voice-overlay-mascot-area', hidden);
      expect(mascotArea.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(utils.getByTestId('voice-overlay-close').props.accessibilityLabel).toBe('Close Pappu');
      expect(utils.getByTestId('voice-overlay-scrim').props.accessibilityLabel).toBe('Close Pappu');
    });

    test('touch targets are at least 44dp', async () => {
      client.sendAssistantMessage.mockResolvedValueOnce({
        ...added,
        spoken_text: '',
        results: [],
        mood: 'concerned',
        pending: { id: 'p', kind: 'confirm', question: 'Delete?' },
      });
      const utils = await summon();
      const close = StyleSheet.flatten(utils.getByTestId('voice-overlay-close').props.style);
      expect(close.width).toBeGreaterThanOrEqual(44);
      expect(close.height).toBeGreaterThanOrEqual(44);

      await advance(STOP_AFTER_SPEECH_MS);
      await waitFor(() => expect(utils.getByTestId('voice-overlay-yes')).toBeTruthy());
      ['voice-overlay-yes', 'voice-overlay-no'].forEach((id) => {
        const height = StyleSheet.flatten(utils.getByTestId(id).props.style).height;
        expect(height).toBeGreaterThanOrEqual(44);
      });
    });
  });
});

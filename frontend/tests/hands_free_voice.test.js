import React from 'react';
import { render, act, waitFor, cleanup } from '@testing-library/react-native';
import ConversationLog from '../src/components/ConversationLog';
import { HANDS_FREE } from '../src/components/MicButton';
import * as client from '../src/api/client';
import {
  mockAudioRecorder,
  mockAudioPlayer,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { isMicBusy } from '../src/utils/micActivity';
import { stopAudio } from '../src/utils/audioPlayer';

jest.mock('../src/api/client');

const token = 'mock_jwt_token';
const NO_SPEECH_MSG = 'No speech detected. Please try again.';
const CUE_SOURCE = 1; // jest-expo maps the listen-cue.wav asset to 1

// The recorder reports this level (dBFS) at each elapsed ms since record().
let levelAt;
let recordStartedAt;
// TTS players by data URI, so a test decides when a reply "finishes".
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

async function advance(ms) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function renderHandsFree(autoListen = 1) {
  const utils = await render(<ConversationLog token={token} route={{ params: { autoListen } }} />);
  await act(async () => {});
  return utils;
}

function recordCount() {
  return mockAudioRecorder.record.mock.calls.length;
}

function cuePlays() {
  return createAudioPlayer.mock.calls.filter(([source]) => source === CUE_SOURCE).length;
}

function expectMicReleasedAndIdle(utils) {
  expect(utils.queryByTestId('mic-recording-label')).toBeNull();
  expect(utils.queryByTestId('mic-loading-spinner')).toBeNull();
  expect(utils.getByTestId('mic-button').props.accessibilityLabel).toBe('Start voice recording');
  expect(isMicBusy()).toBe(false);
}

const SPEECH = -20;
const QUIET = -60;
// Talks from 0.4s to 1.5s, quiet afterwards.
const speaksBriefly = (ms) => (ms >= 400 && ms <= 1500 ? SPEECH : QUIET);

describe('Hands-free voice session (pappu://listen)', () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
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
    client.fetchChatHistory.mockResolvedValue({ messages: [] });
    client.fetchActivePending.mockResolvedValue(null);
    client.fetchProfile.mockResolvedValue({ voice_replies: false });
    client.transcribeAudio.mockResolvedValue({ transcript: 'chaya 20' });
    client.synthesizeSpeech.mockResolvedValue({ audio_base64: 'UklGRg==' });
    client.sendAssistantMessage.mockResolvedValue({
      display_text: 'Added ₹20 for Food.',
      spoken_text: 'Added 20 rupees for food.',
      language: 'en',
      results: [],
      pending: null,
      changed: true,
    });
  });

  afterEach(async () => {
    cleanup();
    await stopAudio();
    delete mockAudioRecorder.getStatus;
    mockAudioRecorder.record.mockReset();
    createAudioPlayer.mockImplementation(() => mockAudioPlayer);
    jest.useRealTimers();
  });

  test('plays the start cue after permission and before recording', async () => {
    const order = [];
    requestRecordingPermissionsAsync.mockImplementationOnce(async () => {
      order.push('permission');
      return { status: 'granted', granted: true };
    });
    createAudioPlayer.mockImplementation((source) => {
      if (source === CUE_SOURCE) order.push('cue');
      return mockAudioPlayer;
    });
    mockAudioRecorder.record.mockImplementation(() => {
      order.push('record');
      recordStartedAt = Date.now();
    });

    await renderHandsFree();

    expect(order).toEqual(['permission', 'cue', 'record']);
  });

  test('stops about 1.2s after speech ends and sends it through STT and the assistant', async () => {
    const utils = await renderHandsFree();
    expect(recordCount()).toBe(1);

    await advance(1500 + HANDS_FREE.silenceMs - 300);
    expect(mockAudioRecorder.stop).not.toHaveBeenCalled();

    await advance(500);
    expect(mockAudioRecorder.stop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(client.transcribeAudio).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(client.sendAssistantMessage).toHaveBeenCalledWith(token, {
        text: 'chaya 20',
        input: 'voice',
        client_msg_id: expect.any(String),
      })
    );
    expect(await utils.findByText('Added ₹20 for Food.')).toBeTruthy();
  });

  test('a recording with only silence is discarded at the 8s cap: no STT, mic released, idle', async () => {
    levelAt = () => QUIET;
    const utils = await renderHandsFree();

    await advance(HANDS_FREE.maxMs - 200);
    expect(mockAudioRecorder.stop).not.toHaveBeenCalled();
    await advance(300);

    expect(mockAudioRecorder.stop).toHaveBeenCalledTimes(1);
    expect(await utils.findByText(NO_SPEECH_MSG)).toBeTruthy();
    expect(client.transcribeAudio).not.toHaveBeenCalled();
    expect(client.sendAssistantMessage).not.toHaveBeenCalled();
    expectMicReleasedAndIdle(utils);
    expect(utils.getByTestId('assistant-state-caption').props.children).not.toBe('One sec…');
  });

  test('the start cue tail is not mistaken for speech', async () => {
    levelAt = (ms) => (ms < HANDS_FREE.ignoreMs ? SPEECH : QUIET);
    await renderHandsFree();

    await advance(HANDS_FREE.ignoreMs + HANDS_FREE.silenceMs + 500);
    expect(mockAudioRecorder.stop).not.toHaveBeenCalled();

    await advance(HANDS_FREE.maxMs);
    expect(client.transcribeAudio).not.toHaveBeenCalled();
  });

  test('nonstop speech is cut at the 8s cap and still sent', async () => {
    levelAt = () => SPEECH;
    await renderHandsFree();

    await advance(HANDS_FREE.maxMs + 100);

    expect(mockAudioRecorder.stop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(client.transcribeAudio).toHaveBeenCalledTimes(1));
  });

  test('without meter readings it records to the cap and lets STT decide', async () => {
    mockAudioRecorder.getStatus = jest.fn(() => ({ isRecording: true }));
    await renderHandsFree();

    await advance(HANDS_FREE.maxMs + 100);

    expect(mockAudioRecorder.stop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(client.transcribeAudio).toHaveBeenCalledTimes(1));
  });

  test('an STT failure returns to idle with the mic released and no re-listen', async () => {
    client.transcribeAudio.mockRejectedValueOnce(new Error('Speech transcription failed with status 502'));
    const utils = await renderHandsFree();

    await advance(3000);

    expect(await utils.findByText('Speech transcription failed with status 502')).toBeTruthy();
    expectMicReleasedAndIdle(utils);
    expect(client.sendAssistantMessage).not.toHaveBeenCalled();
    await advance(5000);
    expect(recordCount()).toBe(1);
  });

  test('an assistant request failure returns to idle with the mic released and no re-listen', async () => {
    client.sendAssistantMessage.mockRejectedValueOnce(new Error('Network request failed'));
    const utils = await renderHandsFree();

    await advance(3000);

    expect(await utils.findByText('Error: Network request failed')).toBeTruthy();
    expectMicReleasedAndIdle(utils);
    expect(client.synthesizeSpeech).not.toHaveBeenCalled();
    await advance(HANDS_FREE.maxMs);
    expect(recordCount()).toBe(1);
  });

  test('closing the assistant mid-recording stops the recorder and frees the mic', async () => {
    levelAt = () => SPEECH;
    const utils = await renderHandsFree();
    expect(utils.getByTestId('mic-recording-label')).toBeTruthy();
    expect(isMicBusy()).toBe(true);

    await act(async () => utils.unmount());

    expect(mockAudioRecorder.stop).toHaveBeenCalledTimes(1);
    expect(isMicBusy()).toBe(false);
    await advance(HANDS_FREE.maxMs + 500);
    expect(client.transcribeAudio).not.toHaveBeenCalled();
  });

  test('speaks the reply in its language even with voice replies off', async () => {
    client.transcribeAudio.mockResolvedValueOnce({ transcript: 'ചായ 20 രൂപ' });
    client.sendAssistantMessage.mockResolvedValueOnce({
      display_text: 'ചായ ₹20 ചേർത്തു.',
      spoken_text: 'ചായ ഇരുപത് രൂപ ചേർത്തു.',
      language: 'ml',
      results: [],
      pending: null,
      changed: true,
    });
    await renderHandsFree();

    await advance(3000);

    await waitFor(() =>
      expect(client.synthesizeSpeech).toHaveBeenCalledWith(token, 'ചായ ഇരുപത് രൂപ ചേർത്തു.', 'ml-IN')
    );
    expect(client.fetchProfile).not.toHaveBeenCalled();
  });

  test('a tapped recording still respects voice replies off (no forced speech, no auto stop)', async () => {
    const utils = await render(<ConversationLog token={token} />);
    const { fireEvent } = require('@testing-library/react-native');

    await fireEvent.press(await utils.findByTestId('mic-button'));
    expect(await utils.findByTestId('mic-recording-label')).toBeTruthy();
    await advance(HANDS_FREE.maxMs + 1000);
    expect(mockAudioRecorder.stop).not.toHaveBeenCalled();
    expect(cuePlays()).toBe(0);

    await fireEvent.press(utils.getByTestId('mic-button'));
    await waitFor(() => expect(client.sendAssistantMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(client.fetchProfile).toHaveBeenCalled());
    await act(async () => {});
    expect(client.synthesizeSpeech).not.toHaveBeenCalled();
  });

  describe('confirmation by voice', () => {
    const pendingReply = {
      display_text: 'Delete Food ₹20 on 7 Nov?',
      spoken_text: 'Delete food 20 rupees on 7 November?',
      language: 'en',
      results: [],
      pending: { id: 'p-1', kind: 'confirm', question: 'Delete Food ₹20 on 7 Nov?' },
      changed: false,
    };
    const doneReply = {
      display_text: 'Deleted Food ₹20.',
      spoken_text: 'Deleted food 20 rupees.',
      language: 'en',
      results: [],
      pending: null,
      changed: true,
    };

    async function finishSpeaking() {
      await waitFor(() => expect(Object.keys(ttsPlayers).length).toBeGreaterThan(0));
      await act(async () => {
        Object.values(ttsPlayers).forEach((p) => p.finish());
      });
      ttsPlayers = {};
    }

    test('listens once more after the reply finishes and sends the spoken answer', async () => {
      client.transcribeAudio
        .mockResolvedValueOnce({ transcript: 'innalathe chaya delete cheyyu' })
        .mockResolvedValueOnce({ transcript: 'sheri' });
      client.sendAssistantMessage.mockResolvedValueOnce(pendingReply).mockResolvedValueOnce(doneReply);
      const utils = await renderHandsFree();

      await advance(3000);
      await waitFor(() => expect(client.synthesizeSpeech).toHaveBeenCalledTimes(1));
      // Still speaking the question: the mic must not open yet.
      await advance(2000);
      expect(recordCount()).toBe(1);

      await finishSpeaking();
      await waitFor(() => expect(recordCount()).toBe(2));
      expect(cuePlays()).toBe(2);

      await advance(3000);
      await waitFor(() => expect(client.sendAssistantMessage).toHaveBeenCalledTimes(2));
      const [first, second] = client.sendAssistantMessage.mock.calls.map(([, body]) => body);
      expect(second).toEqual({ text: 'sheri', input: 'voice', client_msg_id: expect.any(String) });
      expect(second.client_msg_id).not.toBe(first.client_msg_id);
      expect(await utils.findByText('Deleted Food ₹20.')).toBeTruthy();

      await finishSpeaking();
      await advance(HANDS_FREE.maxMs);
      expect(recordCount()).toBe(2);
    });

    test('listens only once: a second pending reply waits for a tap', async () => {
      client.transcribeAudio
        .mockResolvedValueOnce({ transcript: 'delete chaya' })
        .mockResolvedValueOnce({ transcript: 'which one' });
      client.sendAssistantMessage
        .mockResolvedValueOnce(pendingReply)
        .mockResolvedValueOnce({ ...pendingReply, pending: { ...pendingReply.pending, id: 'p-2' } });
      await renderHandsFree();

      await advance(3000);
      await finishSpeaking();
      await waitFor(() => expect(recordCount()).toBe(2));
      await advance(3000);
      await waitFor(() => expect(client.sendAssistantMessage).toHaveBeenCalledTimes(2));
      await finishSpeaking();

      await advance(HANDS_FREE.maxMs);
      expect(recordCount()).toBe(2);
    });

    test('silence on the re-listen is discarded and leaves the card for a tap', async () => {
      client.transcribeAudio.mockResolvedValueOnce({ transcript: 'delete chaya' });
      client.sendAssistantMessage.mockResolvedValueOnce(pendingReply);
      const utils = await renderHandsFree();

      await advance(3000);
      await finishSpeaking();
      await waitFor(() => expect(recordCount()).toBe(2));
      levelAt = () => QUIET;
      await advance(HANDS_FREE.maxMs + 200);

      expect(client.transcribeAudio).toHaveBeenCalledTimes(1);
      expect(client.sendAssistantMessage).toHaveBeenCalledTimes(1);
      expect(await utils.findByText(NO_SPEECH_MSG)).toBeTruthy();
      expectMicReleasedAndIdle(utils);
      expect(utils.getByText('Delete Food ₹20 on 7 Nov?')).toBeTruthy();
    });
  });
});

/**
 * Me → Voice replies gates automatic TTS playback.
 * Off: replies are not spoken on their own (assistant modal and voice sheet), but the
 * speaker button on a message still plays. On or unknown: replies are spoken.
 */

global.IS_REACT_ACT_ENVIRONMENT = true;
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';

import ConversationLog from '../src/components/ConversationLog';
import VoiceListeningSheet from '../src/components/ui/VoiceListeningSheet';
import MeScreen from '../src/screens/MeScreen';
import * as client from '../src/api/client';
import * as audioPlayer from '../src/utils/audioPlayer';
import { queryClient } from '../src/data/queryClient';
import { queryKeys } from '../src/data/queryKeys';
import { voiceRepliesEnabled } from '../src/utils/voiceReplies';

jest.mock('../src/api/client');
jest.mock('../src/api/supabase');
jest.mock('../src/utils/audioPlayer');
jest.mock('../src/utils/reduceMotion', () => ({
  useReduceMotion: () => true,
}));

const TOKEN = 'mock_jwt_token_voice_replies';
const REPLY = {
  reply_text: 'Added ₹250 to Food.',
  spoken_text: 'Added ₹250 to Food.',
  language: 'en',
  language_code: 'en-IN',
  results: [{ ok: true, action: 'add' }],
  pending: null,
  changed: true,
  mood: 'happy',
};

function setVoiceReplies(value) {
  queryClient.setQueryData(queryKeys.profile(), { name: 'Tester', language: 'en', voice_replies: value });
}

async function sendInAssistant(text = 'Spent 250 on lunch') {
  await render(<ConversationLog token={TOKEN} onTransactionMutated={jest.fn()} />);
  await fireEvent.changeText(await screen.findByTestId('conversation-input'), text);
  await fireEvent.press(await screen.findByTestId('conversation-send-button'));
  expect(await screen.findByText('Added ₹250 to Food.')).toBeTruthy();
}

async function sendInVoiceSheet(text = 'Spent 250 on lunch') {
  await render(<VoiceListeningSheet visible token={TOKEN} onClose={jest.fn()} onTransactionMutated={jest.fn()} />);
  await fireEvent.changeText(await screen.findByTestId('voice-fallback-input'), text);
  await fireEvent.press(screen.getByTestId('voice-fallback-send'));
  expect(await screen.findByText('Added ₹250 to Food.')).toBeTruthy();
}

describe('Voice replies preference', () => {
  jest.setTimeout(15000);

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    client.fetchProfile.mockResolvedValue(null);
    client.sendAssistantMessage.mockResolvedValue(REPLY);
    client.fetchChatHistory.mockResolvedValue({ messages: [] });
    client.fetchActivePending.mockResolvedValue(null);
    client.synthesizeSpeech.mockResolvedValue({ audio_base64: 'QUJD', language_code: 'en-IN' });
    audioPlayer.playAudioBase64.mockResolvedValue({});
    audioPlayer.stopAudio.mockResolvedValue();
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  afterAll(() => {
    // The shared client holds gc timers; clear them so Jest can exit.
    queryClient.clear();
  });

  test('assistant does not speak a reply when voice replies is off', async () => {
    setVoiceReplies(false);
    await sendInAssistant();
    // Let any pending playback promise settle before asserting it never happened.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(client.synthesizeSpeech).not.toHaveBeenCalled();
    expect(audioPlayer.playAudioBase64).not.toHaveBeenCalled();
  });

  test('the speaker button still plays when voice replies is off', async () => {
    setVoiceReplies(false);
    await sendInAssistant();
    const replay = await screen.findAllByTestId(/^tts-replay-button-msg-bubble-/);
    await fireEvent.press(replay[replay.length - 1]);
    await waitFor(() =>
      expect(client.synthesizeSpeech).toHaveBeenCalledWith(TOKEN, 'Added ₹250 to Food.', 'en-IN')
    );
  });

  test('assistant speaks a reply when voice replies is on', async () => {
    setVoiceReplies(true);
    await sendInAssistant();
    await waitFor(() =>
      expect(client.synthesizeSpeech).toHaveBeenCalledWith(TOKEN, 'Added ₹250 to Food.', 'en-IN')
    );
    expect(audioPlayer.playAudioBase64).toHaveBeenCalledWith('QUJD');
  });

  test('voice sheet does not speak a reply when voice replies is off', async () => {
    setVoiceReplies(false);
    await sendInVoiceSheet();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(client.synthesizeSpeech).not.toHaveBeenCalled();
  });

  test('voice sheet speaks a reply when voice replies is on', async () => {
    setVoiceReplies(true);
    await sendInVoiceSheet();
    await waitFor(() =>
      expect(client.synthesizeSpeech).toHaveBeenCalledWith(TOKEN, 'Added ₹250 to Food.', 'en-IN')
    );
  });

  test('turning the Me toggle off updates the cache the assistant reads', async () => {
    const profile = { name: 'Tester', email: 't@pappu.dev', language: 'en', voice_replies: true };
    client.fetchProfile.mockResolvedValue(profile);
    client.patchProfile.mockResolvedValue({ ...profile, voice_replies: false });
    client.fetchBudgets.mockResolvedValue({ month: '2026-11', budgets: [], categories: [] });

    await render(
      <QueryClientProvider client={queryClient}>
        <MeScreen token={TOKEN} />
      </QueryClientProvider>
    );
    await screen.findByText('Tester');
    expect(await voiceRepliesEnabled(TOKEN)).toBe(true);

    client.fetchProfile.mockResolvedValue({ ...profile, voice_replies: false });
    await fireEvent.press(screen.getByTestId('voice-replies-toggle'));
    await waitFor(() => expect(client.patchProfile).toHaveBeenCalledWith(TOKEN, { voice_replies: false }));
    await waitFor(async () => expect(await voiceRepliesEnabled(TOKEN)).toBe(false));
  });

  test('fetches the profile when it is not cached, and speaks if that fails', async () => {
    client.fetchProfile.mockResolvedValueOnce({ voice_replies: false });
    expect(await voiceRepliesEnabled(TOKEN)).toBe(false);
    expect(client.fetchProfile).toHaveBeenCalledWith(TOKEN);

    client.fetchProfile.mockRejectedValueOnce(new Error('Network request failed'));
    expect(await voiceRepliesEnabled(TOKEN)).toBe(true);
    expect(client.fetchProfile).toHaveBeenCalledTimes(2); // one call each, no retry delaying the reply
  });

  test('uses the cached profile without fetching', async () => {
    setVoiceReplies(false);
    expect(await voiceRepliesEnabled(TOKEN)).toBe(false);
    expect(client.fetchProfile).not.toHaveBeenCalled();
  });
});

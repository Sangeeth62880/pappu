import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ConversationLog from '../src/components/ConversationLog';
import VoiceListeningSheet from '../src/components/ui/VoiceListeningSheet';
import { ttsLanguageCode } from '../src/utils/ttsLanguage';
import * as client from '../src/api/client';
import * as audioPlayer from '../src/utils/audioPlayer';

jest.mock('../src/api/client');
jest.mock('../src/utils/audioPlayer');

const mockToken = 'mock_jwt_token';
const mockAudio = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

const mlResponse = {
  reply_text: 'ഭക്ഷണം വിഭാഗത്തിൽ ₹250 ചേർത്തു.',
  spoken_text: 'ഭക്ഷണം വിഭാഗത്തിൽ 250 രൂപ ചേർത്തു.',
  language: 'ml',
  language_code: 'ml-IN',
  results: [],
  pending: null,
  changed: false,
};

describe('ttsLanguageCode', () => {
  test('prefers the response language_code', () => {
    expect(ttsLanguageCode({ language_code: 'ml-IN', language: 'en' })).toBe('ml-IN');
    expect(ttsLanguageCode({ language_code: 'en-IN', language: 'ml' })).toBe('en-IN');
  });

  test('falls back to the reply language', () => {
    expect(ttsLanguageCode({ language: 'ml' })).toBe('ml-IN');
    expect(ttsLanguageCode({ language: 'en' })).toBe('en-IN');
  });

  test('accepts plain codes and defaults to English', () => {
    expect(ttsLanguageCode('ml-IN')).toBe('ml-IN');
    expect(ttsLanguageCode('ml')).toBe('ml-IN');
    expect(ttsLanguageCode('mixed')).toBe('en-IN');
    expect(ttsLanguageCode(undefined)).toBe('en-IN');
    expect(ttsLanguageCode({})).toBe('en-IN');
  });
});

describe('Reply language reaches TTS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    audioPlayer.playAudioBase64.mockResolvedValue({});
    audioPlayer.stopAudio.mockResolvedValue();
    client.synthesizeSpeech.mockResolvedValue({ audio_base64: mockAudio, language_code: 'ml-IN' });
  });

  test('ConversationLog speaks and replays a Malayalam reply with ml-IN', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce(mlResponse);

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} onTransactionMutated={jest.fn()} />
    );

    fireEvent.changeText(await findByTestId('conversation-input'), 'ഊണിന് 250 രൂപ ചെലവായി');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByText(mlResponse.reply_text)).toBeTruthy();
    await waitFor(() => {
      expect(client.synthesizeSpeech).toHaveBeenCalledWith(mockToken, mlResponse.spoken_text, 'ml-IN');
    });

    client.synthesizeSpeech.mockClear();
    fireEvent.press(await findByTestId('tts-replay-button-msg-bubble-1'));
    await waitFor(() => {
      expect(client.synthesizeSpeech).toHaveBeenCalledWith(mockToken, mlResponse.spoken_text, 'ml-IN');
    });
  });

  test('ConversationLog replays a Malayalam message from chat history with ml-IN', async () => {
    client.fetchChatHistory.mockResolvedValueOnce({
      messages: [
        {
          id: 'h1',
          role: 'assistant',
          text: mlResponse.reply_text,
          payload: { spoken_text: mlResponse.spoken_text, language: 'ml', language_code: 'ml-IN' },
        },
      ],
      total: 1,
    });

    const { findByTestId } = await render(<ConversationLog token={mockToken} />);

    fireEvent.press(await findByTestId('tts-replay-button-msg-bubble-0'));
    await waitFor(() => {
      expect(client.synthesizeSpeech).toHaveBeenCalledWith(mockToken, mlResponse.spoken_text, 'ml-IN');
    });
  });

  test('VoiceListeningSheet speaks a Malayalam reply with ml-IN', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce(mlResponse);

    const { findByTestId } = await render(
      <VoiceListeningSheet visible={true} onClose={jest.fn()} token={mockToken} />
    );

    fireEvent.changeText(await findByTestId('voice-fallback-input'), 'ഊണിന് 250 രൂപ ചെലവായി');
    fireEvent.press(await findByTestId('voice-fallback-send'));

    await waitFor(() => {
      expect(client.synthesizeSpeech).toHaveBeenCalledWith(mockToken, mlResponse.spoken_text, 'ml-IN');
    });
  });

  test('VoiceListeningSheet keeps en-IN for an English reply', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      ...mlResponse,
      reply_text: 'Added ₹250 to Food.',
      spoken_text: 'Added ₹250 to Food.',
      language: 'en',
      language_code: 'en-IN',
    });

    const { findByTestId } = await render(
      <VoiceListeningSheet visible={true} onClose={jest.fn()} token={mockToken} />
    );

    fireEvent.changeText(await findByTestId('voice-fallback-input'), 'Spent 250 on lunch');
    fireEvent.press(await findByTestId('voice-fallback-send'));

    await waitFor(() => {
      expect(client.synthesizeSpeech).toHaveBeenCalledWith(mockToken, 'Added ₹250 to Food.', 'en-IN');
    });
  });
});

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ConversationLog from '../src/components/ConversationLog';
import MessageBubble from '../src/components/ui/MessageBubble';
import * as client from '../src/api/client';
import * as audioPlayer from '../src/utils/audioPlayer';

jest.mock('../src/api/client');
jest.mock('../src/utils/audioPlayer');

describe('Text-to-Speech (TTS) Integration', () => {
  const mockToken = 'mock_jwt_token';
  const mockAudioBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

  beforeEach(() => {
    jest.clearAllMocks();
    audioPlayer.playAudioBase64.mockResolvedValue({});
    audioPlayer.stopAudio.mockResolvedValue();
  });

  test('synthesizeSpeech calls POST /tts/synthesize with target language', async () => {
    client.synthesizeSpeech.mockResolvedValueOnce({
      audio_base64: mockAudioBase64,
      language_code: 'ml-IN',
      audio_format: 'audio/wav',
    });

    const res = await client.synthesizeSpeech(mockToken, '500 രൂപ ചിലവായി', 'ml-IN');
    expect(client.synthesizeSpeech).toHaveBeenCalledWith(mockToken, '500 രൂപ ചിലവായി', 'ml-IN');
    expect(res.audio_base64).toBe(mockAudioBase64);
  });

  test('when transaction is executed, ConversationLog synthesizes and plays speech', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      display_text: 'Added Food transaction for ₹500.',
      spoken_text: 'Added Food transaction for ₹500.',
      results: [{ kind: 'added', amount: 500 }],
      pending: null,
      changed: true,
    });

    client.synthesizeSpeech.mockResolvedValueOnce({
      audio_base64: mockAudioBase64,
      language_code: 'en-IN',
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} onTransactionMutated={jest.fn()} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'I spent 500 on food');
    const sendBtn = await findByTestId('conversation-send-button');
    fireEvent.press(sendBtn);

    expect(await findByText('Added Food transaction for ₹500.')).toBeTruthy();

    await waitFor(() => {
      expect(client.synthesizeSpeech).toHaveBeenCalledWith(
        mockToken,
        'Added Food transaction for ₹500.',
        'en-IN'
      );
      expect(audioPlayer.playAudioBase64).toHaveBeenCalledWith(mockAudioBase64);
    });
  });

  test('MessageBubble renders replay audio button and triggers playback on press', async () => {
    const onPlayAudio = jest.fn();
    const { findByTestId } = await render(
      <MessageBubble
        text="Added Food transaction for ₹500."
        sender="pappu"
        hasAudio={true}
        onPlayAudio={onPlayAudio}
        testID="msg-1"
      />
    );

    const replayBtn = await findByTestId('tts-replay-button-msg-1');
    expect(replayBtn).toBeTruthy();
    fireEvent.press(replayBtn);
    expect(onPlayAudio).toHaveBeenCalledTimes(1);
  });
});

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import VoiceListeningSheet from '../src/components/ui/VoiceListeningSheet';
import ConversationLog from '../src/components/ConversationLog';
import * as client from '../src/api/client';
import { requestRecordingPermissionsAsync } from 'expo-audio';

jest.mock('../src/api/client');

const token = 'mock_jwt_token';
const PERMISSION_MSG = 'Microphone permission is required to record voice commands.';

// Each case: how to make the attempt fail, and the message the user should see.
const failures = [
  {
    name: 'permission denied',
    arrange: () =>
      requestRecordingPermissionsAsync.mockResolvedValueOnce({ status: 'denied', granted: false }),
    stops: false,
    message: PERMISSION_MSG,
  },
  {
    name: 'STT failure',
    arrange: () =>
      client.transcribeAudio.mockRejectedValueOnce(
        new Error('Speech transcription failed with status 502')
      ),
    stops: true,
    message: 'Speech transcription failed with status 502',
  },
  {
    name: 'empty transcript',
    arrange: () => client.transcribeAudio.mockResolvedValueOnce({ transcript: '   ' }),
    stops: true,
    message: 'No speech detected. Please try again.',
  },
  {
    name: 'network drop during upload',
    arrange: () => client.transcribeAudio.mockRejectedValueOnce(new Error('Network request failed')),
    stops: true,
    message: 'Network request failed',
  },
];

async function runAttempt(utils, stops) {
  const micBtn = await utils.findByTestId('mic-button');
  await fireEvent.press(micBtn);
  if (stops) {
    expect(await utils.findByTestId('mic-recording-label')).toBeTruthy();
    await fireEvent.press(micBtn);
  }
}

function expectMicIdle(utils) {
  expect(utils.queryByTestId('mic-recording-label')).toBeNull();
  expect(utils.queryByTestId('mic-loading-spinner')).toBeNull();
  expect(utils.getByTestId('mic-button').props.accessibilityLabel).toBe('Start voice recording');
}

describe('Voice failures show a message and return to idle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestRecordingPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
  });

  describe.each(failures)('$name', ({ arrange, stops, message }) => {
    test('in the assistant screen, the mascot does not stay on "thinking"', async () => {
      arrange();
      const utils = await render(<ConversationLog token={token} />);
      const idleCaption = (await utils.findByTestId('assistant-state-caption')).props.children;

      await runAttempt(utils, stops);

      expect(await utils.findByText(message)).toBeTruthy();
      await waitFor(() => {
        expect(utils.getByTestId('assistant-state-caption').props.children).toBe(idleCaption);
      });
      expectMicIdle(utils);
      expect(client.sendAssistantMessage).not.toHaveBeenCalled();
    });

    test('in the voice sheet, nothing is left spinning', async () => {
      arrange();
      const utils = await render(
        <VoiceListeningSheet visible={true} onClose={jest.fn()} token={token} />
      );

      await runAttempt(utils, stops);

      expect(await utils.findByText(message)).toBeTruthy();
      await waitFor(() => expectMicIdle(utils));
      expect(utils.queryByText('Pappu is thinking')).toBeNull();
      expect(utils.getByTestId('voice-status-text').props.children).toBe(
        'Tap the microphone to speak'
      );
      expect(client.sendAssistantMessage).not.toHaveBeenCalled();
    });
  });
});

describe('A TTS failure never blocks the text reply', () => {
  const reply = {
    display_text: 'Added Food for ₹350.',
    spoken_text: 'Added Food for ₹350.',
    language_code: 'en-IN',
    results: [],
    pending: null,
    changed: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client.sendAssistantMessage.mockResolvedValueOnce(reply);
    client.synthesizeSpeech.mockRejectedValueOnce(new Error('TTS service unavailable'));
  });

  test('voice sheet shows the reply and returns to idle', async () => {
    const { findByTestId, findByText, queryByText } = await render(
      <VoiceListeningSheet visible={true} onClose={jest.fn()} token={token} />
    );
    await fireEvent.changeText(await findByTestId('voice-fallback-input'), 'Dinner 350');
    await fireEvent.press(await findByTestId('voice-fallback-send'));

    expect(await findByText('Added Food for ₹350.')).toBeTruthy();
    await waitFor(() => expect(client.synthesizeSpeech).toHaveBeenCalled());
    expect(queryByText('Pappu is thinking')).toBeNull();
  });

  test('assistant screen shows the reply and leaves "speaking"', async () => {
    const { findByTestId, findByText, getByTestId } = await render(
      <ConversationLog token={token} />
    );
    const idleCaption = (await findByTestId('assistant-state-caption')).props.children;
    await fireEvent.changeText(await findByTestId('conversation-input'), 'Dinner 350');
    await fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByText('Added Food for ₹350.')).toBeTruthy();
    await waitFor(() => expect(client.synthesizeSpeech).toHaveBeenCalled());
    await waitFor(() => {
      expect(getByTestId('assistant-state-caption').props.children).toBe(idleCaption);
    });
  });
});

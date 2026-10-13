import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import MicButton from '../src/components/MicButton';
import ConversationLog from '../src/components/ConversationLog';
import * as client from '../src/api/client';
import { requestRecordingPermissionsAsync } from 'expo-audio';

jest.mock('../src/api/client');

describe('MicButton & Voice Input Integration', () => {
  const mockToken = 'mock_jwt_token';

  beforeEach(() => {
    jest.clearAllMocks();
    requestRecordingPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
  });

  test('renders in idle state with mic icon and accessibility label', async () => {
    const { findByTestId } = await render(
      <MicButton token={mockToken} onTranscribed={jest.fn()} />
    );

    const micBtn = await findByTestId('mic-button');
    const micIcon = await findByTestId('mic-icon');
    expect(micBtn).toBeTruthy();
    expect(micIcon).toBeTruthy();
    expect(micBtn.props.accessibilityLabel).toBe('Start voice recording');
  });

  test('pressing mic button toggles to recording state with pulse ring and stop icon', async () => {
    const { findByTestId, findByText } = await render(
      <MicButton token={mockToken} onTranscribed={jest.fn()} />
    );

    const micBtn = await findByTestId('mic-button');
    fireEvent.press(micBtn);

    expect(await findByText('Listening...')).toBeTruthy();
    expect(await findByTestId('mic-pulse-ring')).toBeTruthy();
    const stopIcon = await findByTestId('mic-icon');
    expect(stopIcon).toBeTruthy();
    expect(micBtn.props.accessibilityLabel).toBe('Stop recording');
  });

  test('stopping recording triggers transcribeAudio with real file URI object and onTranscribed callback', async () => {
    const mockOnTranscribed = jest.fn();
    client.transcribeAudio.mockResolvedValueOnce({
      transcript: 'I spent 300 on transport today',
      language_code: 'en-IN',
    });

    const { findByTestId, findByText, queryByTestId } = await render(
      <MicButton token={mockToken} onTranscribed={mockOnTranscribed} />
    );

    const micBtn = await findByTestId('mic-button');

    // Start recording
    fireEvent.press(micBtn);
    expect(await findByText('Listening...')).toBeTruthy();

    // Stop recording
    fireEvent.press(micBtn);

    await waitFor(() => {
      expect(client.transcribeAudio).toHaveBeenCalledWith(
        mockToken,
        expect.objectContaining({
          uri: 'file:///local/cache/recording.m4a',
          name: 'recording.m4a',
          type: 'audio/m4a',
        }),
        null
      );
      // Ensure mock:// string is never passed
      expect(client.transcribeAudio).not.toHaveBeenCalledWith(
        mockToken,
        expect.objectContaining({ uri: 'mock://audio.wav' }),
        null
      );
      expect(mockOnTranscribed).toHaveBeenCalledWith('I spent 300 on transport today');
    });

    await waitFor(() => {
      expect(queryByTestId('mic-loading-spinner')).toBeNull();
      expect(queryByTestId('mic-recording-label')).toBeNull();
    });
  });

  test('displays error message when mic permission is denied', async () => {
    requestRecordingPermissionsAsync.mockResolvedValueOnce({ status: 'denied', granted: false });

    const { findByTestId, findByText, queryByTestId } = await render(
      <MicButton token={mockToken} onTranscribed={jest.fn()} />
    );

    const micBtn = await findByTestId('mic-button');
    fireEvent.press(micBtn);

    expect(await findByText('Microphone permission is required to record voice commands.')).toBeTruthy();
    expect(client.transcribeAudio).not.toHaveBeenCalled();
    expect(queryByTestId('mic-recording-label')).toBeNull();
  });

  test('displays error message when transcribeAudio fails', async () => {
    client.transcribeAudio.mockRejectedValueOnce(new Error('Audio connection failed'));

    const { findByTestId, findByText, queryByTestId } = await render(
      <MicButton token={mockToken} onTranscribed={jest.fn()} />
    );

    const micBtn = await findByTestId('mic-button');
    fireEvent.press(micBtn); // start
    expect(await findByText('Listening...')).toBeTruthy();

    fireEvent.press(micBtn); // stop

    expect(await findByText('Audio connection failed')).toBeTruthy();
    await waitFor(() => {
      expect(queryByTestId('mic-loading-spinner')).toBeNull();
    });
  });

  test('voice input transcribed text seamlessly flows into ConversationLog pipeline', async () => {
    const mockOnMutated = jest.fn();

    // 1. Mock STT transcription
    client.transcribeAudio.mockResolvedValueOnce({
      transcript: 'I spent 400 on shopping',
      language_code: 'en-IN',
    });

    // 2. Mock Intent Parsing
    client.parseIntent.mockResolvedValueOnce({
      intent: {
        action: 'add',
        language: 'en',
        fields: { amount: 400, category: 'Shopping' },
        matched_transactions: [],
        confidence: 'high',
        requires_confirmation: false,
        missing_fields: [],
      },
    });

    // 3. Mock Intent Routing & Execution
    client.routeIntent.mockResolvedValueOnce({
      decision: 'EXECUTE',
      action: 'add',
      confidence: 'high',
      execution_result: {
        status: 'created',
        transaction: { id: 'txn-voice-1', amount: 400, category_name: 'Shopping' },
      },
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} onTransactionMutated={mockOnMutated} />
    );

    // Trigger voice recording and transcription via embedded MicButton
    const micBtn = await findByTestId('mic-button');
    fireEvent.press(micBtn); // start
    expect(await findByText('Listening...')).toBeTruthy();

    fireEvent.press(micBtn); // stop

    // Verify speech-derived text rendered in conversation log
    expect(await findByText('I spent 400 on shopping')).toBeTruthy();
    expect(await findByText('Added Shopping transaction for ₹400.')).toBeTruthy();

    await waitFor(() => {
      expect(client.parseIntent).toHaveBeenCalledWith(mockToken, 'I spent 400 on shopping');
      expect(client.routeIntent).toHaveBeenCalled();
      expect(mockOnMutated).toHaveBeenCalledTimes(1);
    });
  });
});

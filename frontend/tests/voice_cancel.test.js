import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import VoiceListeningSheet from '../src/components/ui/VoiceListeningSheet';
import ConversationLog from '../src/components/ConversationLog';
import * as client from '../src/api/client';
import { requestRecordingPermissionsAsync, mockAudioRecorder } from 'expo-audio';

jest.mock('../src/api/client');

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const token = 'mock_jwt_token';

describe('Closing the voice UI discards the recording', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestRecordingPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
  });

  test('closing the sheet mid-recording stops the recorder and sends nothing', async () => {
    const onClose = jest.fn();
    const { findByTestId, queryByTestId, rerender } = await render(
      <VoiceListeningSheet visible={true} onClose={onClose} token={token} />
    );

    await fireEvent.press(await findByTestId('mic-button'));
    expect(await findByTestId('mic-recording-label')).toBeTruthy();

    await rerender(<VoiceListeningSheet visible={false} onClose={onClose} token={token} />);
    await waitFor(() => expect(queryByTestId('mic-button')).toBeNull());

    expect(mockAudioRecorder.stop).toHaveBeenCalled();
    expect(client.transcribeAudio).not.toHaveBeenCalled();
    expect(client.sendAssistantMessage).not.toHaveBeenCalled();
  });

  test('closing the sheet while the transcription is in flight sends nothing', async () => {
    const stt = deferred();
    client.transcribeAudio.mockImplementationOnce(() => stt.promise);
    const onClose = jest.fn();

    const { findByTestId, queryByTestId, rerender } = await render(
      <VoiceListeningSheet visible={true} onClose={onClose} token={token} />
    );
    const micBtn = await findByTestId('mic-button');
    await fireEvent.press(micBtn);
    expect(await findByTestId('mic-recording-label')).toBeTruthy();
    await fireEvent.press(micBtn);
    await waitFor(() => expect(client.transcribeAudio).toHaveBeenCalled());

    await rerender(<VoiceListeningSheet visible={false} onClose={onClose} token={token} />);
    // The transcript lands while the sheet is still animating closed.
    await act(async () => {
      stt.resolve({ transcript: 'spent 200 on lunch' });
    });
    await waitFor(() => expect(queryByTestId('mic-button')).toBeNull());

    expect(client.sendAssistantMessage).not.toHaveBeenCalled();
  });

  test('closing the assistant mid-transcription sends nothing', async () => {
    const stt = deferred();
    client.transcribeAudio.mockImplementationOnce(() => stt.promise);

    const { findByTestId, unmount } = await render(
      <ConversationLog token={token} />
    );
    const micBtn = await findByTestId('mic-button');
    await fireEvent.press(micBtn);
    expect(await findByTestId('mic-recording-label')).toBeTruthy();
    await fireEvent.press(micBtn);
    await waitFor(() => expect(client.transcribeAudio).toHaveBeenCalled());

    await unmount();
    await act(async () => {
      stt.resolve({ transcript: 'spent 200 on lunch' });
    });

    expect(client.sendAssistantMessage).not.toHaveBeenCalled();
  });
});

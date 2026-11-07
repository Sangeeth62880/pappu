import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import MicButton from '../src/components/MicButton';
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

describe('MicButton start guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestRecordingPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
  });

  test('a second tap while the recorder is starting is ignored', async () => {
    const permission = deferred();
    requestRecordingPermissionsAsync.mockImplementationOnce(() => permission.promise);

    const { findByTestId, findByText } = await render(
      <MicButton token="t" onTranscribed={jest.fn()} />
    );
    const micBtn = await findByTestId('mic-button');

    await fireEvent.press(micBtn);
    await fireEvent.press(micBtn);

    await act(async () => {
      permission.resolve({ status: 'granted', granted: true });
    });

    expect(await findByText('Listening...')).toBeTruthy();
    expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockAudioRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1);
  });

  test('unmounting while the recorder is starting never starts recording', async () => {
    const permission = deferred();
    requestRecordingPermissionsAsync.mockImplementationOnce(() => permission.promise);

    const { findByTestId, unmount } = await render(
      <MicButton token="t" onTranscribed={jest.fn()} />
    );
    await fireEvent.press(await findByTestId('mic-button'));

    await unmount();
    await act(async () => {
      permission.resolve({ status: 'granted', granted: true });
    });

    expect(mockAudioRecorder.record).not.toHaveBeenCalled();
    expect(client.transcribeAudio).not.toHaveBeenCalled();
  });
});

import React, { useImperativeHandle, forwardRef } from 'react';
import { render, act } from '@testing-library/react-native';
import { mockAudioRecorder, requestRecordingPermissionsAsync } from 'expo-audio';
import * as client from '../src/api/client';
import { useVoiceRecorder, HANDS_FREE, RECORDER_ERRORS } from '../src/utils/useVoiceRecorder';
import { isMicBusy } from '../src/utils/micActivity';

jest.mock('../src/api/client');

const Harness = forwardRef((props, ref) => {
  const recorder = useVoiceRecorder({ token: 't', ...props });
  useImperativeHandle(ref, () => recorder);
  return null;
});

let level;
let startedAt;

async function setup(props = {}) {
  const ref = React.createRef();
  const handlers = { onTranscribed: jest.fn(), onError: jest.fn(), onLevel: jest.fn(), ...props };
  await render(<Harness ref={ref} {...handlers} />);
  return { ref, ...handlers };
}

describe('useVoiceRecorder', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    level = -60;
    mockAudioRecorder.record.mockImplementation(() => {
      startedAt = Date.now();
    });
    mockAudioRecorder.getStatus = jest.fn(() => ({ isRecording: true, metering: level }));
    requestRecordingPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    client.transcribeAudio.mockResolvedValue({ transcript: 'chaya 20' });
  });
  afterEach(() => {
    delete mockAudioRecorder.getStatus;
    mockAudioRecorder.record.mockReset();
    jest.useRealTimers();
  });

  test('reports each meter reading of a hands-free recording to onLevel', async () => {
    const { ref, onLevel } = await setup();
    await act(async () => ref.current.start({ auto: true }));
    level = -22;
    await act(async () => jest.advanceTimersByTime(HANDS_FREE.pollMs * 3));
    expect(onLevel).toHaveBeenCalledWith(-22);
    expect(onLevel.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  test('cancel drops the audio silently: no STT, no error, mic released', async () => {
    const { ref, onError, onTranscribed } = await setup();
    await act(async () => ref.current.start({ auto: true }));
    expect(isMicBusy()).toBe(true);

    await act(async () => ref.current.cancel());

    expect(mockAudioRecorder.stop).toHaveBeenCalledTimes(1);
    expect(client.transcribeAudio).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onTranscribed).not.toHaveBeenCalled();
    expect(ref.current.errorMessage).toBeNull();
    expect(isMicBusy()).toBe(false);
  });

  test.each([
    [
      'permission',
      () => requestRecordingPermissionsAsync.mockResolvedValueOnce({ status: 'denied' }),
      false,
    ],
    ['empty', () => client.transcribeAudio.mockResolvedValueOnce({ transcript: ' ' }), true],
    ['stt', () => client.transcribeAudio.mockRejectedValueOnce(new Error('status 502')), true],
    [
      'network',
      () => client.transcribeAudio.mockRejectedValueOnce(new Error('Network request failed')),
      true,
    ],
  ])('a %s failure reaches onError with that kind', async (kind, arrange, records) => {
    arrange();
    const { ref, onError } = await setup();
    await act(async () => ref.current.start());
    if (records) await act(async () => ref.current.stop());

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].kind).toBe(RECORDER_ERRORS[kind]);
  });

  test('metered silence is discarded with the empty kind', async () => {
    const { onError, ref } = await setup();
    await act(async () => ref.current.start({ auto: true }));
    await act(async () => jest.advanceTimersByTime(HANDS_FREE.maxMs + 200));
    expect(onError.mock.calls[0][0].kind).toBe(RECORDER_ERRORS.empty);
    expect(client.transcribeAudio).not.toHaveBeenCalled();
    void startedAt;
  });
});

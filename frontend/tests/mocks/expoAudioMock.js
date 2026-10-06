const mockAudioRecorder = {
  prepareToRecordAsync: jest.fn().mockResolvedValue(),
  record: jest.fn(),
  stop: jest.fn().mockImplementation(async () => {
    mockAudioRecorder.uri = 'file:///local/cache/recording.m4a';
    mockAudioRecorder.isRecording = false;
    return 'file:///local/cache/recording.m4a';
  }),
  uri: 'file:///local/cache/recording.m4a',
  isRecording: false,
  addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  id: 'mock-recorder-id',
};

const mockAudioPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  remove: jest.fn(),
};

const RecordingPresets = {
  HIGH_QUALITY: {},
  LOW_QUALITY: {},
};

const AudioModule = {
  AudioRecorder: jest.fn().mockImplementation(() => mockAudioRecorder),
  AudioPlayer: jest.fn().mockImplementation(() => mockAudioPlayer),
};

const requestRecordingPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted', granted: true });
const getRecordingPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted', granted: true });
const setAudioModeAsync = jest.fn().mockResolvedValue();
const useAudioRecorder = jest.fn().mockReturnValue(mockAudioRecorder);
const useAudioRecorderState = jest.fn().mockReturnValue({ isRecording: false });
const createAudioPlayer = jest.fn().mockReturnValue(mockAudioPlayer);

module.exports = {
  AudioModule,
  useAudioRecorder,
  useAudioRecorderState,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
  mockAudioRecorder,
  mockAudioPlayer,
};

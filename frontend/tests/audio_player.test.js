import { createAudioPlayer, mockAudioPlayer } from 'expo-audio';
import { playAudioBase64, stopAudio } from '../src/utils/audioPlayer';

// One fake player per source, so overlapping playback is observable.
let players;
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
    emit: (event, payload) => listeners[event] && listeners[event](payload),
  };
}
const uri = (b64) => `data:audio/wav;base64,${b64}`;
const playing = () =>
  Object.values(players).filter((p) => p.play.mock.calls.length > 0 && p.remove.mock.calls.length === 0);

describe('audioPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    players = {};
    createAudioPlayer.mockImplementation((source) => {
      players[source] = fakePlayer();
      return players[source];
    });
  });

  afterEach(async () => {
    await stopAudio();
    createAudioPlayer.mockImplementation(() => mockAudioPlayer);
  });

  test('a new reply stops the one still playing', async () => {
    await playAudioBase64('AAAA');
    await playAudioBase64('BBBB');

    expect(players[uri('AAAA')].remove).toHaveBeenCalled();
    expect(playing()).toEqual([players[uri('BBBB')]]);
  });

  test('two replies started together never play at the same time', async () => {
    await Promise.all([playAudioBase64('AAAA'), playAudioBase64('BBBB')]);

    expect(playing()).toHaveLength(1);
    expect(playing()[0]).toBe(players[uri('BBBB')]);
  });

  test('a reply that finishes releases its player', async () => {
    await playAudioBase64('AAAA');
    const player = players[uri('AAAA')];

    player.emit('playbackStatusUpdate', { didJustFinish: false });
    expect(player.remove).not.toHaveBeenCalled();

    player.emit('playbackStatusUpdate', { didJustFinish: true });
    expect(player.remove).toHaveBeenCalledTimes(1);

    // Nothing left for the next stop to release twice.
    await stopAudio();
    expect(player.remove).toHaveBeenCalledTimes(1);
  });
});

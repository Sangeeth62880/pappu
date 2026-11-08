/**
 * Cross-platform Audio Player for speech playback (Text-to-Speech).
 * Supports both Expo native (expo-audio) and Web (HTMLAudioElement).
 */

import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

let currentSoundInstance = null;
// Ends a waitUntilFinished wait on currentSoundInstance when it is stopped instead.
let settleCurrent = null;
// Bumped on every play; an older play still awaiting setup must not start.
let latestPlayRequest = 0;

// Longest a caller waits for a reply to finish if the player never reports it.
const MAX_PLAYBACK_WAIT_MS = 30000;
// The start cue is ~0.2s; never hold the mic back longer than this for it.
const CUE_MAX_MS = 600;
const LISTEN_CUE = require('../../assets/sounds/listen-cue.wav');

// Free a native player once it finishes instead of holding it until the next reply.
// Returns false when the player cannot report finishing.
function releaseWhenFinished(player, onFinished = null) {
  if (!player || typeof player.addListener !== 'function') return false;
  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    if (!status?.didJustFinish) return;
    subscription?.remove?.();
    if (currentSoundInstance === player) {
      currentSoundInstance = null;
      settleCurrent = null;
    }
    try {
      player.remove();
    } catch (e) {
      console.warn('[audioPlayer] Error releasing finished audio:', e);
    }
    if (onFinished) onFinished();
  });
  return true;
}

// A promise for "playback ended" plus its resolver; resolves on its own after maxMs.
function playbackWait(maxMs = MAX_PLAYBACK_WAIT_MS) {
  let settle;
  const done = new Promise((resolve) => {
    const timer = setTimeout(resolve, maxMs);
    settle = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  return { done, settle };
}

/**
 * Play a base64 encoded audio string.
 *
 * @param {string} base64Data - Raw base64 string or data:audio/wav;base64,... URI
 * @param {{waitUntilFinished?: boolean}} options - resolve only once playback ends or
 *   is stopped (hands-free listening must not record the reply)
 * @returns {Promise<any>} Audio player instance or null
 */
export async function playAudioBase64(base64Data, { waitUntilFinished = false } = {}) {
  if (!base64Data) return null;

  const dataUri = base64Data.startsWith('data:')
    ? base64Data
    : `data:audio/wav;base64,${base64Data}`;
  const requestId = ++latestPlayRequest;

  try {
    await stopAudio();

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && typeof window.Audio !== 'undefined') {
        const webAudio = new window.Audio(dataUri);
        const wait = waitUntilFinished ? playbackWait() : null;
        if (wait) webAudio.onended = wait.settle;
        currentSoundInstance = webAudio;
        settleCurrent = wait?.settle || null;
        await webAudio.play();
        if (wait) await wait.done;
        return webAudio;
      }
    } else {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      // A newer reply started while we awaited the audio mode: don't play over it.
      if (requestId !== latestPlayRequest) return null;

      const player = createAudioPlayer(dataUri);
      const wait = waitUntilFinished ? playbackWait() : null;
      const reportsFinish = releaseWhenFinished(player, wait?.settle);
      if (player && typeof player.play === 'function') {
        player.play();
      }
      currentSoundInstance = player;
      settleCurrent = wait?.settle || null;
      if (wait) {
        if (!reportsFinish) wait.settle();
        await wait.done;
      }
      return player;
    }
  } catch (err) {
    console.warn('[audioPlayer] Speech playback failed:', err);
    return null;
  }
}

/**
 * Stop any currently playing audio.
 */
export async function stopAudio() {
  if (settleCurrent) {
    const settle = settleCurrent;
    settleCurrent = null;
    settle();
  }
  if (currentSoundInstance) {
    const instance = currentSoundInstance;
    currentSoundInstance = null;
    try {
      if (typeof instance.remove === 'function') {
        instance.remove();
      } else if (typeof instance.pause === 'function') {
        instance.pause();
      }
    } catch (e) {
      console.warn('[audioPlayer] Error stopping audio instance:', e);
    }
  }
}

/**
 * Short "speak now" cue before a hands-free recording (pappu://listen).
 * Stops any reply still talking and resolves once the cue ends, so the mic that starts
 * next does not record it. Never throws.
 */
export async function playListenCue() {
  await stopAudio();
  // An older reply still being set up must not start over the recording.
  latestPlayRequest += 1;
  let player = null;
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });
    player = createAudioPlayer(LISTEN_CUE);
    const wait = playbackWait(CUE_MAX_MS);
    const subscription =
      typeof player?.addListener === 'function'
        ? player.addListener('playbackStatusUpdate', (status) => {
            if (status?.didJustFinish) wait.settle();
          })
        : null;
    if (typeof player?.play === 'function') player.play();
    if (!subscription) wait.settle();
    await wait.done;
    subscription?.remove?.();
  } catch (err) {
    console.warn('[audioPlayer] Listen cue failed:', err);
  } finally {
    try {
      player?.remove?.();
    } catch (_e) {}
  }
}

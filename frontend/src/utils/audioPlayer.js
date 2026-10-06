/**
 * Cross-platform Audio Player for speech playback (Text-to-Speech).
 * Supports both Expo native (expo-audio) and Web (HTMLAudioElement).
 */

import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

let currentSoundInstance = null;

/**
 * Play a base64 encoded audio string.
 *
 * @param {string} base64Data - Raw base64 string or data:audio/wav;base64,... URI
 * @returns {Promise<any>} Audio player instance or null
 */
export async function playAudioBase64(base64Data) {
  if (!base64Data) return null;

  const dataUri = base64Data.startsWith('data:')
    ? base64Data
    : `data:audio/wav;base64,${base64Data}`;

  try {
    await stopAudio();

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && typeof window.Audio !== 'undefined') {
        const webAudio = new window.Audio(dataUri);
        currentSoundInstance = webAudio;
        await webAudio.play();
        return webAudio;
      }
    } else {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      const player = createAudioPlayer(dataUri);
      if (player && typeof player.play === 'function') {
        player.play();
      }
      currentSoundInstance = player;
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

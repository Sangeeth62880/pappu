import { useState, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { transcribeAudio } from '../api/client';
import { setMicBusy } from './micActivity';
import { playListenCue } from './audioPlayer';

let nextMicId = 1;

// Metering feeds the silence detection of hands-free recordings; taps ignore it.
const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

/**
 * Hands-free recordings (start({ auto: true }), e.g. pappu://listen) stop on their own:
 * after silenceMs of quiet that follows speech, or at maxMs. Levels are dBFS; the first
 * ignoreMs is skipped so the start cue's tail never counts as speech. A recording with
 * meter readings that never crossed speechDb is discarded without calling STT.
 */
export const HANDS_FREE = {
  silenceMs: 1200,
  maxMs: 8000,
  speechDb: -35,
  ignoreMs: 300,
  pollMs: 100,
};

export const NO_SPEECH_MSG = 'No speech detected. Please try again.';
const PERMISSION_MSG = 'Microphone permission is required to record voice commands.';

/** Why an attempt ended without a transcript; set as err.kind before onError. */
export const RECORDER_ERRORS = {
  permission: 'permission',
  empty: 'empty',
  stt: 'stt',
  network: 'network',
  auth: 'auth',
  stop: 'stop',
};

function withKind(err, kind) {
  const error = err instanceof Error ? err : new Error(String(err?.message || err));
  if (!error.kind) error.kind = kind;
  return error;
}

function isNetworkError(err) {
  return /network request failed|failed to fetch|network/i.test(String(err?.message || ''));
}

/**
 * The one recording path: mic permission, start cue, expo-audio (native) or MediaRecorder
 * (web), hands-free silence stop, STT. MicButton and the voice overlay are UIs over it.
 *
 * Callbacks: onTranscribed(text, { auto }), onRecordingStateChange(bool), onError(err)
 * with err.kind (RECORDER_ERRORS), onLevel(dBFS) on each meter reading of an auto
 * recording. While an attempt runs the mic is marked busy app wide (micActivity).
 */
export function useVoiceRecorder({
  token,
  languageCode = null,
  disabled = false,
  onTranscribed = null,
  onRecordingStateChange = null,
  onError = null,
  onLevel = null,
  logTag = '[MicButton]',
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const isRecordingRef = useRef(false);
  const isStartingRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const isMountedRef = useRef(true);
  const autoModeRef = useRef(false);
  const autoStopTimerRef = useRef(null);
  const stopRecordingRef = useRef(null);
  const onLevelRef = useRef(onLevel);
  onLevelRef.current = onLevel;
  const micIdRef = useRef(null);
  if (micIdRef.current === null) micIdRef.current = nextMicId++;
  // Busy from the start of an attempt until it ends: starting, recording, transcribing.
  const markBusy = (busy) => setMicBusy(micIdRef.current, busy);

  // Native recorder hook for SDK 57
  const nativeRecorder = Platform.OS !== 'web' && typeof useAudioRecorder === 'function'
    ? useAudioRecorder(RECORDING_OPTIONS)
    : null;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearAutoStop();
      cleanupAudio();
      markBusy(false);
    };
  }, []);

  const clearAutoStop = () => {
    if (autoStopTimerRef.current) {
      clearInterval(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  };

  // Hands-free: watch the input level and stop on silence after speech or at the cap.
  const startAutoStop = () => {
    clearAutoStop();
    const { silenceMs, maxMs, speechDb, ignoreMs, pollMs } = HANDS_FREE;
    const startedAt = Date.now();
    let heardSpeech = false;
    let meterSeen = false;
    let lastSpeechAt = startedAt;
    autoStopTimerRef.current = setInterval(() => {
      if (!isRecordingRef.current) {
        clearAutoStop();
        return;
      }
      const now = Date.now();
      let level;
      try {
        level = nativeRecorder?.getStatus?.()?.metering;
      } catch (_e) {}
      if (typeof level === 'number') {
        meterSeen = true;
        if (onLevelRef.current) onLevelRef.current(level);
        if (now - startedAt >= ignoreMs && level > speechDb) {
          heardSpeech = true;
          lastSpeechAt = now;
        }
      }
      const silentAfterSpeech = heardSpeech && now - lastSpeechAt >= silenceMs;
      if (silentAfterSpeech || now - startedAt >= maxMs) {
        clearAutoStop();
        // Without meter readings we can't tell silence from speech: let STT decide.
        stopRecordingRef.current?.({ discard: meterSeen && !heardSpeech });
      }
    }, pollMs);
  };

  const cleanupAudio = async () => {
    if (nativeRecorder && isRecordingRef.current) {
      try {
        await nativeRecorder.stop();
      } catch (err) {
        console.warn(`${logTag} Error during native recorder cleanup:`, err);
      }
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.warn(`${logTag} Error during web stream cleanup:`, err);
      }
      streamRef.current = null;
    }
    isRecordingRef.current = false;
  };

  const startRecording = async ({ auto = false } = {}) => {
    // A second tap while the recorder is still starting must not start another one.
    if (disabled || isTranscribing || isRecordingRef.current || isStartingRef.current) return;
    isStartingRef.current = true;
    autoModeRef.current = auto;
    markBusy(true);
    setErrorMessage(null);
    setPermissionDenied(false);

    try {
      if (Platform.OS === 'web') {
        if (typeof navigator === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Audio recording requires HTTPS or localhost in browser.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        audioChunksRef.current = [];

        const options = { mimeType: 'audio/webm' };
        let mediaRecorder;
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm')) {
          mediaRecorder = new MediaRecorder(stream, options);
        } else if (typeof MediaRecorder !== 'undefined') {
          mediaRecorder = new MediaRecorder(stream);
        } else {
          throw new Error('MediaRecorder is not supported in this browser.');
        }

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          if (streamRef.current) {
            try {
              streamRef.current.getTracks().forEach((t) => t.stop());
            } catch (e) {}
            streamRef.current = null;
          }

          if (audioChunksRef.current.length === 0) {
            markBusy(false);
            if (isMountedRef.current) {
              setErrorMessage('No audio data was recorded.');
            }
            return;
          }

          const mimeType = mediaRecorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          await processAudio(audioBlob);
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(100);
      } else {
        // Native recording
        const permission = await requestRecordingPermissionsAsync();
        if (permission?.status !== 'granted') {
          setPermissionDenied(true);
          throw withKind(new Error(PERMISSION_MSG), RECORDER_ERRORS.permission);
        }

        // Hands-free: a short cue says "speak now", played before recording so it isn't recorded.
        if (auto) {
          await playListenCue();
          if (!isMountedRef.current) {
            markBusy(false);
            return;
          }
        }

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        if (nativeRecorder?.prepareToRecordAsync) {
          await nativeRecorder.prepareToRecordAsync();
          // Unmounted (e.g. sheet closed) while starting: don't start a recorder nobody can stop.
          if (!isMountedRef.current) {
            markBusy(false);
            return;
          }
          nativeRecorder.record();
        }
      }

      isRecordingRef.current = true;
      if (isMountedRef.current) {
        setIsRecording(true);
        if (onRecordingStateChange) onRecordingStateChange(true);
      }
      if (auto) startAutoStop();
    } catch (err) {
      console.warn(`${logTag} startRecording failed:`, err);
      isRecordingRef.current = false;
      markBusy(false);
      if (isMountedRef.current) {
        setIsRecording(false);
        if (onRecordingStateChange) onRecordingStateChange(false);
        const isPerm = err.name === 'NotAllowedError' || err.name === 'SecurityError' || String(err.message).toLowerCase().includes('permission');
        if (isPerm) setPermissionDenied(true);
        setErrorMessage(err.message || 'Microphone access denied or recording failed to start');
        if (onError) onError(withKind(err, isPerm ? RECORDER_ERRORS.permission : RECORDER_ERRORS.stop));
      }
    } finally {
      isStartingRef.current = false;
    }
  };

  // silent: a cancel (overlay closed). The audio is dropped without a message or onError.
  const stopRecording = async ({ discard = false, silent = false } = {}) => {
    if (!isRecordingRef.current) return;
    clearAutoStop();
    isRecordingRef.current = false;
    if (isMountedRef.current) {
      setIsRecording(false);
      if (onRecordingStateChange) onRecordingStateChange(false);
    }

    try {
      if (Platform.OS === 'web' && mediaRecorderRef.current) {
        if (silent) audioChunksRef.current = [];
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } else if (nativeRecorder) {
        await nativeRecorder.stop();
        if (discard) {
          // Nothing was said (or cancelled): the mic is released and nothing is sent.
          markBusy(false);
          if (isMountedRef.current && !silent) {
            setErrorMessage(NO_SPEECH_MSG);
            if (onError) onError(withKind(new Error(NO_SPEECH_MSG), RECORDER_ERRORS.empty));
          }
          return;
        }
        const uri = nativeRecorder.uri;
        if (!uri) {
          throw new Error('Recording stopped but no audio file URI was returned.');
        }

        const audioFile = {
          uri,
          name: 'recording.m4a',
          type: 'audio/m4a',
        };

        await processAudio(audioFile);
      } else {
        throw new Error('No active recording found to stop.');
      }
    } catch (err) {
      console.warn(`${logTag} stopRecording failed:`, err);
      markBusy(false);
      if (isMountedRef.current) {
        setErrorMessage(err.message || 'Failed to complete audio recording.');
        if (onError) onError(withKind(err, RECORDER_ERRORS.stop));
      }
    }
  };

  const processAudio = async (audioData) => {
    if (!token) {
      markBusy(false);
      if (isMountedRef.current) {
        setErrorMessage('Authentication required for voice input.');
        if (onError) {
          onError(withKind(new Error('Authentication required for voice input.'), RECORDER_ERRORS.auth));
        }
      }
      return;
    }

    try {
      if (isMountedRef.current) {
        setIsTranscribing(true);
        setErrorMessage(null);
      }

      const res = await transcribeAudio(token, audioData, languageCode);
      // Closed while transcribing: discard the audio, send nothing.
      if (!isMountedRef.current) return;
      const transcript = res?.transcript?.trim();

      if (transcript && transcript.length > 0) {
        if (onTranscribed) {
          onTranscribed(transcript, { auto: autoModeRef.current });
        }
      } else {
        if (isMountedRef.current) {
          setErrorMessage(NO_SPEECH_MSG);
          if (onError) onError(withKind(new Error(NO_SPEECH_MSG), RECORDER_ERRORS.empty));
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setErrorMessage(err.message || 'Transcription failed');
        if (onError) {
          onError(withKind(err, isNetworkError(err) ? RECORDER_ERRORS.network : RECORDER_ERRORS.stt));
        }
      }
    } finally {
      markBusy(false);
      if (isMountedRef.current) {
        setIsTranscribing(false);
      }
    }
  };

  // The hands-free timer outlives renders; it stops through the latest closure.
  stopRecordingRef.current = stopRecording;

  return {
    isRecording,
    isTranscribing,
    errorMessage,
    permissionDenied,
    isRecordingRef,
    // True while start() waits on the mic permission prompt or the cue.
    isStartingRef,
    start: startRecording,
    stop: stopRecording,
    // Drop whatever is being recorded: no STT, no message, mic released.
    cancel: () => stopRecording({ discard: true, silent: true }),
  };
}

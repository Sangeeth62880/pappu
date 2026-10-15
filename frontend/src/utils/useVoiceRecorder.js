import { useState, useRef, useEffect, useCallback } from 'react';
import { Platform, Linking } from 'react-native';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { transcribeAudio } from '../api/client';

/**
 * Shared Voice Recording Hook for both CoinButton tap/hold and MicButton.
 * Replaces the Prompt 5 recording stub with real audio capture and STT flow.
 * Handles permission denied with a clear message and device settings link.
 */
export function useVoiceRecorder({
  token = null,
  onTranscribed = null,
  languageCode = null,
  onError = null,
} = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const isRecordingRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const isMountedRef = useRef(true);

  // Native audio recorder hook for SDK 57 (safe for web/mock environments)
  const nativeRecorder = Platform.OS !== 'web' && typeof useAudioRecorder === 'function'
    ? useAudioRecorder(RecordingPresets.HIGH_QUALITY)
    : null;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupAudio();
    };
  }, []);

  const cleanupAudio = useCallback(async () => {
    if (nativeRecorder && isRecordingRef.current) {
      try {
        await nativeRecorder.stop();
      } catch (err) {
        console.warn('[useVoiceRecorder] Native recorder cleanup warning:', err);
      }
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch (err) {
        console.warn('[useVoiceRecorder] Stream cleanup warning:', err);
      }
      streamRef.current = null;
    }
    isRecordingRef.current = false;
  }, [nativeRecorder]);

  const openSettings = useCallback(async () => {
    try {
      if (Platform.OS !== 'web' && Linking?.openSettings) {
        await Linking.openSettings();
      }
    } catch (err) {
      console.warn('[useVoiceRecorder] Unable to open settings:', err);
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || isTranscribing) return false;
    setErrorMessage(null);
    setPermissionDenied(false);

    try {
      if (Platform.OS === 'web') {
        if (typeof navigator === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Audio recording requires microphone access.');
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

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(100);
      } else {
        // Native recording via expo-audio
        const permission = await requestRecordingPermissionsAsync();
        if (permission?.status !== 'granted') {
          if (isMountedRef.current) {
            setPermissionDenied(true);
            const msg = 'Microphone permission is required to record voice commands.';
            setErrorMessage(msg);
            if (onError) onError(new Error(msg));
          }
          return false;
        }

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        if (nativeRecorder?.prepareToRecordAsync) {
          await nativeRecorder.prepareToRecordAsync();
          nativeRecorder.record();
        }
      }

      isRecordingRef.current = true;
      if (isMountedRef.current) {
        setIsRecording(true);
      }
      return true;
    } catch (err) {
      console.warn('[useVoiceRecorder] startRecording failed:', err);
      isRecordingRef.current = false;
      if (isMountedRef.current) {
        setIsRecording(false);
        const isPerm = err.name === 'NotAllowedError' || err.name === 'SecurityError' || String(err.message).toLowerCase().includes('permission');
        if (isPerm) setPermissionDenied(true);
        const msg = isPerm
          ? 'Microphone permission is required to record voice commands.'
          : (err.message || 'Microphone access denied or recording failed to start');
        setErrorMessage(msg);
        if (onError) onError(err);
      }
      return false;
    }
  }, [isTranscribing, nativeRecorder, onError]);

  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) return null;
    isRecordingRef.current = false;
    if (isMountedRef.current) {
      setIsRecording(false);
    }

    try {
      let audioPayload = null;

      if (Platform.OS === 'web' && mediaRecorderRef.current) {
        const mr = mediaRecorderRef.current;
        if (mr.state !== 'inactive') {
          await new Promise((resolve) => {
            mr.onstop = resolve;
            mr.stop();
          });
        }
        if (streamRef.current) {
          try {
            streamRef.current.getTracks().forEach((t) => t.stop());
          } catch (e) {}
          streamRef.current = null;
        }
        if (audioChunksRef.current.length > 0) {
          const mimeType = mr.mimeType || 'audio/webm';
          audioPayload = new Blob(audioChunksRef.current, { type: mimeType });
        }
      } else if (nativeRecorder) {
        await nativeRecorder.stop();
        const uri = nativeRecorder.uri;
        if (uri) {
          audioPayload = {
            uri,
            name: 'recording.m4a',
            type: 'audio/m4a',
          };
        }
      }

      if (!audioPayload) {
        if (isMountedRef.current) {
          setErrorMessage('No audio data was recorded.');
        }
        return null;
      }

      // If token and onTranscribed callback are provided, transcribe immediately
      if (token && onTranscribed) {
        if (isMountedRef.current) {
          setIsTranscribing(true);
        }
        try {
          const res = await transcribeAudio(token, audioPayload, languageCode);
          const transcript = res?.transcript?.trim();
          if (transcript) {
            onTranscribed(transcript);
          } else {
            if (isMountedRef.current) {
              setErrorMessage('No speech detected. Please try again.');
            }
          }
        } catch (err) {
          if (isMountedRef.current) {
            setErrorMessage(err.message || 'Transcription failed');
            if (onError) onError(err);
          }
        } finally {
          if (isMountedRef.current) {
            setIsTranscribing(false);
          }
        }
      }

      return audioPayload;
    } catch (err) {
      console.warn('[useVoiceRecorder] stopRecording failed:', err);
      if (isMountedRef.current) {
        setErrorMessage(err.message || 'Failed to complete audio recording.');
        if (onError) onError(err);
      }
      return null;
    }
  }, [nativeRecorder, token, onTranscribed, languageCode, onError]);

  return {
    isRecording,
    isTranscribing,
    errorMessage,
    permissionDenied,
    startRecording,
    stopRecording,
    openSettings,
    cleanupAudio,
    setErrorMessage,
  };
}

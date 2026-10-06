import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform } from 'react-native';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { transcribeAudio } from '../api/client';

export default function MicButton({
  token,
  onTranscribed,
  languageCode = null,
  disabled = false,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const isRecordingRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const isMountedRef = useRef(true);

  // --- FIX: Use the useAudioRecorder hook instead of raw constructor ---
  // This creates the AudioRecorder via useReleasingSharedObject, which properly
  // registers the JS↔native SharedObject binding. The old code used
  // `new AudioModule.AudioRecorder(preset)` in an event handler, which skipped
  // this binding and caused the DynamicSharedObjectType NotFoundException crash.
  const nativeRecorder = Platform.OS !== 'web'
    ? useAudioRecorder(RecordingPresets.HIGH_QUALITY)
    : null;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cleanupAudio();
    };
  }, []);

  const cleanupAudio = async () => {
    // Cleanup native recording if active
    if (nativeRecorder && isRecordingRef.current) {
      try {
        console.log('[MicButton] cleanup: stopping native recorder');
        await nativeRecorder.stop();
      } catch (err) {
        console.warn('[MicButton] Error during native recorder cleanup:', err);
      }
    }

    // Cleanup web stream if active
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.warn('[MicButton] Error during web stream cleanup:', err);
      }
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    if (disabled || isTranscribing || isRecordingRef.current) return;
    setErrorMessage(null);
    console.log('[MicButton] startRecording: begin');

    try {
      if (Platform.OS === 'web') {
        // Web audio recording via MediaRecorder
        if (typeof navigator === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Audio recording is not supported in this browser environment.');
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
        // Native audio recording via expo-audio (SDK 57) — using hook-created recorder
        console.log('[MicButton] startRecording: requesting permission');
        const permission = await requestRecordingPermissionsAsync();
        console.log('[MicButton] startRecording: permission status =', permission.status);
        if (permission.status !== 'granted') {
          throw new Error('Microphone permission is required to record voice commands.');
        }

        console.log('[MicButton] startRecording: setting audio mode');
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
        console.log('[MicButton] startRecording: audio mode set');

        console.log('[MicButton] startRecording: calling prepareToRecordAsync');
        await nativeRecorder.prepareToRecordAsync();
        console.log('[MicButton] startRecording: prepareToRecordAsync complete');

        console.log('[MicButton] startRecording: calling record()');
        nativeRecorder.record();
        console.log('[MicButton] startRecording: record() called successfully');
      }

      isRecordingRef.current = true;
      if (isMountedRef.current) {
        setIsRecording(true);
      }
      console.log('[MicButton] startRecording: recording started');
    } catch (err) {
      console.warn('[MicButton] startRecording failed:', err);
      isRecordingRef.current = false;
      if (isMountedRef.current) {
        setIsRecording(false);
        setErrorMessage(err.message || 'Microphone access denied or recording failed to start');
      }
    }
  };

  const stopRecording = async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    if (isMountedRef.current) {
      setIsRecording(false);
    }
    console.log('[MicButton] stopRecording: begin');

    try {
      if (Platform.OS === 'web' && mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } else if (nativeRecorder) {
        console.log('[MicButton] stopRecording: calling recorder.stop()');
        await nativeRecorder.stop();
        console.log('[MicButton] stopRecording: recorder stopped');

        const uri = nativeRecorder.uri;
        console.log('[MicButton] stopRecording: uri =', uri);

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
      console.warn('[MicButton] stopRecording failed:', err);
      if (isMountedRef.current) {
        setErrorMessage(err.message || 'Failed to complete audio recording.');
      }
    }
  };

  const processAudio = async (audioData) => {
    if (!token) {
      if (isMountedRef.current) {
        setErrorMessage('Authentication required for voice input.');
      }
      return;
    }

    try {
      if (isMountedRef.current) {
        setIsTranscribing(true);
        setErrorMessage(null);
      }

      const res = await transcribeAudio(token, audioData, languageCode);
      const transcript = res?.transcript?.trim();

      if (transcript && transcript.length > 0) {
        if (onTranscribed) {
          onTranscribed(transcript);
        }
      } else {
        if (isMountedRef.current) {
          setErrorMessage('No speech detected. Please try again.');
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setErrorMessage(err.message || 'Transcription failed');
      }
    } finally {
      if (isMountedRef.current) {
        setIsTranscribing(false);
      }
    }
  };

  const handlePress = () => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <View className="items-center">
      {errorMessage ? (
        <View testID="mic-error-banner" className="mb-2 px-3 py-1 bg-clay-rust/15 border border-clay-rust/30 rounded-lg">
          <Text className="text-clay-rust-light font-sans text-xs">{errorMessage}</Text>
        </View>
      ) : null}

      <Pressable
        testID="mic-button"
        onPress={handlePress}
        disabled={disabled || isTranscribing}
        className={`w-11 h-11 rounded-full items-center justify-center border-2 ${
          isRecording
            ? 'bg-clay-rust border-clay-rust-light'
            : isTranscribing
            ? 'bg-ink-navy-lighter border-warm-brass'
            : 'bg-ink-navy-lighter border-warm-brass/40 active:border-warm-brass'
        }`}
      >
        {isTranscribing ? (
          <ActivityIndicator testID="mic-loading-spinner" size="small" color="#C9A227" />
        ) : (
          <Text
            testID="mic-icon"
            className={`text-base ${isRecording ? 'text-bone' : 'text-warm-brass'}`}
          >
            {isRecording ? '⏹' : '🎤'}
          </Text>
        )}
      </Pressable>

      {isRecording ? (
        <Text testID="mic-recording-label" className="text-clay-rust font-sans text-[10px] font-medium mt-1">
          Listening...
        </Text>
      ) : null}
      {isTranscribing ? (
        <Text testID="mic-transcribing-label" className="text-warm-brass font-sans text-[10px] font-medium mt-1">
          Transcribing...
        </Text>
      ) : null}
    </View>
  );
}

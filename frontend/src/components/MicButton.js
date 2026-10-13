import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  Animated,
  Linking,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { transcribeAudio } from '../api/client';
import { colors, radius, shadows, spacing } from '../theme/tokens';

export default function MicButton({
  token,
  onTranscribed,
  languageCode = null,
  disabled = false,
  size = 48,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const isRecordingRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const isMountedRef = useRef(true);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation while recording
  useEffect(() => {
    let animation;
    if (isRecording) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 750,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 750,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      if (animation) animation.stop();
    };
  }, [isRecording]);

  // Use the useAudioRecorder hook to ensure proper JS↔native SharedObject binding in SDK 57
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
    setPermissionDenied(false);

    try {
      if (Platform.OS === 'web') {
        // Web audio recording via MediaRecorder
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
        // Native audio recording via expo-audio (SDK 57)
        const permission = await requestRecordingPermissionsAsync();
        if (permission.status !== 'granted') {
          setPermissionDenied(true);
          throw new Error('Microphone permission is required to record voice commands.');
        }

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        await nativeRecorder.prepareToRecordAsync();
        nativeRecorder.record();
      }

      isRecordingRef.current = true;
      if (isMountedRef.current) {
        setIsRecording(true);
      }
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

    try {
      if (Platform.OS === 'web' && mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } else if (nativeRecorder) {
        await nativeRecorder.stop();
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
    <View style={styles.container}>
      {errorMessage ? (
        <View testID="mic-error-banner" style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={13} color={colors.semantic.expense} style={{ marginRight: 4 }} />
          <Text style={styles.errorText} numberOfLines={2}>{errorMessage}</Text>
          {permissionDenied && Platform.OS !== 'web' && Linking?.openSettings && (
            <TouchableOpacity
              testID="mic-open-settings"
              onPress={() => Linking.openSettings()}
              style={styles.settingsLink}
            >
              <Text style={styles.settingsLinkText}>Settings</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      <View style={styles.buttonWrapper}>
        {isRecording && (
          <Animated.View
            testID="mic-pulse-ring"
            pointerEvents="none"
            style={[
              styles.pulseRing,
              {
                width: size + 16,
                height: size + 16,
                borderRadius: (size + 16) / 2,
                transform: [{ scale: pulseAnim }],
                opacity: pulseAnim.interpolate({
                  inputRange: [1, 1.3],
                  outputRange: [0.5, 0],
                }),
              },
            ]}
          />
        )}

        <Pressable
          testID="mic-button"
          onPress={handlePress}
          disabled={disabled || isTranscribing}
          accessibilityRole="button"
          accessibilityLabel={
            isRecording
              ? 'Stop recording'
              : isTranscribing
              ? 'Transcribing audio'
              : 'Start voice recording'
          }
          style={[
            styles.button,
            { width: size, height: size, borderRadius: size / 2 },
            isRecording
              ? styles.buttonRecording
              : isTranscribing
              ? styles.buttonTranscribing
              : styles.buttonIdle,
            disabled && styles.buttonDisabled,
          ]}
        >
          {isTranscribing ? (
            <ActivityIndicator testID="mic-loading-spinner" size="small" color={colors.brand.default} />
          ) : (
            <View testID="mic-icon" style={styles.iconContainer}>
              <MaterialIcons
                name={isRecording ? 'stop' : 'mic'}
                size={size >= 48 ? 24 : 20}
                color={isRecording ? '#FFFFFF' : colors.brand.default}
              />
            </View>
          )}
        </Pressable>
      </View>

      {isRecording ? (
        <Text testID="mic-recording-label" style={styles.recordingLabel}>
          Listening...
        </Text>
      ) : null}
      {isTranscribing ? (
        <Text testID="mic-transcribing-label" style={styles.transcribingLabel}>
          Transcribing...
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    backgroundColor: colors.semantic.expense,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    minWidth: 44,
    minHeight: 44,
  },
  buttonIdle: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    ...shadows.sm,
  },
  buttonRecording: {
    backgroundColor: colors.semantic.expense,
    borderColor: colors.semantic.expense,
    ...shadows.md,
  },
  buttonTranscribing: {
    backgroundColor: colors.brand.tint,
    borderColor: colors.brand.default,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingLabel: {
    color: colors.semantic.expense,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },
  transcribingLabel: {
    color: colors.brand.default,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.semantic.expenseBg,
    borderColor: colors.semantic.expenseBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginBottom: 6,
    maxWidth: 240,
  },
  errorText: {
    color: colors.semantic.expense,
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  settingsLink: {
    marginLeft: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: colors.semantic.expense,
    borderRadius: 4,
  },
  settingsLinkText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});


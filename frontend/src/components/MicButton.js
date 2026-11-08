import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import Feather from '@expo/vector-icons/Feather';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { transcribeAudio } from '../api/client';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useReduceMotion } from '../utils/reduceMotion';
import { setMicBusy } from '../utils/micActivity';
import { playListenCue } from '../utils/audioPlayer';

let nextMicId = 1;

// Metering feeds the silence detection of hands-free recordings; taps ignore it.
const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

/**
 * Hands-free recordings (autoStartKey, pappu://listen) stop on their own: after
 * silenceMs of quiet that follows speech, or at maxMs. Levels are dBFS; the first
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

const NO_SPEECH_MSG = 'No speech detected. Please try again.';

/**
 * MicButton with support for both standard mic icon and 70px Stitch Coin Mic.
 * Fixes permission denied recovery, error banner, and native cleanup.
 */
export default function MicButton({
  token,
  onTranscribed,
  languageCode = null,
  disabled = false,
  size = 48,
  isCoinStyle = false,
  onRecordingStateChange = null,
  // Called when an attempt ends without a transcript (permission, STT, empty, stop failure).
  onError = null,
  // Each new non-zero value starts a recording on its own (pappu://listen). The
  // transcript then reaches onTranscribed(text, { auto: true }).
  autoStartKey = 0,
}) {
  const reduceMotion = useReduceMotion();
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
  const micIdRef = useRef(null);
  if (micIdRef.current === null) micIdRef.current = nextMicId++;
  // Busy from the start of an attempt until it ends: starting, recording, transcribing.
  const markBusy = (busy) => setMicBusy(micIdRef.current, busy);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation while recording (disabled on reduce motion)
  useEffect(() => {
    let animation;
    if (isRecording && !reduceMotion) {
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
  }, [isRecording, reduceMotion, pulseAnim]);

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
        console.warn('[MicButton] Error during native recorder cleanup:', err);
      }
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.warn('[MicButton] Error during web stream cleanup:', err);
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
          throw new Error('Microphone permission is required to record voice commands.');
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
      console.warn('[MicButton] startRecording failed:', err);
      isRecordingRef.current = false;
      markBusy(false);
      if (isMountedRef.current) {
        setIsRecording(false);
        if (onRecordingStateChange) onRecordingStateChange(false);
        const isPerm = err.name === 'NotAllowedError' || err.name === 'SecurityError' || String(err.message).toLowerCase().includes('permission');
        if (isPerm) setPermissionDenied(true);
        setErrorMessage(err.message || 'Microphone access denied or recording failed to start');
        if (onError) onError(err);
      }
    } finally {
      isStartingRef.current = false;
    }
  };

  const stopRecording = async ({ discard = false } = {}) => {
    if (!isRecordingRef.current) return;
    clearAutoStop();
    isRecordingRef.current = false;
    if (isMountedRef.current) {
      setIsRecording(false);
      if (onRecordingStateChange) onRecordingStateChange(false);
    }

    try {
      if (Platform.OS === 'web' && mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } else if (nativeRecorder) {
        await nativeRecorder.stop();
        if (discard) {
          // Nothing was said: the mic is released and nothing is sent.
          markBusy(false);
          if (isMountedRef.current) {
            setErrorMessage(NO_SPEECH_MSG);
            if (onError) onError(new Error(NO_SPEECH_MSG));
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
      console.warn('[MicButton] stopRecording failed:', err);
      markBusy(false);
      if (isMountedRef.current) {
        setErrorMessage(err.message || 'Failed to complete audio recording.');
        if (onError) onError(err);
      }
    }
  };

  const processAudio = async (audioData) => {
    if (!token) {
      markBusy(false);
      if (isMountedRef.current) {
        setErrorMessage('Authentication required for voice input.');
        if (onError) onError(new Error('Authentication required for voice input.'));
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
          if (onError) onError(new Error(NO_SPEECH_MSG));
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setErrorMessage(err.message || 'Transcription failed');
        if (onError) onError(err);
      }
    } finally {
      markBusy(false);
      if (isMountedRef.current) {
        setIsTranscribing(false);
      }
    }
  };

  // pappu://listen: start without a tap. The start guard above ignores it if busy.
  useEffect(() => {
    if (autoStartKey) startRecording({ auto: true });
  }, [autoStartKey]);

  // The hands-free timer outlives renders; it stops through the latest closure.
  stopRecordingRef.current = stopRecording;

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
          <Feather name="alert-circle" size={13} color={colors.semantic.expense} style={{ marginRight: 4 }} />
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
            isCoinStyle
              ? styles.coinButtonStyle
              : isRecording
              ? styles.buttonRecording
              : isTranscribing
              ? styles.buttonTranscribing
              : styles.buttonIdle,
            disabled && styles.buttonDisabled,
          ]}
        >
          {isTranscribing ? (
            <ActivityIndicator testID="mic-loading-spinner" size="small" color={colors.ink} />
          ) : isCoinStyle ? (
            /* Stitch Coin Mic Face */
            <View style={styles.coinFace}>
              <Text style={styles.coinRupee}>₹</Text>
              <View style={styles.coinEyes}>
                <View style={styles.coinEye} />
                <View style={styles.coinEye} />
              </View>
              <View testID="mic-icon">
                <MaterialIcons
                  name={isRecording ? 'stop' : 'mic'}
                  size={16}
                  color={colors.ink}
                />
              </View>
            </View>
          ) : (
            <View testID="mic-icon" style={styles.iconContainer}>
              <MaterialIcons
                name={isRecording ? 'stop' : 'mic'}
                size={size >= 48 ? 24 : 20}
                color={isRecording ? colors.surface : colors.ink}
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
    backgroundColor: colors.warningBg || colors.bg,
    borderWidth: 2,
    borderColor: colors.gold_edge,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIdle: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  buttonRecording: {
    backgroundColor: colors.semantic.expense,
  },
  buttonTranscribing: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  coinButtonStyle: {
    backgroundColor: colors.gold,
    borderWidth: 3.5,
    borderColor: colors.ink,
    borderBottomWidth: 6,
    borderBottomColor: colors.gold_edge,
  },
  coinFace: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinRupee: {
    fontFamily: typography.fonts.display,
    fontWeight: '800',
    fontSize: 9,
    color: colors.gold_edge,
  },
  coinEyes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
    marginBottom: 2,
  },
  coinEye: {
    width: 4,
    height: 5,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorBg || colors.surface,
    borderWidth: 1,
    borderColor: colors.errorBorder || colors.expense,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
    maxWidth: 240,
  },
  errorText: {
    fontFamily: typography.fonts.body,
    fontSize: 11,
    color: colors.semantic.expense,
    flex: 1,
  },
  settingsLink: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.surface,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsLinkText: {
    fontFamily: typography.fonts.body,
    fontWeight: '700',
    fontSize: 10,
    color: colors.ink,
  },
  recordingLabel: {
    fontFamily: typography.fonts.body,
    fontWeight: '700',
    fontSize: 11,
    color: colors.ink_muted,
    marginTop: 2,
  },
  transcribingLabel: {
    fontFamily: typography.fonts.body,
    fontWeight: '600',
    fontSize: 11,
    color: colors.ink_muted,
    marginTop: 2,
  },
});

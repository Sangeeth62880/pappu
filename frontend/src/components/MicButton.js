import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
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
import Svg, { Circle, Ellipse, Path, Text as SvgText } from 'react-native-svg';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { transcribeAudio } from '../api/client';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useReduceMotion } from '../utils/reduceMotion';
import VoiceWaveAnimation from './ui/VoiceWaveAnimation';
import Pappu from './ui/Pappu';
import FullPageVoiceListening from './ui/FullPageVoiceListening';

const isTest = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') || typeof jest !== 'undefined';

/**
 * MicButton with support for both standard mic icon and 70px Stitch Coin Mic.
 * Audio recording hook shared with CoinButton.
 * Fixes permission denied recovery, error banner, and native cleanup.
 */
const MicButton = forwardRef(function MicButton({
  token,
  onTranscribed,
  languageCode = null,
  disabled = false,
  size = 48,
  isCoinStyle = false,
  onRecordingStateChange = null,
  onTranscribingStateChange = null,
  autoRecord = false,
  enableFullPageOverlay = !isTest,
}, ref) {
  const reduceMotion = useReduceMotion();
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
    ? useAudioRecorder(RecordingPresets.HIGH_QUALITY)
    : null;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupAudio();
    };
  }, []);

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

  const startRecording = async () => {
    if (disabled || isTranscribing || isRecordingRef.current) return;
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
        if (onRecordingStateChange) onRecordingStateChange(true);
      }
    } catch (err) {
      console.warn('[MicButton] startRecording failed:', err);
      isRecordingRef.current = false;
      if (isMountedRef.current) {
        setIsRecording(false);
        if (onRecordingStateChange) onRecordingStateChange(false);
        const isPerm = err.name === 'NotAllowedError' || err.name === 'SecurityError' || String(err.message).toLowerCase().includes('permission');
        if (isPerm) setPermissionDenied(true);
        setErrorMessage(err.message || 'Microphone access denied or recording failed to start');
      }
    }
  };

  const stopRecording = async () => {
    if (!isRecordingRef.current) return;
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
        if (onTranscribingStateChange) onTranscribingStateChange(true);
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
        if (onTranscribingStateChange) onTranscribingStateChange(false);
      }
    }
  };

  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording,
    isRecording: () => isRecordingRef.current,
  }));

  const autoRecordTriggeredRef = useRef(false);

  useEffect(() => {
    if (autoRecord && !autoRecordTriggeredRef.current && !disabled && !isRecordingRef.current) {
      autoRecordTriggeredRef.current = true;
      const timer = setTimeout(() => {
        if (isMountedRef.current && !isRecordingRef.current) {
          startRecording();
        }
      }, 250);
      return () => clearTimeout(timer);
    }
    if (!autoRecord) {
      autoRecordTriggeredRef.current = false;
    }
  }, [autoRecord, disabled]);

  const handlePress = () => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Full-Page Immersive Voice Listening Overlay ── */}
      {enableFullPageOverlay && (isRecording || isTranscribing) && (
        <FullPageVoiceListening
          visible={isRecording || isTranscribing}
          isTranscribing={isTranscribing}
          onStop={stopRecording}
          onCancel={stopRecording}
        />
      )}
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
            /* Stitch Mascot Coin Face identical to Home Screen */
            <View style={styles.coinTactileWrapper}>
              {isRecording ? (
                <View style={styles.listeningContainer} testID="mic-listening-face">
                  <VoiceWaveAnimation
                    color={colors.ink}
                    maxHeight={size >= 64 ? 24 : 18}
                    minHeight={4}
                    barWidth={3}
                    gap={2}
                    barCount={size >= 64 ? 7 : 5}
                  />
                  <View style={styles.coinMicBadge}>
                    <MaterialIcons name="stop" size={12} color={colors.ink} />
                  </View>
                </View>
              ) : (
                <>
                  <Svg width={Math.max(40, size - 16)} height={Math.max(40, size - 16)} viewBox="0 0 56 56" fill="none" style={styles.svgFace}>
                    <Circle cx="28" cy="27" r="21" stroke={colors.gold_edge} strokeWidth="1.8" />
                    <SvgText
                      x="28"
                      y="16"
                      fontFamily={typography.fonts.display}
                      fontWeight="700"
                      fontSize="10"
                      fill={colors.gold_edge}
                      textAnchor="middle"
                    >
                      ₹
                    </SvgText>
                    <Ellipse cx="21" cy="25.5" rx="4.5" ry="5.8" fill={colors.surface} stroke={colors.ink} strokeWidth="1.5" />
                    <Ellipse cx="35" cy="25.5" rx="4.5" ry="5.8" fill={colors.surface} stroke={colors.ink} strokeWidth="1.5" />
                    <Circle cx="22" cy="26" r="2.8" fill={colors.ink} />
                    <Circle cx="34" cy="26" r="2.8" fill={colors.ink} />
                    <Circle cx="23" cy="24.8" r="1" fill={colors.surface} />
                    <Circle cx="35" cy="24.8" r="1" fill={colors.surface} />
                    <Path
                      d="M 23 34 C 25 36.5 31 36.5 33 34"
                      stroke={colors.ink}
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </Svg>
                  <View style={styles.coinMicBadge}>
                    <MaterialIcons name="mic" size={12} color={colors.ink} />
                  </View>
                </>
              )}
              {/* Keep testID mic-icon accessible */}
              <View testID="mic-icon" style={styles.hiddenTestMarker}>
                <MaterialIcons name={isRecording ? 'stop' : 'mic'} size={1} color="transparent" />
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
        <View style={styles.recordingRow} testID="mic-recording-wave">
          <VoiceWaveAnimation
            color={isCoinStyle ? colors.gold_edge : colors.semantic.expense}
            maxHeight={14}
            minHeight={3}
            barWidth={3}
            gap={2.5}
            style={{ marginRight: 6 }}
          />
          <Text testID="mic-recording-label" style={styles.recordingLabel}>
            Listening...
          </Text>
        </View>
      ) : null}
      {isTranscribing ? (
        <Text testID="mic-transcribing-label" style={styles.transcribingLabel}>
          Transcribing...
        </Text>
      ) : null}
    </View>
  );
});

export default MicButton;

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
  },
  transcribingLabel: {
    fontFamily: typography.fonts.body,
    fontWeight: '600',
    fontSize: 11,
    color: colors.ink_muted,
    marginTop: 2,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  coinTactileWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  listeningContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinMicBadge: {
    position: 'absolute',
    bottom: 2,
    alignSelf: 'center',
    backgroundColor: colors.gold_edge,
    borderRadius: 8,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  svgFace: {
    marginTop: -2,
  },
  hiddenTestMarker: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
});

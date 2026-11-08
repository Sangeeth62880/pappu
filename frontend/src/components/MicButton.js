import React, { useRef, useEffect } from 'react';
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
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useReduceMotion } from '../utils/reduceMotion';
import { useVoiceRecorder } from '../utils/useVoiceRecorder';

export { HANDS_FREE } from '../utils/useVoiceRecorder';

/**
 * MicButton with support for both standard mic icon and 70px Stitch Coin Mic.
 * Recording, hands-free stop and STT live in useVoiceRecorder; this is the button,
 * its pulse and its error banner (with a Settings link when permission is denied).
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
  const recorder = useVoiceRecorder({
    token,
    languageCode,
    disabled,
    onTranscribed,
    onRecordingStateChange,
    onError,
  });
  const { isRecording, isTranscribing, errorMessage, permissionDenied } = recorder;
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

  // pappu://listen: start without a tap. The recorder's start guard ignores it if busy.
  useEffect(() => {
    if (autoStartKey) recorder.start({ auto: true });
  }, [autoStartKey]);

  const handlePress = () => {
    if (recorder.isRecordingRef.current) {
      recorder.stop();
    } else {
      recorder.start();
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

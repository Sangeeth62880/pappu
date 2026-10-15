import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useReduceMotion } from '../../utils/reduceMotion';

/**
 * 4-bar TTS Waveform oscillating between 8px and 20px over 800ms loop per motion spec.
 * Static bars fallback for Reduce Motion.
 */
export function TtsWaveform({ testID = 'tts-waveform' }) {
  const reduceMotion = useReduceMotion();
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

  const bar1 = useRef(new Animated.Value(10)).current;
  const bar2 = useRef(new Animated.Value(18)).current;
  const bar3 = useRef(new Animated.Value(12)).current;
  const bar4 = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (reduceMotion || isTest) return;

    const animateBar = (animVal, targetH, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animVal, {
            toValue: targetH,
            duration: 400,
            useNativeDriver: false,
          }),
          Animated.timing(animVal, {
            toValue: 28 - targetH,
            duration: 400,
            useNativeDriver: false,
          }),
        ])
      );

    const a1 = animateBar(bar1, 20, 0);
    const a2 = animateBar(bar2, 8, 150);
    const a3 = animateBar(bar3, 20, 300);
    const a4 = animateBar(bar4, 8, 450);

    a1.start();
    a2.start();
    a3.start();
    a4.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
      a4.stop();
    };
  }, [reduceMotion, isTest, bar1, bar2, bar3, bar4]);

  return (
    <View testID={testID} style={styles.waveformContainer}>
      {[bar1, bar2, bar3, bar4].map((anim, i) => (
        <Animated.View
          key={i}
          testID={`tts-wave-bar-${i}`}
          style={[
            styles.waveformBar,
            { height: reduceMotion || isTest ? [10, 18, 12, 16][i] : anim },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * Message Bubble per Stitch Assistant Specification.
 * User Bubble:
 * - Gold #FFC83D fill, ink #1F2937 text, 20px radius, Nunito SemiBold 15px.
 * - Max width 80%, aligned right.
 * - Timestamp below bubble aligned right in Nunito Bold 12px ink_muted (6:16 PM).
 * Pappu Reply Bubble:
 * - Aligned left with 32px mini Pappu avatar on the left.
 * - White #FFFFFF surface with 2px solid border #F0E4C8, 20px radius, Nunito SemiBold 15px.
 * - Sized to content, never empty.
 * - 20px speaker icon at the end to replay TTS of spoken_text.
 * - Timestamp below bubble aligned left (with margin-left for avatar).
 */
export default function MessageBubble({
  text,
  sender = 'pappu',
  isError = false,
  hasAudio = false,
  isPlayingAudio = false,
  onPlayAudio = null,
  timestamp = null,
  canRetry = false,
  onRetry = null,
  testID,
}) {
  const isUser = sender === 'user';
  const displayTime = timestamp || '6:16 PM';

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}
    >
      <View style={isUser ? styles.userRow : styles.assistantRow}>
        {/* 32px Mini Mascot Avatar for Pappu */}
        {!isUser && (
          <View style={styles.miniAvatar} testID="pappu-mini-avatar">
            <Text style={styles.avatarRupee}>₹</Text>
          </View>
        )}

        <View
          style={[
            styles.bubble,
            isUser
              ? styles.userBubble
              : isError
              ? styles.errorBubble
              : styles.assistantBubble,
          ]}
        >
          {isUser ? (
            <Text style={styles.userText}>{text}</Text>
          ) : (
            <View style={styles.assistantContent}>
              <Text style={[styles.assistantText, isError && styles.errorText]}>
                {text}
              </Text>

              {/* Speaker Replay Button / Audio Wave Bar */}
              {!isError && (onPlayAudio || hasAudio) && (
                <View style={styles.audioRow}>
                  {isPlayingAudio ? (
                    <TtsWaveform testID="tts-waveform" />
                  ) : null}
                  <TouchableOpacity
                    testID={`tts-replay-button-${testID || 'msg'}`}
                    accessibilityRole="button"
                    accessibilityLabel="Replay audio"
                    onPress={onPlayAudio}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.speakerButton}
                  >
                    <Feather
                      name="volume-2"
                      size={18}
                      color={isPlayingAudio ? colors.secondary : colors.ink}
                    />
                  </TouchableOpacity>
                </View>
              )}

              {/* Inline Retry Button for Error Bubble */}
              {isError && canRetry && onRetry && (
                <TouchableOpacity
                  testID="retry-button"
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                  onPress={onRetry}
                  style={styles.inlineRetryBtn}
                >
                  <Feather name="refresh-cw" size={13} color={colors.ink} style={{ marginRight: 4 }} />
                  <Text style={styles.retryBtnText}>Try again</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Timestamp under bubble */}
      <View
        style={[
          styles.timestampRow,
          isUser ? styles.userTimestampRow : styles.assistantTimestampRow,
        ]}
      >
        <Text style={styles.timestampText}>{displayTime}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    maxWidth: '100%',
  },
  userContainer: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
  },
  assistantContainer: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  assistantRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  miniAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  avatarRupee: {
    fontFamily: typography.fonts.display,
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 14,
    color: colors.ink,
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  userBubble: {
    backgroundColor: colors.gold,
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomLeftRadius: 6,
    flexShrink: 1,
  },
  errorBubble: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.semantic.expense,
    borderBottomLeftRadius: 6,
    flexShrink: 1,
  },
  userText: {
    fontFamily: typography.fonts.body,
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  assistantContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  assistantText: {
    fontFamily: typography.fonts.body,
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    flexShrink: 1,
  },
  errorText: {
    color: colors.semantic.expense,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 20,
    gap: 3,
    paddingHorizontal: 2,
  },
  waveformBar: {
    width: 3,
    backgroundColor: colors.secondary,
    borderRadius: 1.5,
  },
  speakerButton: {
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
  },
  retryBtnText: {
    fontFamily: typography.fonts.body,
    fontWeight: '700',
    fontSize: 12,
    color: colors.ink,
  },
  timestampRow: {
    marginTop: 3,
  },
  userTimestampRow: {
    alignItems: 'flex-end',
    marginRight: 4,
  },
  assistantTimestampRow: {
    alignItems: 'flex-start',
    marginLeft: 40,
  },
  timestampText: {
    fontFamily: typography.fonts.body,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink_muted,
  },
});

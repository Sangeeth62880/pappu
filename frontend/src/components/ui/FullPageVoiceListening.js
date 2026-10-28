import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography } from '../../theme/tokens';
import { useReduceMotion } from '../../utils/reduceMotion';
import Pappu from './Pappu';
import VoiceWaveAnimation from './VoiceWaveAnimation';

/**
 * Full-page immersive voice listening overlay.
 * Activates on voice input. Tapping anywhere on the screen stops recording.
 * After transcription completes, stops cleanly without re-triggering.
 */
export default function FullPageVoiceListening({
  visible = false,
  isTranscribing = false,
  onStop,
  onCancel,
  testID = 'full-page-voice-listening',
}) {
  const reduceMotion = useReduceMotion();
  const isTest = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') || typeof jest !== 'undefined';
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim2 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let anim;
    if (visible && !isTranscribing && !reduceMotion && !isTest) {
      anim = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.35,
              duration: 900,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 900,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseAnim2, {
              toValue: 1.55,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim2, {
              toValue: 1,
              duration: 1200,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      anim.start();
    } else {
      pulseAnim.setValue(1);
      pulseAnim2.setValue(1);
    }
    return () => {
      if (anim) anim.stop();
    };
  }, [visible, isTranscribing, reduceMotion]);

  if (!visible) return null;

  return (
    <Pressable
      testID={testID}
      style={styles.fullScreenOverlay}
      onPress={isTranscribing ? undefined : onStop}
      accessibilityRole="button"
      accessibilityLabel={isTranscribing ? 'Transcribing voice input' : 'Tap anywhere on screen to stop'}
    >
      {/* Top Bar with Cancel Button */}
      <View style={styles.topBar}>
        <View style={styles.topBrandGroup}>
          <View style={styles.topBrandDot} />
          <Text style={styles.topBrand}>Pappu Voice</Text>
        </View>
        {onCancel && (
          <Pressable
            testID="voice-fullpage-cancel"
            onPress={(e) => {
              if (e && e.stopPropagation) e.stopPropagation();
              onCancel();
            }}
            hitSlop={12}
            style={styles.cancelBtn}
            accessibilityRole="button"
            accessibilityLabel="Cancel voice input"
          >
            <MaterialIcons name="close" size={24} color={colors.ink} />
          </Pressable>
        )}
      </View>

      {/* Center Stage */}
      <View style={styles.centerStage} pointerEvents="none">
        {/* Radiating Ripple Rings */}
        {!isTranscribing && (
          <>
            <Animated.View
              style={[
                styles.rippleRing,
                {
                  width: 240,
                  height: 240,
                  borderRadius: 120,
                  transform: [{ scale: pulseAnim2 }],
                  opacity: pulseAnim2.interpolate({
                    inputRange: [1, 1.55],
                    outputRange: [0.25, 0],
                  }),
                },
              ]}
            />
            <Animated.View
              style={[
                styles.rippleRing,
                {
                  width: 180,
                  height: 180,
                  borderRadius: 90,
                  transform: [{ scale: pulseAnim }],
                  opacity: pulseAnim.interpolate({
                    inputRange: [1, 1.35],
                    outputRange: [0.45, 0.05],
                  }),
                },
              ]}
            />
          </>
        )}

        {/* Mascot Center Circle: Coin hidden while listening, only waveform shown */}
        {isTranscribing && (
          <View style={styles.mascotCircle}>
            <Pappu mood="thinking" size={88} />
          </View>
        )}

        {/* Giant Voice Wave Animation covering screen width */}
        {!isTranscribing ? (
          <View style={styles.waveContainer}>
            <VoiceWaveAnimation
              color={colors.gold_edge}
              maxHeight={56}
              minHeight={8}
              barWidth={6}
              gap={6}
              barCount={9}
            />
          </View>
        ) : (
          <View style={styles.spinnerContainer}>
            <ActivityIndicator size="large" color={colors.gold_edge} />
          </View>
        )}

        {/* Status text & Tap Anywhere instruction */}
        <Text style={styles.statusHeading}>
          {isTranscribing ? 'Processing voice...' : 'Listening...'}
        </Text>
        <Text style={styles.statusInstruction}>
          {isTranscribing
            ? 'Transcribing and answering with Pappu'
            : 'Tap anywhere on the screen to stop'}
        </Text>

        {!isTranscribing && (
          <View style={styles.stopButtonPill}>
            <MaterialIcons name="stop" size={16} color={colors.ink} style={{ marginRight: 6 }} />
            <Text style={styles.stopButtonText}>Tap to Finish</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fullScreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 9999,
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    zIndex: 10000,
  },
  topBrandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBrandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.gold,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  topBrand: {
    fontFamily: typography.fonts.display,
    fontWeight: '800',
    fontSize: 16,
    color: colors.ink,
  },
  cancelBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  rippleRing: {
    position: 'absolute',
    backgroundColor: colors.gold,
    borderWidth: 2.5,
    borderColor: colors.gold_edge,
    top: '32%',
    alignSelf: 'center',
    marginTop: -90,
  },
  mascotCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    borderWidth: 3.5,
    borderColor: colors.ink,
    borderBottomWidth: 6,
    borderBottomColor: colors.gold_edge,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    zIndex: 10,
  },
  waveContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    height: 64,
    marginBottom: 24,
  },
  spinnerContainer: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  statusHeading: {
    fontFamily: typography.fonts.display,
    fontWeight: '800',
    fontSize: 24,
    lineHeight: 30,
    color: colors.ink,
    marginBottom: 8,
    textAlign: 'center',
  },
  statusInstruction: {
    fontFamily: typography.fonts.body,
    fontWeight: '600',
    fontSize: 15,
    color: colors.ink_muted,
    textAlign: 'center',
    marginBottom: 28,
  },
  stopButtonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.ink,
    borderBottomWidth: 3.5,
    borderBottomColor: colors.gold_edge,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  stopButtonText: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 14,
    color: colors.ink,
  },
});

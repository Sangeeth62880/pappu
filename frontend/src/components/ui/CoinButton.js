import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Platform,
} from 'react-native';
import Svg, { Circle, Ellipse, Path, Text as SvgText } from 'react-native-svg';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as SecureStore from 'expo-secure-store';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useCoinGesture } from '../../utils/useCoinGesture';
import Pappu from './Pappu';
import VoiceWaveAnimation from './VoiceWaveAnimation';

export const TOOLTIP_PERSIST_KEY = 'pappu_coin_tooltip_seen_v1';

export async function checkTooltipSeen() {
  try {
    const val = await SecureStore.getItemAsync(TOOLTIP_PERSIST_KEY);
    if (val === 'true') return true;
  } catch (e) {}
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (window.localStorage.getItem(TOOLTIP_PERSIST_KEY) === 'true') return true;
    } catch (e) {}
  }
  return false;
}

export async function markTooltipSeen() {
  try {
    await SecureStore.setItemAsync(TOOLTIP_PERSIST_KEY, 'true');
  } catch (e) {}
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(TOOLTIP_PERSIST_KEY, 'true');
    } catch (e) {}
  }
}

/**
 * 72px Center Raised Coin Button for the Bottom Tab Bar.
 * Visual source of truth: Stitch HTML (home.html lines 542-570, motion_spec.md)
 * Dimensions: 72px circle, gold #FFC83D fill, 4px ink #1F2937 perimeter outline,
 * 4px solid gold_edge #D99A00 bottom edge, raised 24px above bottom tab bar.
 * Gesture:
 * - Tap (<300ms) opens Assistant modal with immediate voice input active
 * - Press & Hold (>=300ms) enters recording state: shows Pappu listening pose and sound wave animation
 * - Release after hold stubs send step and logs recording length
 * - 10 degree tilt over 200ms with haptic feedback
 * Tooltip:
 * - "Tap me to talk." shown once on first launch, persisted via SecureStore/localStorage.
 */
export default function CoinButton({
  onOpenAssistant,
  onRecordingComplete,
  testID = 'coin-button',
  initialTooltipVisible = null,
}) {
  const [tooltipVisible, setTooltipVisible] = useState(
    initialTooltipVisible !== null ? initialTooltipVisible : false
  );

  useEffect(() => {
    if (initialTooltipVisible === null) {
      checkTooltipSeen().then((seen) => {
        if (!seen) {
          setTooltipVisible(true);
        }
      });
    }
  }, [initialTooltipVisible]);

  const dismissTooltip = () => {
    setTooltipVisible(false);
    markTooltipSeen();
  };

  const {
    isRecording,
    isPressed,
    tiltAnim,
    scaleAnim,
    handlePressIn,
    handlePressOut,
  } = useCoinGesture({
    onTap: () => {
      dismissTooltip();
      if (onOpenAssistant) onOpenAssistant({ autoRecord: true });
    },
    onRecordingComplete: (data) => {
      dismissTooltip();
      if (onRecordingComplete) onRecordingComplete(data);
    },
    onOpenAssistant: (data) => {
      dismissTooltip();
      if (onOpenAssistant) onOpenAssistant(data || { autoRecord: true });
    },
  });

  const rotate = tiltAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '10deg'],
  });

  return (
    <View style={styles.coinButtonContainer} pointerEvents="box-none">
      {/* ── First Launch Tooltip ("Tap me to talk.") ── */}
      {tooltipVisible && (
        <TouchableOpacity
          testID="coin-tooltip"
          activeOpacity={0.9}
          onPress={dismissTooltip}
          style={styles.tooltipBubble}
          accessibilityRole="alert"
          accessibilityLabel="Tap me to talk"
        >
          <View style={styles.tooltipCard}>
            <Text style={styles.tooltipText}>Tap me to talk.</Text>
          </View>
          <View style={styles.tooltipArrow} />
        </TouchableOpacity>
      )}

      {/* ── Active Voice Input Wave Pill above Coin when recording ── */}
      {isRecording && (
        <View style={styles.listeningWaveCapsule} testID="coin-voice-wave">
          <VoiceWaveAnimation color={colors.gold_edge} maxHeight={14} minHeight={4} barWidth={3} gap={2.5} style={{ marginRight: 6 }} />
          <Text style={styles.listeningWaveText}>Listening...</Text>
        </View>
      )}

      {/* ── 72px Raised Coin Button ── */}
      <View style={styles.coinTactileWrapper}>
        {/* 4px Tactile Bottom Edge Layer */}
        <View style={styles.coinEdgeLayer} />

        {/* Depressing and Tilting Coin Face */}
        <Animated.View
          style={[
            styles.coinFaceWrapper,
            {
              transform: [
                { rotate },
                { scale: scaleAnim },
                { translateY: isPressed ? 4 : 0 },
              ],
            },
          ]}
        >
          <TouchableOpacity
            testID={testID}
            activeOpacity={1}
            onPress={() => {
              dismissTooltip();
              if (onOpenAssistant) onOpenAssistant({ autoRecord: true });
            }}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Listening' : 'Talk with Pappu'}
            style={styles.coinTouchableFace}
          >
            {isRecording ? (
              /* Pappu Listening Pose in Place with Wave Animation */
              <View style={styles.listeningContainer} testID="coin-listening-state">
                <Pappu mood="listening" size={44} />
                <View style={styles.listeningWaveBar}>
                  <VoiceWaveAnimation color={colors.ink} maxHeight={10} minHeight={3} barWidth={2.5} gap={2} />
                </View>
              </View>
            ) : (
              <>
                {/* Pappu Mascot Face Mark (Idle face + small mic mark) per Stitch home.html */}
                <Svg width={56} height={56} viewBox="0 0 56 56" fill="none" style={styles.svgFace}>
                  {/* Inner rim ring inset */}
                  <Circle cx="28" cy="27" r="21" stroke={colors.gold_edge} strokeWidth="1.8" />
                  {/* Embossed ₹ on forehead */}
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

                  {/* Eyes */}
                  <Ellipse cx="21" cy="25.5" rx="4.5" ry="5.8" fill={colors.surface} stroke={colors.ink} strokeWidth="1.5" />
                  <Ellipse cx="35" cy="25.5" rx="4.5" ry="5.8" fill={colors.surface} stroke={colors.ink} strokeWidth="1.5" />
                  <Circle cx="22" cy="26" r="2.8" fill={colors.ink} />
                  <Circle cx="34" cy="26" r="2.8" fill={colors.ink} />
                  <Circle cx="23" cy="24.8" r="1" fill={colors.surface} />
                  <Circle cx="35" cy="24.8" r="1" fill={colors.surface} />

                  {/* Smile */}
                  <Path
                    d="M 23 34 C 25 36.5 31 36.5 33 34"
                    stroke={colors.ink}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    fill="none"
                  />
                </Svg>
                {/* Simple mic icon below mascot face */}
                <View style={styles.micIconBadge}>
                  <MaterialIcons name="mic" size={13} color={colors.ink} />
                </View>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coinButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
    position: 'relative',
    top: -24, // Raised 24px above tab bar
    zIndex: 50,
  },
  coinTactileWrapper: {
    width: 72,
    height: 72,
    position: 'relative',
  },
  coinEdgeLayer: {
    position: 'absolute',
    top: 4,
    left: 0,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.gold_edge,
  },
  coinFaceWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  coinTouchableFace: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.gold,
    borderWidth: 4,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  svgFace: {
    marginTop: -4,
  },
  micIconBadge: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    backgroundColor: colors.gold_edge,
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  listeningContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  listeningWaveBar: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
  },
  listeningWaveCapsule: {
    position: 'absolute',
    bottom: 84,
    alignItems: 'center',
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 3,
    borderBottomColor: colors.borderDark || colors.border,
    zIndex: 100,
  },
  listeningWaveText: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 12,
    color: colors.ink,
  },
  tooltipBubble: {
    position: 'absolute',
    bottom: 80,
    alignItems: 'center',
    zIndex: 100,
  },
  tooltipCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 3,
    borderBottomColor: colors.borderDark || colors.border,
  },
  tooltipText: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 16,
    color: colors.ink,
  },
  tooltipArrow: {
    width: 8,
    height: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.border,
    transform: [{ rotate: '45deg' }],
    marginTop: -4,
  },
});

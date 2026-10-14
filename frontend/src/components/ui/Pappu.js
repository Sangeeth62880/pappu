import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Animated, StyleSheet, Text } from 'react-native';
import { useReduceMotion } from '../../utils/reduceMotion';
import { colors, typography } from '../../theme/tokens';

const POSES = {
  idle: require('../../../assets/pappu/png/pappu-idle-360.png'),
  listening: require('../../../assets/pappu/png/pappu-listening-360.png'),
  thinking: require('../../../assets/pappu/png/pappu-thinking-360.png'),
  speaking: require('../../../assets/pappu/png/pappu-speaking-360.png'),
  happy: require('../../../assets/pappu/png/pappu-happy-360.png'),
  excited: require('../../../assets/pappu/png/pappu-excited-360.png'),
  worried: require('../../../assets/pappu/png/pappu-worried-360.png'),
  concerned: require('../../../assets/pappu/png/pappu-concerned-360.png'),
  confused: require('../../../assets/pappu/png/pappu-confused-360.png'),
  sleepy: require('../../../assets/pappu/png/pappu-sleepy-360.png'),
};

/**
 * Normalizes input server mood or client interaction state to an exact pose key.
 */
export function normalizeMood(mood = 'idle') {
  if (!mood) return 'idle';
  const lower = String(mood).toLowerCase().trim();
  if (POSES[lower]) return lower;
  if (lower === 'neutral') return 'idle';
  return 'idle';
}

/**
 * Pappu Mascot Component.
 * Supports sizes 32, 48, 72, 120, 180 (aspect ratio approx 100:110).
 * 200ms crossfade between poses.
 * Idle blink via transform every 3.5s (disabled if reduce motion is on).
 */
export default function Pappu({
  mood = 'idle',
  size = 120,
  style,
  testID = 'pappu-mascot',
}) {
  const reduceMotion = useReduceMotion();
  const currentPose = normalizeMood(mood);

  const [activePose, setActivePose] = useState(currentPose);
  const [prevPose, setPrevPose] = useState(null);

  const crossfadeAnim = useRef(new Animated.Value(1)).current;
  const blinkAnim = useRef(new Animated.Value(1)).current;

  // Handle crossfade on mood change
  useEffect(() => {
    if (currentPose !== activePose) {
      if (reduceMotion) {
        setActivePose(currentPose);
        setPrevPose(null);
        crossfadeAnim.setValue(1);
      } else {
        setPrevPose(activePose);
        setActivePose(currentPose);
        crossfadeAnim.setValue(0);
        Animated.timing(crossfadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setPrevPose(null);
        });
      }
    }
  }, [currentPose, activePose, reduceMotion]);

  // Handle idle blink via scaleY transform
  useEffect(() => {
    if (reduceMotion || activePose === 'sleepy') return;

    let timer;
    const scheduleBlink = () => {
      const delay = 3500 + Math.random() * 1500; // 3.5 - 5 seconds
      timer = setTimeout(() => {
        // Quick 120ms blink
        Animated.sequence([
          Animated.timing(blinkAnim, {
            toValue: 0.15,
            duration: 60,
            useNativeDriver: true,
          }),
          Animated.timing(blinkAnim, {
            toValue: 1,
            duration: 60,
            useNativeDriver: true,
          }),
        ]).start(() => {
          scheduleBlink();
        });
      }, delay);
    };

    scheduleBlink();
    return () => clearTimeout(timer);
  }, [activePose, reduceMotion]);

  const height = Math.round(size * 1.1); // 100:110 aspect ratio

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.container,
        {
          width: size,
          height,
          transform: [{ scaleY: blinkAnim }],
        },
        style,
      ]}
    >
      {/* Previous Pose during 200ms crossfade */}
      {prevPose && POSES[prevPose] ? (
        <Animated.Image
          source={POSES[prevPose]}
          style={[
            styles.image,
            {
              width: size,
              height,
              opacity: crossfadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              }),
            },
          ]}
          resizeMode="contain"
        />
      ) : null}

      {/* Active Pose */}
      {POSES[activePose] ? (
        <Animated.Image
          testID={`pappu-pose-${activePose}`}
          source={POSES[activePose]}
          style={[
            styles.image,
            {
              width: size,
              height,
              opacity: prevPose ? crossfadeAnim : 1,
            },
          ]}
          resizeMode="contain"
        />
      ) : null}
    </Animated.View>
  );
}

/**
 * 32px Gold Coin Mark with 2px ink rim and center ₹.
 */
export function PappuLogo({ size = 32, style }) {
  return (
    <View
      style={[
        styles.logoCircle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
      testID="pappu-logo"
    >
      <View
        style={[
          styles.logoInnerCircle,
          {
            width: size - 8,
            height: size - 8,
            borderRadius: (size - 8) / 2,
          },
        ]}
      >
        <Text style={[styles.logoText, { fontSize: Math.round(size * 0.45) }]}>₹</Text>
      </View>
    </View>
  );
}

/**
 * Pappu Wordmark Component in Baloo Chettan 2 Bold.
 */
export function PappuWordmark({ style, size = 20, color = colors.ink }) {
  return (
    <Text
      testID="pappu-wordmark"
      style={[
        styles.wordmark,
        { fontSize: size, color },
        style,
      ]}
    >
      Pappu
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  image: {
    position: 'absolute',
  },
  logoCircle: {
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInnerCircle: {
    borderWidth: 1.5,
    borderColor: colors.gold_edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontWeight: '700',
    color: colors.gold_edge,
    includeFontPadding: false,
  },
  wordmark: {
    fontFamily: 'BalooChettan2_700Bold',
    fontWeight: '700',
    letterSpacing: -0.3,
    includeFontPadding: false,
  },
});

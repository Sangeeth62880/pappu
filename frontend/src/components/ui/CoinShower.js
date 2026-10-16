import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { colors, typography } from '../../theme/tokens';
import { useReduceMotion } from '../../utils/reduceMotion';

export const MAX_COINS = 12;
export const SHOWER_DURATION_MS = 1200; // 1.2s duration per spec

/**
 * Celebratory coin shower triggered on income results strictly.
 * Displays up to 12 falling gold coins with slight rotations over 1.2s.
 * Completely skipped when Reduce Motion is enabled.
 */
export default function CoinShower({
  coinCount = MAX_COINS,
  onComplete = null,
  testID = 'coin-shower',
}) {
  const reduceMotion = useReduceMotion();
  const screenWidth = Dimensions.get('window').width || 390;
  const screenHeight = Dimensions.get('window').height || 844;

  const actualCount = Math.min(MAX_COINS, Math.max(1, coinCount));

  const animValues = useRef(
    Array.from({ length: actualCount }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    if (reduceMotion) {
      if (onComplete) onComplete();
      return;
    }

    const animations = animValues.map((anim, idx) => {
      const delay = idx * 45; // Staggered coin drop
      return Animated.timing(anim, {
        toValue: 1,
        duration: SHOWER_DURATION_MS - delay,
        delay,
        useNativeDriver: true,
      });
    });

    Animated.parallel(animations).start(() => {
      if (onComplete) onComplete();
    });
  }, [reduceMotion, animValues, onComplete]);

  if (reduceMotion) return null;

  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, styles.container]}
    >
      {animValues.map((anim, i) => {
        // Distribute coins evenly across viewport width with slight random offsets
        const startX = 24 + ((screenWidth - 64) / Math.max(1, actualCount - 1)) * i + ((i % 3) - 1) * 8;
        const rotateDeg = (i % 2 === 0 ? 1 : -1) * (180 + i * 25);

        const translateY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [-40, screenHeight * 0.75],
        });

        const rotate = anim.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${rotateDeg}deg`],
        });

        const opacity = anim.interpolate({
          inputRange: [0, 0.1, 0.8, 1],
          outputRange: [0, 1, 1, 0],
        });

        const scale = 0.85 + (i % 4) * 0.1;

        return (
          <Animated.View
            key={`shower-coin-${i}`}
            testID={`shower-coin-${i}`}
            style={[
              styles.coinWrapper,
              {
                left: startX,
                transform: [{ translateY }, { rotate }, { scale }],
                opacity,
              },
            ]}
          >
            <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
              <Circle cx="14" cy="14" r="13" fill={colors.gold} stroke={colors.ink} strokeWidth="2" />
              <Circle cx="14" cy="14" r="10" stroke={colors.gold_edge} strokeWidth="1.2" />
              <SvgText
                x="14"
                y="18"
                fontFamily={typography.fonts.display}
                fontWeight="800"
                fontSize="12"
                fill={colors.ink}
                textAnchor="middle"
              >
                ₹
              </SvgText>
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 999,
  },
  coinWrapper: {
    position: 'absolute',
    top: 0,
    width: 28,
    height: 28,
  },
});

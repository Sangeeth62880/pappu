import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors } from '../../theme/tokens';
import { useReduceMotion } from '../../utils/reduceMotion';

const SPEEDS_AND_RANGES = [
  { min: 0.25, max: 0.75, dur: 260 },
  { min: 0.35, max: 0.95, dur: 340 },
  { min: 0.45, max: 1.00, dur: 290 },
  { min: 0.30, max: 0.85, dur: 370 },
  { min: 0.20, max: 0.70, dur: 310 },
  { min: 0.38, max: 0.92, dur: 280 },
  { min: 0.22, max: 0.80, dur: 350 },
  { min: 0.40, max: 0.98, dur: 320 },
  { min: 0.28, max: 0.72, dur: 300 },
];

/**
 * Animated voice input wave indicator.
 * Renders dynamically oscillating bars while voice input is captured.
 */
export default function VoiceWaveAnimation({
  active = true,
  color = colors.ink,
  barWidth = 3.5,
  maxHeight = 22,
  minHeight = 5,
  gap = 3.5,
  barCount = 5,
  style = null,
  testID = 'voice-wave-animation',
}) {
  const reduceMotion = useReduceMotion();
  const count = Math.min(SPEEDS_AND_RANGES.length, Math.max(3, barCount));

  // Initialize animated values
  const animRefs = useRef([]);
  if (animRefs.current.length !== count) {
    animRefs.current = Array.from({ length: count }, (_, i) => {
      const spec = SPEEDS_AND_RANGES[i % SPEEDS_AND_RANGES.length];
      return new Animated.Value(spec.min);
    });
  }

  const isTest = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') || typeof jest !== 'undefined';

  useEffect(() => {
    if (!active || reduceMotion || isTest) {
      animRefs.current.forEach((anim, i) => {
        const spec = SPEEDS_AND_RANGES[i % SPEEDS_AND_RANGES.length];
        anim.setValue((spec.min + spec.max) / 2);
      });
      return;
    }

    const loops = animRefs.current.map((anim, i) => {
      const spec = SPEEDS_AND_RANGES[i % SPEEDS_AND_RANGES.length];
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: spec.max,
            duration: spec.dur,
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: spec.min,
            duration: spec.dur,
            useNativeDriver: false,
          }),
        ])
      );
    });

    loops.forEach((l) => l.start());

    return () => {
      loops.forEach((l) => l.stop());
    };
  }, [active, reduceMotion, count]);

  return (
    <View
      testID={testID}
      style={[styles.container, { height: maxHeight, gap }, style]}
      accessibilityRole="image"
      accessibilityLabel="Listening to voice input"
    >
      {animRefs.current.map((anim, idx) => {
        const height = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [minHeight, maxHeight],
        });

        return (
          <Animated.View
            key={idx}
            style={[
              styles.bar,
              {
                width: barWidth,
                height,
                backgroundColor: color,
                borderRadius: barWidth / 2,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    borderRadius: 2,
  },
});

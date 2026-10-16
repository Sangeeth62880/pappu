import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import Svg, { G, Circle, Rect, Path, Ellipse } from 'react-native-svg';
import { useReduceMotion } from '../../utils/reduceMotion';
import { colors } from '../../theme/tokens';

/**
 * Auth Mascot Component matching Stitch specifications.
 * Renders the exact gold coin mascot at 180px (Sign In) or 140px (Create Account).
 * Features:
 * - Eyes look down at active input when isFocused is true (pupil Y offset animated 0 -> 4px)
 * - Right arm transitions between cheerful wave and attentive downward posture
 * - Subtle 200ms head shake on wrong password / authentication failure
 * - Accessibility: respects reduce motion
 */
export default function AuthMascot({
  isFocused = false,
  size = 180,
  shakeTrigger = 0,
  testID = 'auth-mascot',
}) {
  const reduceMotion = useReduceMotion();
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const pupilAnim = useRef(new Animated.Value(isFocused ? 4 : 0)).current;
  const [pupilOffset, setPupilOffset] = useState(isFocused ? 4 : 0);

  // Subtle 200ms head shake animation on error
  useEffect(() => {
    if (!shakeTrigger || reduceMotion || isTest) return;

    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -6,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 6,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 30,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeTrigger, reduceMotion]);

  // Smooth pupil shift downwards when focusing inputs
  useEffect(() => {
    if (isTest) return;
    if (reduceMotion) {
      setPupilOffset(isFocused ? 4 : 0);
      return;
    }

    const anim = Animated.timing(pupilAnim, {
      toValue: isFocused ? 4 : 0,
      duration: 150,
      useNativeDriver: false,
    });

    const listenerId = pupilAnim.addListener(({ value }) => {
      setPupilOffset(value);
    });

    anim.start();

    return () => {
      pupilAnim.removeListener(listenerId);
      anim.stop();
    };
  }, [isFocused, reduceMotion]);

  const lookingDown = isTest ? isFocused : pupilOffset > 1.5;

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          transform: [{ translateX: shakeAnim }],
        },
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 180 180" fill="none">
        {/* Left Leg */}
        <Rect x="74" y="148" width="6" height="16" rx="3" fill={colors.ink} />
        <Path
          d="M68 164C68 161.8 69.8 160 72 160H80C82.2 160 84 161.8 84 164V165C84 165.6 83.6 166 83 166H69C68.4 166 68 165.6 68 165V164Z"
          fill={colors.ink}
        />

        {/* Right Leg */}
        <Rect x="100" y="148" width="6" height="16" rx="3" fill={colors.ink} />
        <Path
          d="M96 164C96 161.8 97.8 160 100 160H108C110.2 160 112 161.8 112 164V165C112 165.6 111.6 166 111 166H97C96.4 166 96 165.6 96 165V164Z"
          fill={colors.ink}
        />

        {/* Left Arm */}
        {lookingDown ? (
          <>
            <Path
              d="M36 88C28 100 28 114 36 124"
              stroke={colors.ink}
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />
            <Circle cx="37" cy="125" r="7" fill={colors.ink} />
          </>
        ) : (
          <>
            <Path
              d="M36 88C28 100 24 116 28 126"
              stroke={colors.ink}
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />
            <Circle cx="28" cy="128" r="7" fill={colors.ink} />
          </>
        )}

        {/* Right Arm: Waving happily when idle; pointing gently down when focused */}
        {lookingDown ? (
          <>
            <Path
              d="M144 88C152 98 152 114 144 124"
              stroke={colors.ink}
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />
            <Circle cx="143" cy="125" r="7" fill={colors.ink} />
          </>
        ) : (
          <>
            <Path
              d="M144 88C154 78 162 62 158 50"
              stroke={colors.ink}
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />
            <Circle cx="156" cy="48" r="7" fill={colors.ink} />
            <Path
              d="M166 42C168 45 168 49 166 52"
              stroke={colors.gold_edge}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <Path
              d="M171 39C174 44 174 51 171 56"
              stroke={colors.gold_edge}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Main Coin Body */}
        <Circle
          cx="90"
          cy="88"
          r="58"
          fill={colors.gold}
          stroke={colors.ink}
          strokeWidth="4"
        />

        {/* Inner Rim Ring at 8px inset */}
        <Circle
          cx="90"
          cy="88"
          r="50"
          stroke={colors.gold_edge}
          strokeWidth="2.5"
          fill="none"
        />

        {/* Embossed ₹ on Forehead Area */}
        <G transform="translate(85.5, 52) scale(0.9)">
          <Path
            d="M0 0H9M0 3H9M0 0V4C0 6.2 1.8 8 4 8H6.5C8 8 9 9 9 10.5C9 12 7.8 13 6 13H0M4 8L9 15"
            stroke={colors.gold_edge}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </G>

        {/* Left Eye */}
        <Ellipse
          cx="76"
          cy="86"
          rx="9"
          ry="12"
          fill={colors.surface}
          stroke={colors.ink}
          strokeWidth="2.5"
        />
        <Ellipse
          cx={lookingDown ? 76 : 77}
          cy={87 + pupilOffset}
          rx="5.5"
          ry={lookingDown ? 6.5 : 7.5}
          fill={colors.ink}
        />
        <Circle
          cx={lookingDown ? 78 : 79}
          cy={84 + pupilOffset * 1.25}
          r={lookingDown ? 2.2 : 2.5}
          fill={colors.surface}
        />

        {/* Right Eye */}
        <Ellipse
          cx="104"
          cy="86"
          rx="9"
          ry="12"
          fill={colors.surface}
          stroke={colors.ink}
          strokeWidth="2.5"
        />
        <Ellipse
          cx={lookingDown ? 104 : 105}
          cy={87 + pupilOffset}
          rx="5.5"
          ry={lookingDown ? 6.5 : 7.5}
          fill={colors.ink}
        />
        <Circle
          cx={lookingDown ? 106 : 107}
          cy={84 + pupilOffset * 1.25}
          r={lookingDown ? 2.2 : 2.5}
          fill={colors.surface}
        />

        {/* Eyebrows */}
        {lookingDown ? (
          <>
            <Path
              d="M71 72C74 71 80 71 83 73"
              stroke={colors.ink}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M97 73C100 71 106 71 109 72"
              stroke={colors.ink}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : (
          <>
            <Path
              d="M70 70C73 67 79 67 82 70"
              stroke={colors.ink}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M98 70C101 67 107 67 110 70"
              stroke={colors.ink}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </>
        )}

        {/* Smile */}
        <Path
          d={
            lookingDown
              ? 'M82 106C86 110 94 110 98 106'
              : 'M80 105C85 111 95 111 100 105'
          }
          stroke={colors.ink}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

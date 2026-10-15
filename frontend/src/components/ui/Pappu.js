import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Image, Animated, StyleSheet, Text } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';
import { useReduceMotion } from '../../utils/reduceMotion';
import { colors, typography } from '../../theme/tokens';

export const BLINK_INTERVAL_MIN = 3000;
export const BLINK_INTERVAL_MAX = 5000;
export const BLINK_DURATION = 120;

export const POSES = {
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

export const SERVER_MOODS = ['neutral', 'happy', 'excited', 'concerned', 'confused', 'worried'];
export const CLIENT_STATES = ['idle', 'listening', 'thinking', 'speaking', 'sleepy'];
export const ALL_POSES = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'happy',
  'excited',
  'worried',
  'concerned',
  'confused',
  'sleepy',
];

/**
 * Resolves Pappu mascot pose based on server mood and client state.
 * Server moods: neutral -> idle, happy, excited, concerned, confused, worried.
 * Client states: listening, thinking, speaking, sleepy override server moods.
 */
export function resolveMascotPose(arg1, arg2) {
  let serverMood = null;
  let clientState = null;
  let isSleepy = false;

  if (typeof arg1 === 'object' && arg1 !== null) {
    serverMood = arg1.serverMood ?? arg1.mood ?? null;
    clientState = arg1.clientState ?? arg1.state ?? null;
    isSleepy = Boolean(arg1.isSleepy);
  } else {
    serverMood = arg1;
    clientState = arg2;
  }

  // 1. Inactivity sleepy flag or explicit sleepy client state overrides everything
  if (isSleepy) return 'sleepy';

  // 2. Client interaction states that override server mood
  if (clientState) {
    const normClient = String(clientState).toLowerCase().trim();
    if (['listening', 'thinking', 'speaking', 'sleepy'].includes(normClient)) {
      return normClient;
    }
  }

  // 3. Server mood mapping
  if (serverMood) {
    const normMood = String(serverMood).toLowerCase().trim();
    if (normMood === 'neutral') return 'idle';
    if (ALL_POSES.includes(normMood)) return normMood;
  }

  // 4. If client state is a valid pose (e.g. idle)
  if (clientState) {
    const normClient = String(clientState).toLowerCase().trim();
    if (normClient === 'idle' || normClient === 'neutral') return 'idle';
  }

  return 'idle';
}

/**
 * Normalizes input server mood or client interaction state to an exact pose key.
 * Maintained for backward compatibility.
 */
export function normalizeMood(mood = 'idle') {
  return resolveMascotPose({ mood });
}

/**
 * Pappu Mascot Component.
 * Supports sizes 32, 48, 72, 120, 180 (aspect ratio approx 100:110).
 * 200ms crossfade between poses with micro-scale adjustment (scale 0.96 -> 1.0).
 * Idle blink via transform every 3 to 5 seconds (disabled if reduce motion is on).
 * Inactivity standby: transitions to sleepy after 60s idle with upward drifting 'z'.
 */
export default function Pappu({
  mood,
  serverMood,
  clientState,
  state,
  isSleepy: externalSleepy = false,
  autoSleepy = true,
  inactivityTimeoutMs = 60000,
  enableBlinkInTest = false,
  size = 120,
  style,
  testID = 'pappu-mascot',
}) {
  const reduceMotion = useReduceMotion();
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

  const [inactivitySleepy, setInactivitySleepy] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);

  // Compute active target pose
  const resolvedPose = resolveMascotPose({
    serverMood,
    clientState,
    mood,
    state,
    isSleepy: externalSleepy || inactivitySleepy,
  });

  const [activePose, setActivePose] = useState(resolvedPose);
  const [prevPose, setPrevPose] = useState(null);

  const crossfadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const zYAnim = useRef(new Animated.Value(0)).current;
  const zOpacityAnim = useRef(new Animated.Value(0)).current;

  // Inactivity timer: 60s idle -> sleepy state
  useEffect(() => {
    if (!autoSleepy || isTest || externalSleepy) return;

    // Any explicit client state (other than idle) or non-idle server mood resets inactivity
    const rawPose = resolveMascotPose({ serverMood, clientState, mood, state });
    if (rawPose !== 'idle') {
      setInactivitySleepy(false);
      return;
    }

    const timer = setTimeout(() => {
      setInactivitySleepy(true);
    }, inactivityTimeoutMs);

    return () => clearTimeout(timer);
  }, [serverMood, clientState, mood, state, autoSleepy, isTest, externalSleepy, inactivityTimeoutMs]);

  // Handle crossfade and micro-scale on pose change (200ms cubic-bezier(0.2, 0, 0, 1))
  useEffect(() => {
    if (resolvedPose !== activePose) {
      if (reduceMotion || isTest) {
        setActivePose(resolvedPose);
        setPrevPose(null);
        crossfadeAnim.setValue(1);
        scaleAnim.setValue(1);
      } else {
        setPrevPose(activePose);
        setActivePose(resolvedPose);
        crossfadeAnim.setValue(0);
        scaleAnim.setValue(0.96);

        Animated.parallel([
          Animated.timing(crossfadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setPrevPose(null);
        });
      }
    }
  }, [resolvedPose, activePose, reduceMotion, isTest, crossfadeAnim, scaleAnim]);

  // Idle mascot eye blink: only in Idle pose at random 3 to 5 second intervals, duration 120ms
  // Never while listening, thinking, speaking, or any other state. No blink under Reduce Motion.
  useEffect(() => {
    if (reduceMotion || activePose !== 'idle') {
      setIsBlinking(false);
      return;
    }
    if (isTest && !enableBlinkInTest) {
      setIsBlinking(false);
      return;
    }

    let timer;
    let blinkTimer;
    let cancelled = false;

    const scheduleBlink = () => {
      // Random interval between 3000ms and 5000ms (3 to 5 seconds)
      const delay = BLINK_INTERVAL_MIN + Math.random() * (BLINK_INTERVAL_MAX - BLINK_INTERVAL_MIN);
      timer = setTimeout(() => {
        if (cancelled) return;
        setIsBlinking(true);
        // Show closed eyes from Sleepy pose for 120ms
        blinkTimer = setTimeout(() => {
          if (cancelled) return;
          setIsBlinking(false);
          scheduleBlink();
        }, BLINK_DURATION);
      }, delay);
    };

    scheduleBlink();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(blinkTimer);
      setIsBlinking(false);
    };
  }, [activePose, reduceMotion, isTest, enableBlinkInTest]);

  // Sleepy floating "z" particle animation (2000ms drift upward 12px every 4s)
  useEffect(() => {
    if (reduceMotion || activePose !== 'sleepy' || isTest) {
      zYAnim.setValue(0);
      zOpacityAnim.setValue(0);
      return;
    }

    const zLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(zYAnim, {
            toValue: -12,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(zOpacityAnim, {
              toValue: 0.9,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(zOpacityAnim, {
              toValue: 0,
              duration: 1600,
              useNativeDriver: true,
            }),
          ]),
        ]),
        Animated.delay(2000), // 4s total interval
      ])
    );

    zYAnim.setValue(0);
    zOpacityAnim.setValue(0);
    zLoop.start();

    return () => {
      zLoop.stop();
    };
  }, [activePose, reduceMotion, isTest, zYAnim, zOpacityAnim]);

  const height = Math.round(size * 1.1); // 100:110 aspect ratio

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          width: size,
          height,
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

      {/* Active Pose with micro-scale adjustment */}
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
              transform: [{ scale: prevPose ? scaleAnim : 1 }],
            },
          ]}
          resizeMode="contain"
        />
      ) : null}

      {/* Idle eye blink overlay: 120ms closed eyes taken from Sleepy pose artwork */}
      {activePose === 'idle' && isBlinking && !reduceMotion && (
        <View
          testID="pappu-blink-overlay"
          pointerEvents="none"
          style={[styles.blinkOverlay, { width: size, height }]}
        >
          <Svg width={size} height={height} viewBox="0 0 100 110" fill="none">
            {/* Skin patch covering open eyes: exact body gold color (#FFC83D) */}
            <Ellipse cx="41" cy="48" rx="6.5" ry="8.5" fill={colors.gold} />
            <Ellipse cx="59" cy="48" rx="6.5" ry="8.5" fill={colors.gold} />
            {/* Closed eyes paths taken directly from pappu-sleepy.svg */}
            <Path
              d="M 37 50 Q 41 54 45 50"
              stroke={colors.ink}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M 55 50 Q 59 54 63 50"
              stroke={colors.ink}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </View>
      )}

      {/* Sleepy Floating "z" Particle */}
      {activePose === 'sleepy' && !reduceMotion && !isTest && (
        <Animated.View
          testID="pappu-sleepy-z"
          style={[
            styles.sleepyZContainer,
            {
              top: Math.round(height * 0.15),
              right: Math.round(size * 0.12),
              opacity: zOpacityAnim,
              transform: [{ translateY: zYAnim }],
            },
          ]}
        >
          <Text style={[styles.sleepyZText, { fontSize: Math.max(12, Math.round(size * 0.16)) }]}>
            z
          </Text>
        </Animated.View>
      )}
    </View>
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
  sleepyZContainer: {
    position: 'absolute',
    pointerEvents: 'none',
  },
  blinkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
  },
  sleepyZText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontWeight: '700',
    color: colors.ink_muted,
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


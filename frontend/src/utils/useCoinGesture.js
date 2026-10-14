import { useState, useRef, useCallback } from 'react';
import { Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useReduceMotion } from './reduceMotion';

/**
 * Shared hook for Coin Button tap and hold gesture.
 * Tap (<300ms) opens the Assistant modal.
 * Press & Hold (>=300ms) records from any screen: shows Pappu listening in place.
 * On release after hold: stubs send step and logs recording length.
 * Coin tilt: 10 degrees clockwise over 200ms with light haptic on press.
 * Reduce Motion fallback: tilt and scale animations disabled.
 */
export function useCoinGesture({
  onTap = null,
  onRecordingComplete = null,
  onOpenAssistant = null,
} = {}) {
  const reduceMotion = useReduceMotion();
  const [isRecording, setIsRecording] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const startTimeRef = useRef(null);
  const holdTimerRef = useRef(null);

  // Animation values: tilt (0 to 1 -> 0deg to 10deg), scale (1 to 1.06)
  const tiltAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    const now = Date.now();
    startTimeRef.current = now;
    setIsPressed(true);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (e) {}

    if (!reduceMotion) {
      Animated.parallel([
        Animated.timing(tiltAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.06,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }

    holdTimerRef.current = setTimeout(() => {
      setIsRecording(true);
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      } catch (e) {}
    }, 300);
  }, [reduceMotion, tiltAnim, scaleAnim]);

  const handlePressOut = useCallback(() => {
    const elapsed = Date.now() - (startTimeRef.current || Date.now());
    setIsPressed(false);

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (!reduceMotion) {
      Animated.parallel([
        Animated.timing(tiltAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      tiltAnim.setValue(0);
      scaleAnim.setValue(1);
    }

    if (elapsed < 300) {
      // Released in under 300ms: treat as tap
      setIsRecording(false);
      if (onTap) {
        onTap();
      } else if (onOpenAssistant) {
        onOpenAssistant();
      }
    } else {
      // Held for 300ms or longer: recording complete
      setIsRecording(false);
      console.log('Recording length:', elapsed, 'ms');
      if (onRecordingComplete) {
        onRecordingComplete({ durationMs: elapsed });
      }
      if (onOpenAssistant) {
        onOpenAssistant({ recordedDuration: elapsed });
      }
    }
  }, [reduceMotion, tiltAnim, scaleAnim, onTap, onOpenAssistant, onRecordingComplete]);

  return {
    isRecording,
    isPressed,
    tiltAnim,
    scaleAnim,
    handlePressIn,
    handlePressOut,
  };
}

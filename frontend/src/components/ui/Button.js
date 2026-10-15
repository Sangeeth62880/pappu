import React, { useRef, useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useReduceMotion } from '../../utils/reduceMotion';
import { colors, radius, spacing, typography, buttonEdgeColors } from '../../theme/tokens';

/**
 * Tactile Button Primitive matching Stitch specifications.
 * 4 variants: primary (gold), secondary (white), destructive (coral), destructive outline.
 * 4px solid physical bottom edge that depresses on press down over 80ms with light haptic feedback.
 */
export default function Button({
  title,
  onPress,
  variant = 'primary', // 'primary' | 'secondary' | 'destructive' | 'destructive_outline' | 'destructiveOutline'
  size = 'md', // 'sm' | 'md' (52px standard) | 'dialog' (48px)
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
  accessibilityLabel,
  testID = 'button',
}) {
  const normVariant = variant === 'destructiveOutline' ? 'destructive_outline' : variant;
  const isInteractive = !loading && !disabled;

  const reduceMotion = useReduceMotion();
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  const pressAnim = useRef(new Animated.Value(0)).current; // 0 = unpressed, 1 = pressed
  const handlePressIn = () => {
    if (!isInteractive) return;
    if (reduceMotion || isTest) {
      pressAnim.setValue(1);
    } else {
      Animated.timing(pressAnim, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }).start();
    }
    if (!isTest) {
      try {
        const feedback = normVariant === 'destructive'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light;
        Haptics.impactAsync(feedback).catch(() => {});
      } catch (e) {
        // Haptics safe fallback for web / testing
      }
    }
  };

  const handlePressOut = () => {
    if (!isInteractive) return;
    if (reduceMotion || isTest) {
      pressAnim.setValue(0);
    } else {
      Animated.timing(pressAnim, {
        toValue: 0,
        duration: 120, // 120ms release back per spec
        useNativeDriver: true,
      }).start();
    }
  };

  const edgeColor = buttonEdgeColors[normVariant] || buttonEdgeColors.primary;
  const faceStyle = variantFaceStyles[normVariant] || variantFaceStyles.primary;
  const textColor = textColors[normVariant] || colors.ink;
  const minHeight = size === 'dialog' ? 48 : size === 'sm' ? 40 : 52;

  const translateY = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 4],
  });

  return (
    <View style={[styles.outerContainer, { height: minHeight + 4 }, style]}>
      {/* 4px Tactile Bottom Edge Layer */}
      <View
        testID={`${testID}-edge`}
        style={[
          styles.edgeLayer,
          {
            backgroundColor: edgeColor,
            borderRadius: radius.button,
            height: minHeight,
          },
        ]}
      />

      {/* Button Face Depressing Over Edge */}
      <Animated.View
        testID={`${testID}-face-wrapper`}
        style={[
          styles.faceWrapper,
          {
            transform: [{ translateY }],
            borderRadius: radius.button,
            height: minHeight,
          },
        ]}
      >
        <TouchableOpacity
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel || title}
          accessibilityState={{ disabled: !isInteractive, busy: loading }}
          activeOpacity={1}
          disabled={!isInteractive}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[
            styles.touchableFace,
            faceStyle,
            { height: minHeight, borderRadius: radius.button },
            disabled && styles.disabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator
              size="small"
              color={normVariant === 'destructive' ? colors.surface : colors.ink}
            />
          ) : (
            <View style={styles.contentRow}>
              {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
              {title ? (
                <Text
                  style={[
                    styles.buttonText,
                    typography.button_label,
                    { color: textColor },
                    textStyle,
                  ]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              ) : null}
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'relative',
  },
  edgeLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 4,
    bottom: 0,
  },
  faceWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  touchableFace: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: spacing.sm,
  },
  buttonText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
  disabled: {
    opacity: 0.5,
  },
});

const variantFaceStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.gold_edge,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  destructive: {
    backgroundColor: colors.expense,
  },
  destructive_outline: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.expense,
  },
});

const textColors = {
  primary: colors.ink,
  secondary: colors.ink,
  destructive: colors.surface,
  destructive_outline: colors.expense,
};

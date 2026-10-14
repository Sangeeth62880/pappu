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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
        duration: 80,
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
    <View style={[styles.outerContainer, style]}>
      {/* 4px Tactile Bottom Edge Layer */}
      <View
        style={[
          styles.edgeLayer,
          {
            backgroundColor: edgeColor,
            borderRadius: radius.button,
            minHeight,
          },
        ]}
      />

      {/* Button Face Depressing Over Edge */}
      <Animated.View
        style={[
          styles.faceWrapper,
          {
            transform: [{ translateY }],
            borderRadius: radius.button,
            minHeight,
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
            { minHeight, borderRadius: radius.button },
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
    paddingBottom: 4, // Allocates 4px for the solid tactile edge
  },
  edgeLayer: {
    ...StyleSheet.absoluteFillObject,
    top: 4, // Sits 4px below the face to provide solid tactile bottom rim
  },
  faceWrapper: {
    width: '100%',
  },
  touchableFace: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
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

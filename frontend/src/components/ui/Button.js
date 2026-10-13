import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

export default function Button({
  title,
  onPress,
  variant = 'primary', // 'primary' | 'secondary' | 'ghost' | 'destructive'
  size = 'md',        // 'sm' | 'md' | 'lg'
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
  accessibilityLabel,
  testID = 'button',
}) {
  const isInteractive = !loading && !disabled;

  const variantStyle = variantStyles[variant] || variantStyles.primary;
  const textColor = textColors[variant] || colors.text.inverse;
  const sizeStyle = sizeContainerStyles[size] || sizeContainerStyles.md;
  const textSizeStyle = sizeTextStyles[size] || sizeTextStyles.md;

  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !isInteractive, busy: loading }}
      activeOpacity={0.75}
      disabled={!isInteractive}
      onPress={onPress}
      style={[
        styles.base,
        sizeStyle,
        variantStyle,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.text.inverse : colors.brand.default}
        />
      ) : (
        <View style={styles.contentRow}>
          {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
          {title ? (
            <Text
              style={[
                styles.text,
                textSizeStyle,
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
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: spacing.sm,
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
});

const sizeContainerStyles = StyleSheet.create({
  sm: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  md: {
    minHeight: 48, // 48px minimum target
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  lg: {
    minHeight: 54,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.lg,
  },
});

const sizeTextStyles = StyleSheet.create({
  sm: {
    fontSize: 13,
    lineHeight: 18,
  },
  md: {
    fontSize: 15,
    lineHeight: 20,
  },
  lg: {
    fontSize: 17,
    lineHeight: 24,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.brand.default,
  },
  secondary: {
    backgroundColor: colors.brand.tint,
    borderWidth: 1,
    borderColor: colors.brand.tintBorder,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  destructive: {
    backgroundColor: colors.semantic.expenseBg,
    borderWidth: 1,
    borderColor: colors.semantic.expenseBorder,
  },
});

const textColors = {
  primary: colors.text.inverse,
  secondary: colors.brand.dark,
  ghost: colors.brand.default,
  destructive: colors.semantic.expense,
};

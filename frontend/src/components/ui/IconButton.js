import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

export default function IconButton({
  onPress,
  icon,
  accessibilityLabel,
  size = 44, // 44px min target
  variant = 'ghost', // 'ghost' | 'tint' | 'outline' | 'solid'
  style,
  disabled = false,
  testID = 'icon-button',
}) {
  const variantStyle = variantStyles[variant] || variantStyles.ghost;

  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.7}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.base,
        { width: Math.max(size, 44), height: Math.max(size, 44) },
        variantStyle,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  disabled: {
    opacity: 0.4,
  },
});

const variantStyles = StyleSheet.create({
  ghost: {
    backgroundColor: 'transparent',
  },
  tint: {
    backgroundColor: colors.surfaceSubtle,
  },
  outline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  solid: {
    backgroundColor: colors.brand.default,
  },
});

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, shadows, spacing } from '../../theme/tokens';

export default function Card({
  children,
  style,
  elevation = 'sm', // 'none' | 'sm' | 'md' | 'lg'
  padding = 'lg',   // 'none' | 'sm' | 'md' | 'lg' | 'xl'
  testID = 'card',
  ...props
}) {
  const shadowStyle = elevation !== 'none' ? shadows[elevation] || shadows.sm : null;
  const paddingVal = padding === 'none' ? 0 : spacing[padding] || spacing.lg;

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        shadowStyle,
        { padding: paddingVal },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
  },
});

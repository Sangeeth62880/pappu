import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

export default function Card({
  children,
  style,
  padding = 'lg',
  testID = 'card',
  ...props
}) {
  const paddingVal = padding === 'none' ? 0 : spacing[padding] || spacing.lg;

  return (
    <View
      testID={testID}
      style={[
        styles.card,
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
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
  },
});

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius } from '../../theme/tokens';

/**
 * Skeleton Primitive.
 * Strictly flat blocks filled with border #F0E4C8.
 * Shimmer animations, gradients, and blurs are completely banned.
 */
export default function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = radius.small,
  style,
  testID = 'skeleton',
}) {
  return (
    <View
      testID={testID}
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.border,
  },
});

import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, shadows, spacing } from '../../theme/tokens';

export default function GlassCard({
  children,
  style,
  intensity = 65,
  padding = 'lg',
  fallbackToSolid = false,
  testID = 'glass-card',
  ...props
}) {
  const paddingVal = padding === 'none' ? 0 : spacing[padding] || spacing.lg;
  const isAndroid = Platform.OS === 'android';

  // Android or explicit fallback: render pristine solid white card with crisp shadow
  if (isAndroid || fallbackToSolid) {
    return (
      <View
        testID={testID}
        style={[
          styles.androidFallback,
          shadows.md,
          { padding: paddingVal },
          style,
        ]}
        {...props}
      >
        {children}
      </View>
    );
  }

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        shadows.sm,
        style,
      ]}
      {...props}
    >
      <BlurView
        intensity={intensity}
        tint="light"
        style={[styles.blur, { padding: paddingVal }]}
      >
        {children}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  blur: {
    width: '100%',
    height: '100%',
  },
  androidFallback: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
  },
});

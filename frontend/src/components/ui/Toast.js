import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { colors, radius, shadows, spacing } from '../../theme/tokens';

export default function Toast({
  visible,
  message,
  actionText = 'Undo',
  onAction,
  onDismiss,
  duration = 4000,
  testID = 'toast',
}) {
  const [mounted, setMounted] = useState(Boolean(visible));
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        hideToast();
      }, duration);

      return () => clearTimeout(timer);
    } else if (mounted) {
      hideToast();
    }
  }, [visible]);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setMounted(false);
      if (onDismiss) onDismiss();
    });
  };

  if (!visible && !mounted) return null;

  return (
    <Animated.View
      testID={testID}
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={styles.card} pointerEvents="auto">
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
        {actionText && onAction ? (
          <TouchableOpacity
            testID="toast-action"
            onPress={() => {
              onAction();
              hideToast();
            }}
            accessibilityRole="button"
            accessibilityLabel={actionText}
            style={styles.actionBtn}
          >
            <Text style={styles.actionText}>{actionText}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80, // Positioned safely above bottom tab bar
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 999,
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A', // Dark slate surface for contrast
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    width: '100%',
    ...shadows.lg,
  },
  message: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    marginRight: spacing.md,
  },
  actionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  actionText: {
    color: '#60A5FA', // Light blue
    fontSize: 14,
    fontWeight: '700',
  },
});

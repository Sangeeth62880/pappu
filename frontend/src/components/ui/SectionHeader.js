import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing } from '../../theme/tokens';

export default function SectionHeader({
  title,
  actionText,
  onActionPress,
  style,
  testID = 'section-header',
}) {
  return (
    <View style={[styles.container, style]} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      {actionText && onActionPress ? (
        <TouchableOpacity
          onPress={onActionPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={actionText}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID="section-header-action"
        >
          <Text style={styles.actionText}>{actionText}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brand.default,
  },
});

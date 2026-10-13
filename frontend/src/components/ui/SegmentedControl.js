import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radius, spacing, shadows } from '../../theme/tokens';

export default function SegmentedControl({
  segments = [], // e.g. [{ key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }, ...]
  selectedKey,
  onSelect,
  style,
  testID = 'segmented-control',
}) {
  return (
    <View testID={testID} style={[styles.container, style]}>
      {segments.map((segment) => {
        const key = typeof segment === 'string' ? segment : segment.key;
        const label = typeof segment === 'string' ? segment : segment.label;
        const isSelected = selectedKey === key;

        return (
          <TouchableOpacity
            key={key}
            testID={`segment-${key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={label}
            activeOpacity={0.8}
            onPress={() => onSelect && onSelect(key)}
            style={[
              styles.segment,
              isSelected && styles.selectedSegment,
            ]}
          >
            <Text
              style={[
                styles.label,
                isSelected ? styles.selectedLabel : styles.unselectedLabel,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#EEF2F6', // Soft slate tint
    borderRadius: radius.full,
    padding: 3,
    minHeight: 44,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 38,
  },
  selectedSegment: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    includeFontPadding: false,
  },
  selectedLabel: {
    color: colors.brand.default,
  },
  unselectedLabel: {
    color: colors.text.secondary,
  },
});

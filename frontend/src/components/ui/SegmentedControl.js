import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

export default function SegmentedControl({
  segments = [], // e.g. [{ key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' }]
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
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 3,
    minHeight: 44,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 36,
  },
  selectedSegment: {
    backgroundColor: colors.gold,
  },
  label: {
    fontSize: 14,
    includeFontPadding: false,
  },
  selectedLabel: {
    fontFamily: 'BalooChettan2_700Bold',
    fontWeight: '700',
    color: colors.ink,
  },
  unselectedLabel: {
    fontFamily: 'Nunito_600SemiBold',
    fontWeight: '600',
    color: colors.ink_muted,
  },
});

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export default function Chip({
  label,
  selected = false,
  onPress,
  leadingIcon,
  count,
  dotColor,
  style,
  testID = 'chip',
}) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.chip,
        selected ? styles.chipSelected : styles.chipUnselected,
        style,
      ]}
    >
      {dotColor ? (
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      ) : null}

      {leadingIcon ? (
        <View style={styles.leadingIcon}>{leadingIcon}</View>
      ) : null}

      <Text
        style={[
          styles.label,
          selected ? styles.labelSelected : styles.labelUnselected,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>

      {count !== undefined && count !== null ? (
        <View
          style={[
            styles.countBadge,
            selected ? styles.countBadgeSelected : styles.countBadgeUnselected,
          ]}
        >
          <Text
            style={[
              styles.countText,
              selected ? styles.countTextSelected : styles.countTextUnselected,
            ]}
          >
            {count}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 2,
    marginRight: spacing.sm,
  },
  chipUnselected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.gold,
    borderColor: colors.gold_edge,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  leadingIcon: {
    marginRight: 6,
  },
  label: {
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
  },
  labelUnselected: {
    fontFamily: 'Nunito_600SemiBold',
    color: colors.ink,
    fontWeight: '600',
  },
  labelSelected: {
    fontFamily: 'BalooChettan2_700Bold',
    color: colors.ink,
    fontWeight: '700',
  },
  countBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  countBadgeUnselected: {
    backgroundColor: colors.bg,
  },
  countBadgeSelected: {
    backgroundColor: colors.surface,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
  },
  countTextUnselected: {
    color: colors.ink_muted,
  },
  countTextSelected: {
    color: colors.ink,
  },
});

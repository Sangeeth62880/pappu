import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

export default function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  showDivider = true,
  style,
  testID = 'list-row',
}) {
  const content = (
    <View
      style={[
        styles.row,
        showDivider && styles.rowDivider,
        style,
      ]}
      testID={testID}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.middle}>
        {title ? (
          <Text
            style={[styles.title, typography.body_main]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text
            style={[styles.subtitle, typography.body_secondary]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        style={styles.touchable}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  touchable: {
    minHeight: 64,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 64,
    backgroundColor: colors.surface,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  leading: {
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.ink,
    fontFamily: 'Nunito_600SemiBold',
    includeFontPadding: false,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink_muted,
    fontFamily: 'Nunito_600SemiBold',
    marginTop: 2,
    includeFontPadding: false,
  },
  trailing: {
    marginLeft: spacing.md,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});

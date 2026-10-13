import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing } from '../../theme/tokens';

export default function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  style,
  testID = 'list-row',
}) {
  const content = (
    <View style={[styles.row, style]} testID={testID}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.middle}>
        {title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
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
    minHeight: 48,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    minHeight: 48,
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
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: 20,
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
    marginTop: 2,
  },
  trailing: {
    marginLeft: spacing.md,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});

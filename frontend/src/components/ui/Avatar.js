import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../../theme/tokens';

const TOKEN_AVATAR_PALETTE = [
  { bg: colors.categories.people, text: colors.surface },
  { bg: colors.categories.food, text: colors.surface },
  { bg: colors.categories.shopping, text: colors.surface },
  { bg: colors.categories.transport, text: colors.ink },
  { bg: colors.gold, text: colors.ink },
  { bg: colors.ink, text: colors.surface },
];

function getInitials(name = '') {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getPalette(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % TOKEN_AVATAR_PALETTE.length;
  return TOKEN_AVATAR_PALETTE[index];
}

export default function Avatar({
  name = '',
  size = 40,
  style,
  textStyle,
  testID = 'avatar',
}) {
  const initials = getInitials(name);
  const { bg, text } = getPalette(name);
  const fontSize = Math.round(size * 0.4);

  return (
    <View
      testID={testID}
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          { fontSize, color: text },
          textStyle,
        ]}
      >
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
    fontFamily: 'BalooChettan2_700Bold',
    includeFontPadding: false,
  },
});

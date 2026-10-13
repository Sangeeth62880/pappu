import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../../theme/tokens';

const AVATAR_PALETTE = [
  { bg: '#EFF6FF', text: '#1D4ED8' }, // Blue
  { bg: '#F5F3FF', text: '#5B21B6' }, // Violet
  { bg: '#FDF2F8', text: '#9D174D' }, // Pink
  { bg: '#ECFDF5', text: '#065F46' }, // Emerald
  { bg: '#FFFBEB', text: '#92400E' }, // Amber
  { bg: '#F0F9FF', text: '#0369A1' }, // Sky
  { bg: '#FAF5FF', text: '#6B21A8' }, // Purple
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
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
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
    includeFontPadding: false,
  },
});

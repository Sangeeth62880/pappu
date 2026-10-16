import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, typography } from '../../theme/tokens';

/**
 * Formats a numeric value into an Indian currency display string.
 * Whole numbers omit decimal places; fractional numbers show 2 decimals.
 */
export function formatAmount(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  const num = Number(val);
  const isWhole = num % 1 === 0;
  const absNum = Math.abs(num);

  const formattedNumber = absNum.toLocaleString('en-IN', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  });

  return formattedNumber;
}

/**
 * AmountText Primitive.
 * Signed, colored, tabular numerals, never truncated.
 */
export default function AmountText({
  amount,
  type = 'neutral', // 'income' | 'expense' | 'neutral'
  showSign = false,
  currency = '₹',
  size = 'md', // 'caption' | 'sm' | 'md' | 'lg' | 'xl' | 'display'
  colorOverride,
  style,
  testID = 'amount-text',
}) {
  const num = Number(amount || 0);
  const formatted = formatAmount(num);

  let sign = '';
  if (showSign) {
    if (type === 'income') {
      sign = '+';
    } else if (type === 'expense') {
      sign = '−';
    } else if (num > 0) {
      sign = '+';
    } else if (num < 0) {
      sign = '−';
    }
  }

  let textColor = colors.ink;
  if (colorOverride) {
    textColor = colorOverride;
  } else if (type === 'income') {
    textColor = colors.income;
  } else if (type === 'expense') {
    textColor = colors.expense;
  }

  const sizeStyle = sizeStyles[size] || sizeStyles.md;

  return (
    <Text
      testID={testID}
      style={[
        styles.base,
        sizeStyle,
        { color: textColor },
        style,
      ]}
      numberOfLines={1}
      adjustsFontSizeToFit={false}
    >
      {sign}{currency}{formatted}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: 'BalooChettan2_700Bold',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
});

const sizeStyles = StyleSheet.create({
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  sm: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  md: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  lg: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  xl: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
  },
  display: {
    fontFamily: 'BalooChettan2_800ExtraBold',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
  },
});

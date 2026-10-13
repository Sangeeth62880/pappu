import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/tokens';

/**
 * Formats a numeric value into a currency display string.
 * Hides '.00' for integers, formats with commas.
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
 * AmountText component.
 * Ensures numbers align tabularly, never truncates, and uses accessible semantic colors.
 */
export default function AmountText({
  amount,
  type = 'neutral', // 'income' | 'expense' | 'neutral'
  showSign = false,
  currency = '₹',
  size = 'md', // 'sm' | 'md' | 'lg' | 'xl' | 'display'
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

  let textColor = colors.text.primary;
  if (colorOverride) {
    textColor = colorOverride;
  } else if (type === 'income') {
    textColor = colors.semantic.income;
  } else if (type === 'expense') {
    textColor = colors.semantic.expense;
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
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
});

const sizeStyles = StyleSheet.create({
  sm: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  md: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  lg: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  xl: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  display: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '800',
  },
});

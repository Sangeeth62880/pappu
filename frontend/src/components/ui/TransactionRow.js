import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import AmountText from './AmountText';

/**
 * Modern light transaction row.
 * Scannable, clean, with accessible amounts and category badge/date.
 *
 * Props:
 *   category    — string, e.g. "Food"
 *   description — string (optional)
 *   amount      — number or string
 *   type        — 'income' | 'expense'
 *   date        — string, e.g. "2026-08-31"
 *   testID      — string (optional)
 */
export default function TransactionRow({
  category,
  description,
  amount,
  type,
  date,
  testID,
}) {
  const isIncome = type === 'income';
  const displayDate = formatDate(date);

  return (
    <View testID={testID} style={styles.row}>
      {/* Date */}
      <View style={styles.dateCol}>
        <Text style={styles.dateText}>{displayDate}</Text>
      </View>

      {/* Category + Description */}
      <View style={styles.infoCol}>
        <Text style={styles.titleText} numberOfLines={1}>
          {category || 'Transaction'}
        </Text>
        {description ? (
          <Text style={styles.descText} numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>

      {/* Amount with tabular formatting */}
      <AmountText
        amount={amount}
        type={isIncome ? 'income' : 'expense'}
        showSign={true}
        size="md"
      />
    </View>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return "Y'day";

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  } catch {
    return dateStr;
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    minHeight: 48,
  },
  dateCol: {
    width: 54,
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.muted,
  },
  infoCol: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  descText: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
});

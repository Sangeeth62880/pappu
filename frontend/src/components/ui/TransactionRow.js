import React from 'react';
import { View, Text } from 'react-native';

/**
 * Passbook-style transaction row — quiet, dense, scannable.
 * No cards, no drop shadows. Just a bottom border between rows.
 *
 * Props:
 *   category    — string, e.g. "Food & Dining"
 *   description — string (optional)
 *   amount      — number or string
 *   type        — 'income' | 'expense'
 *   date        — string, e.g. "2026-08-31"
 *   testID      — string (optional)
 */
export default function TransactionRow({ category, description, amount, type, date, testID }) {
  const isIncome = type === 'income';
  const formattedAmount = Number(amount).toFixed(2);
  const sign = isIncome ? '+' : '−';
  const amountColor = isIncome ? 'text-banana-leaf' : 'text-clay-rust';

  // Format date to a shorter display
  const displayDate = formatDate(date);

  return (
    <View
      testID={testID}
      className="flex-row items-center py-3 border-b border-ink-navy-lighter"
    >
      {/* Date column */}
      <Text className="text-bone-darker font-sans text-[11px] w-16 font-medium">
        {displayDate}
      </Text>

      {/* Category + Description */}
      <View className="flex-1 px-3">
        <Text className="text-bone font-sans text-sm font-medium" numberOfLines={1}>
          {category || 'Transaction'}
        </Text>
        {description ? (
          <Text className="text-bone-darker font-sans text-xs mt-0.5" numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>

      {/* Amount — serif */}
      <Text
        className={`font-serif text-sm font-bold ${amountColor}`}
        style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
      >
        {sign}₹{formattedAmount}
      </Text>
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
    if (d.toDateString() === yesterday.toDateString()) return 'Y\'day';

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  } catch {
    return dateStr;
  }
}

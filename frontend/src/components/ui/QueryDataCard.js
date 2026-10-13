import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';

const CATEGORY_ICONS = {
  Food: '🍔',
  Transport: '🚗',
  Shopping: '🛍️',
  Bills: '📄',
  Entertainment: '🎬',
  Salary: '💼',
  People: '👥',
  Other: '🏷️',
};

export default function QueryDataCard({ result }) {
  const [showAll, setShowAll] = useState(false);
  if (!result) return null;

  const category = result.category || 'All';
  const icon = CATEGORY_ICONS[category] || '📊';
  const totalAmount = Number(result.total_amount || result.total_expense || result.total_sent || 0);
  const count = result.count ?? (result.transactions?.length || 0);
  const period = result.period || (result.contact_name ? `With ${result.contact_name}` : 'Overview');
  const transactions = result.transactions || [];
  const displayTransactions = showAll ? transactions : transactions.slice(0, 3);

  return (
    <View
      testID="query-data-card"
      className="my-2 bg-ink-navy-light border border-warm-brass/40 rounded-2xl p-4 shadow-sm"
    >
      {/* Header Badge & Period */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center bg-ink-navy px-2.5 py-1 rounded-full border border-ink-navy-lighter">
          <Text className="text-xs mr-1">{icon}</Text>
          <Text className="text-warm-brass font-sans text-xs font-semibold">
            {result.contact_name ? result.contact_name : category}
          </Text>
        </View>
        <Text className="text-bone-darker font-sans text-[11px] font-medium">
          {period}
        </Text>
      </View>

      {/* Main Stat / Big Number */}
      <View className="my-1.5">
        <Text className="text-bone-darker font-sans text-[10px] uppercase tracking-wider">
          {result.status === 'queried_contact'
            ? result.display_text
            : `Total ${category === 'All' ? 'Spending' : category}`}
        </Text>
        <Text
          className="text-bone text-2xl font-bold mt-0.5 tracking-tight"
          style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
        >
          ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      </View>

      {/* Transaction List Preview */}
      {transactions.length > 0 && (
        <View className="mt-3 pt-2.5 border-t border-ink-navy-lighter">
          <View className="flex-row justify-between items-center mb-1.5">
            <Text className="text-bone-darker font-sans text-[11px] font-medium">
              Transactions ({count})
            </Text>
            {transactions.length > 3 && (
              <Pressable
                testID="query-card-toggle-view"
                onPress={() => setShowAll(!showAll)}
                className="py-0.5 px-1.5"
              >
                <Text className="text-warm-brass font-sans text-[11px] font-medium">
                  {showAll ? 'Show less' : `View all ${count}`}
                </Text>
              </Pressable>
            )}
          </View>

          {displayTransactions.map((t, idx) => (
            <View
              key={t.id || idx}
              className="flex-row justify-between items-center py-1.5 border-b border-ink-navy-lighter/60"
            >
              <View className="flex-1 pr-2">
                <Text className="text-bone font-sans text-xs" numberOfLines={1}>
                  {t.description || t.category_name || category}
                </Text>
                <Text className="text-bone-darker font-sans text-[10px]">
                  {t.txn_date || 'Recent'}
                </Text>
              </View>
              <Text
                className={`font-serif text-xs font-semibold ${
                  t.type === 'income' ? 'text-banana-leaf' : 'text-bone'
                }`}
              >
                {t.type === 'income' ? '+' : '-'}₹{Number(t.amount || 0).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Empty State */}
      {count === 0 && (
        <Text className="text-bone-darker font-sans text-xs italic mt-2">
          No matching transactions recorded.
        </Text>
      )}
    </View>
  );
}

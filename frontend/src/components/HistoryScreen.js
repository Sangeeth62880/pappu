import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { fetchTransactions } from '../api/client';
import TransactionRow from './ui/TransactionRow';

/**
 * Full transaction history — passbook aesthetic.
 * Grouped by date, dense, scannable.
 */
export default function HistoryScreen({ token, refreshTrigger = 0 }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchTransactions(token, { limit: 100 });
        setTransactions(data || []);
      } catch (err) {
        setError(err.message || 'Failed to load transactions');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, refreshTrigger]);

  // Group transactions by date
  const grouped = groupByDate(transactions);

  if (loading && transactions.length === 0) {
    return (
      <View testID="history-loading" className="flex-1 bg-ink-navy items-center justify-center">
        <ActivityIndicator size="small" color="#C9A227" />
        <Text className="text-bone-darker font-sans text-xs mt-2">Loading history…</Text>
      </View>
    );
  }

  return (
    <ScrollView testID="history-view" className="flex-1 bg-ink-navy px-5 pt-2">
      {/* Header label */}
      <View className="py-3 mb-2">
        <Text className="text-bone-darker font-sans text-[10px] font-medium uppercase tracking-widest">
          Transaction History
        </Text>
      </View>

      {error && (
        <View className="p-3 bg-clay-rust/15 border border-clay-rust/30 rounded-xl mb-3">
          <Text className="text-clay-rust-light font-sans text-xs">{error}</Text>
        </View>
      )}

      {transactions.length === 0 && !loading ? (
        <Text className="text-bone-darker font-sans text-xs italic text-center py-8"
          style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
        >
          No transactions recorded yet
        </Text>
      ) : (
        Object.entries(grouped).map(([dateLabel, txns]) => (
          <View key={dateLabel} className="mb-4">
            {/* Date group header */}
            <Text className="text-bone-darker font-sans text-[10px] font-medium uppercase tracking-widest mb-1 mt-2">
              {dateLabel}
            </Text>
            {txns.map((txn) => (
              <TransactionRow
                key={txn.id}
                testID={`history-txn-${txn.id}`}
                category={txn.category_name}
                description={txn.description}
                amount={txn.amount}
                type={txn.type}
                date={txn.txn_date}
              />
            ))}
          </View>
        ))
      )}

      {/* Bottom spacer */}
      <View className="h-6" />
    </ScrollView>
  );
}

/**
 * Group transactions by display date (Today, Yesterday, or date string).
 */
function groupByDate(transactions) {
  const groups = {};
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (const txn of transactions) {
    let label;
    try {
      const d = new Date(txn.txn_date);
      if (d.toDateString() === today.toDateString()) {
        label = 'Today';
      } else if (d.toDateString() === yesterday.toDateString()) {
        label = 'Yesterday';
      } else {
        label = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
      }
    } catch {
      label = txn.txn_date || 'Unknown';
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(txn);
  }

  return groups;
}

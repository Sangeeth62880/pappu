import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { fetchSummary, fetchTransactions } from '../api/client';
import Balance from './ui/Balance';
import TransactionRow from './ui/TransactionRow';

export default function Dashboard({
  token,
  refreshTrigger = 0,
  initialSummary = null,
  initialTransactions = null,
  onUndo = null,
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [transactions, setTransactions] = useState(initialTransactions || []);
  const [loading, setLoading] = useState(Boolean(token && !initialSummary));
  const [error, setError] = useState(null);

  const loadDashboardData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const [sumData, txnsData] = await Promise.all([
        fetchSummary(token),
        fetchTransactions(token, { limit: 10 }),
      ]);
      setSummary(sumData);
      setTransactions(txnsData || []);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadDashboardData();
    } else {
      setLoading(false);
    }
  }, [token, refreshTrigger]);

  const balance = summary ? Number(summary.balance || 0).toFixed(2) : '0.00';
  const totalIncome = summary ? Number(summary.total_income || 0).toFixed(2) : '0.00';
  const totalExpense = summary ? Number(summary.total_expense || 0).toFixed(2) : '0.00';
  const categoryBreakdown = summary?.category_breakdown || [];

  if (error && !summary) {
    return (
      <View testID="dashboard-error" className="flex-1 bg-ink-navy items-center justify-center px-6">
        <Text className="text-clay-rust font-sans text-sm font-semibold mb-1">Failed to Load</Text>
        <Text className="text-bone-darker font-sans text-xs text-center mb-4">{error}</Text>
        <TouchableOpacity
          testID="dashboard-retry-button"
          onPress={loadDashboardData}
          className="bg-warm-brass py-2 px-5 rounded-lg active:bg-warm-brass-dark"
        >
          <Text className="text-ink-navy font-sans text-xs font-semibold">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView testID="dashboard-view" className="flex-1 bg-ink-navy px-5 pt-2">
      {/* Inline error banner if data exists but refresh failed */}
      {error && (
        <View testID="dashboard-inline-error" className="p-3 bg-clay-rust/15 border border-clay-rust/30 rounded-xl mb-3">
          <Text className="text-clay-rust-light font-sans text-xs">{error}</Text>
        </View>
      )}

      {/* Hero balance */}
      <Balance
        balance={balance}
        income={totalIncome}
        expense={totalExpense}
        loading={loading && !summary}
      />

      {/* Undo — understated text link */}
      {onUndo && (
        <TouchableOpacity
          testID="dashboard-undo-button"
          onPress={onUndo}
          className="self-center mb-5"
        >
          <Text className="text-warm-brass font-sans text-xs font-medium">↶ Undo last</Text>
        </TouchableOpacity>
      )}

      {/* Category Breakdown */}
      {categoryBreakdown.length > 0 && (
        <View className="mb-6">
          <Text className="text-bone-darker font-sans text-[10px] font-medium uppercase tracking-widest mb-3">
            By Category
          </Text>
          {categoryBreakdown.map((item) => (
            <View
              key={item.category_id}
              testID={`category-item-${item.category_id}`}
              className="flex-row justify-between items-center py-2.5 border-b border-ink-navy-lighter"
            >
              <View className="flex-row items-center">
                <Text className="text-bone font-sans text-sm font-medium">{item.category_name}</Text>
                <Text className="text-bone-darker font-sans text-xs ml-2">({item.count})</Text>
              </View>
              <Text
                className={`font-serif text-sm font-bold ${
                  item.type === 'income' ? 'text-banana-leaf' : 'text-bone'
                }`}
                style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
              >
                ₹{Number(item.total_amount).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Recent Transactions — passbook style */}
      <View className="mb-8">
        <Text className="text-bone-darker font-sans text-[10px] font-medium uppercase tracking-widest mb-3">
          Recent
        </Text>
        {transactions.length === 0 ? (
          <Text testID="empty-transactions-text" className="text-bone-darker font-sans text-xs italic py-4 text-center">
            No recent transactions.
          </Text>
        ) : (
          transactions.map((txn) => (
            <TransactionRow
              key={txn.id}
              testID={`txn-item-${txn.id}`}
              category={txn.category_name}
              description={txn.description}
              amount={txn.amount}
              type={txn.type}
              date={txn.txn_date}
            />
          ))
        )}
      </View>

      {/* Empty categories note */}
      {categoryBreakdown.length === 0 && !loading && (
        <Text testID="empty-categories-text" className="text-bone-darker font-sans text-xs italic text-center">
          No categories recorded yet.
        </Text>
      )}
    </ScrollView>
  );
}

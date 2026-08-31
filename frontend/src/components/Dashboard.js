import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { fetchSummary, fetchTransactions } from '../api/client';

export default function Dashboard({
  token,
  refreshTrigger = 0,
  initialSummary = null,
  initialTransactions = null,
  onUndo = null,
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [transactions, setTransactions] = useState(initialTransactions || []);
  const [loading, setLoading] = useState(!initialSummary);
  const [error, setError] = useState(null);

  const loadDashboardData = async () => {
    if (!token) return;
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
    }
  }, [token, refreshTrigger]);

  if (loading && !summary) {
    return (
      <View testID="dashboard-loading" className="p-4 items-center justify-center">
        <ActivityIndicator size="small" color="#38bdf8" />
        <Text className="text-slate-400 mt-2 text-sm">Loading dashboard...</Text>
      </View>
    );
  }

  if (error && !summary) {
    return (
      <View testID="dashboard-error" className="p-4 bg-red-900/30 rounded-lg m-2">
        <Text className="text-red-400 font-medium">Error loading data</Text>
        <Text className="text-red-300 text-xs mt-1">{error}</Text>
      </View>
    );
  }

  const balance = summary ? Number(summary.balance || 0).toFixed(2) : '0.00';
  const totalIncome = summary ? Number(summary.total_income || 0).toFixed(2) : '0.00';
  const totalExpense = summary ? Number(summary.total_expense || 0).toFixed(2) : '0.00';
  const categoryBreakdown = summary?.category_breakdown || [];

  return (
    <ScrollView testID="dashboard-view" className="flex-1 bg-slate-900 px-4 py-2">
      {/* Balance & Overview Card */}
      <View className="bg-slate-800 rounded-xl p-4 mb-4 border border-slate-700 shadow-sm">
        <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Balance</Text>
        <Text testID="dashboard-balance" className="text-3xl font-bold text-white mt-1">
          ₹{balance}
        </Text>

        <View className="flex-row justify-between mt-4 pt-3 border-t border-slate-700">
          <View>
            <Text className="text-slate-400 text-xs font-medium">Income</Text>
            <Text testID="dashboard-income" className="text-emerald-400 font-semibold text-base mt-0.5">
              +₹{totalIncome}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-slate-400 text-xs font-medium">Expenses</Text>
            <Text testID="dashboard-expense" className="text-rose-400 font-semibold text-base mt-0.5">
              -₹{totalExpense}
            </Text>
          </View>
        </View>

        {onUndo && (
          <TouchableOpacity
            testID="dashboard-undo-button"
            onPress={onUndo}
            className="mt-3 py-1.5 px-3 bg-slate-700/60 rounded-md self-start border border-slate-600"
          >
            <Text className="text-xs text-slate-300 font-medium">↶ Undo Last</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category Breakdown */}
      <View className="bg-slate-800 rounded-xl p-4 mb-4 border border-slate-700">
        <Text className="text-slate-300 font-semibold text-sm mb-3">Category Breakdown</Text>
        {categoryBreakdown.length === 0 ? (
          <Text testID="empty-categories-text" className="text-slate-500 text-xs">No categories recorded yet.</Text>
        ) : (
          categoryBreakdown.map((item) => (
            <View
              key={item.category_id}
              testID={`category-item-${item.category_id}`}
              className="flex-row justify-between items-center py-2 border-b border-slate-700/50"
            >
              <View className="flex-row items-center">
                <Text className="text-slate-200 text-sm font-medium">{item.category_name}</Text>
                <Text className="text-slate-400 text-xs ml-2">({item.count})</Text>
              </View>
              <Text className={item.type === 'income' ? 'text-emerald-400 font-medium' : 'text-slate-200 font-medium'}>
                ₹{Number(item.total_amount).toFixed(2)}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Recent Transactions List */}
      <View className="bg-slate-800 rounded-xl p-4 mb-6 border border-slate-700">
        <Text className="text-slate-300 font-semibold text-sm mb-3">Recent Transactions</Text>
        {transactions.length === 0 ? (
          <Text testID="empty-transactions-text" className="text-slate-500 text-xs">No recent transactions.</Text>
        ) : (
          transactions.map((txn) => (
            <View
              key={txn.id}
              testID={`txn-item-${txn.id}`}
              className="flex-row justify-between items-center py-2.5 border-b border-slate-700/50"
            >
              <View className="flex-1 pr-2">
                <View className="flex-row items-center">
                  <Text className="text-slate-200 text-sm font-medium">{txn.category_name || 'Transaction'}</Text>
                  <Text className="text-slate-500 text-xs ml-2">{txn.txn_date}</Text>
                </View>
                {txn.description ? (
                  <Text className="text-slate-400 text-xs mt-0.5" numberOfLines={1}>
                    {txn.description}
                  </Text>
                ) : null}
              </View>
              <Text
                className={`font-semibold text-sm ${
                  txn.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {txn.type === 'income' ? '+' : '-'}₹{Number(txn.amount).toFixed(2)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

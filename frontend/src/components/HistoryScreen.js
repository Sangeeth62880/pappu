import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { fetchTransactions } from '../api/client';
import { colors, radius, shadows, spacing } from '../theme/tokens';
import Card from './ui/Card';
import TransactionRow from './ui/TransactionRow';
import EmptyState from './ui/EmptyState';

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'people', label: 'People' },
];

export default function HistoryScreen({
  token,
  refreshTrigger = 0,
  initialFilter = null,
}) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeType, setActiveType] = useState('all');
  const [activeCategory, setActiveCategory] = useState(initialFilter?.category || null);

  useEffect(() => {
    if (initialFilter?.category) {
      setActiveCategory(initialFilter.category);
    }
  }, [initialFilter]);

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

  // Filter logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter((txn) => {
      // Type filter
      if (activeType === 'expense' && txn.type !== 'expense') return false;
      if (activeType === 'income' && txn.type !== 'income') return false;
      if (activeType === 'people') {
        const isPeople = txn.category_name?.toLowerCase() === 'people' || Boolean(txn.contact_id);
        if (!isPeople) return false;
      }

      // Category filter
      if (activeCategory && activeCategory !== 'All') {
        if (txn.category_name !== activeCategory) return false;
      }

      return true;
    });
  }, [transactions, activeType, activeCategory]);

  const grouped = useMemo(() => {
    return groupByDate(filteredTransactions);
  }, [filteredTransactions]);

  if (loading && transactions.length === 0) {
    return (
      <View testID="history-loading" style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.brand.default} />
        <Text style={styles.loadingText}>Loading history…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="history-view"
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Filter Chips Row ── */}
      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {TYPE_FILTERS.map((chip) => {
            const isSelected = activeType === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                testID={`history-filter-${chip.key}`}
                onPress={() => setActiveType(chip.key)}
                style={[
                  styles.chip,
                  isSelected && styles.chipSelected,
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.chipText,
                    isSelected && styles.chipTextSelected,
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Active category pill with clear option */}
          {activeCategory ? (
            <TouchableOpacity
              onPress={() => setActiveCategory(null)}
              style={styles.activeCategoryPill}
              activeOpacity={0.7}
            >
              <Text style={styles.activeCategoryText}>{activeCategory} ✕</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </View>

      {/* Error banner */}
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Empty State */}
      {filteredTransactions.length === 0 && !loading ? (
        <Card padding="xl" style={styles.emptyCard}>
          <Text style={styles.emptyText}>No transactions recorded yet</Text>
        </Card>
      ) : (
        Object.entries(grouped).map(([dateLabel, txns]) => (
          <View key={dateLabel} style={styles.dateGroup}>
            {/* Sticky/Section Date Header */}
            <View style={styles.dateHeader}>
              <Text style={styles.dateHeaderText}>{dateLabel}</Text>
            </View>

            <Card padding="none" style={styles.txListCard}>
              {txns.map((txn, idx) => (
                <View
                  key={txn.id}
                  style={[
                    styles.rowWrapper,
                    idx === txns.length - 1 && styles.rowWrapperLast,
                  ]}
                >
                  <TransactionRow
                    testID={`history-txn-${txn.id}`}
                    category={txn.contact_name ? txn.contact_name : txn.category_name}
                    description={txn.description}
                    amount={txn.amount}
                    type={txn.type}
                    date={txn.txn_date}
                  />
                </View>
              ))}
            </Card>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function groupByDate(transactions) {
  const groups = {};
  for (const txn of transactions) {
    const label = formatDateGroup(txn.txn_date);
    if (!groups[label]) groups[label] = [];
    groups[label].push(txn);
  }
  return groups;
}

function formatDateGroup(dateStr) {
  if (!dateStr) return 'Earlier';
  try {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  contentContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 110,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.text.secondary,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  filterRow: {
    marginBottom: spacing.md,
  },
  filterScroll: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.brand.default,
    borderColor: colors.brand.default,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  chipTextSelected: {
    color: colors.text.inverse,
  },
  activeCategoryPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.brand.tint,
    borderWidth: 1,
    borderColor: colors.brand.tintBorder,
    minHeight: 36,
    justifyContent: 'center',
  },
  activeCategoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.brand.dark,
  },
  errorBanner: {
    backgroundColor: colors.semantic.expenseBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.semantic.expenseBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.semantic.expense,
    fontSize: 13,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: 14,
    fontStyle: 'italic',
  },
  dateGroup: {
    marginBottom: spacing.lg,
  },
  dateHeader: {
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  dateHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  txListCard: {
    borderRadius: radius['2xl'],
    overflow: 'hidden',
  },
  rowWrapper: {
    paddingHorizontal: spacing.lg,
  },
  rowWrapperLast: {
    borderBottomWidth: 0,
  },
});

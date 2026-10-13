import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { fetchSummary, fetchTransactions } from '../api/client';
import { colors, radius, shadows, spacing } from '../theme/tokens';
import Balance from './ui/Balance';
import Card from './ui/Card';
import SegmentedControl from './ui/SegmentedControl';
import Avatar from './ui/Avatar';
import AmountText from './ui/AmountText';
import SectionHeader from './ui/SectionHeader';
import EmptyState from './ui/EmptyState';
import Skeleton from './ui/Skeleton';
import Button from './ui/Button';

const PERIOD_SEGMENTS = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

export default function Dashboard({
  token,
  refreshTrigger = 0,
  initialSummary = null,
  initialTransactions = null,
  onNavigateToHistory = null,
  onNavigateToPeople = null,
}) {
  const [period, setPeriod] = useState('week');
  const [summary, setSummary] = useState(initialSummary);
  const [transactions, setTransactions] = useState(initialTransactions || []);
  const [loading, setLoading] = useState(Boolean(token && !initialSummary));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadDashboardData = useCallback(async (selectedPeriod = period) => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [sumData, txnsData] = await Promise.all([
        fetchSummary(token, selectedPeriod),
        fetchTransactions(token, { limit: 5 }),
      ]);
      setSummary(sumData);
      setTransactions(txnsData || []);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, period]);

  useEffect(() => {
    if (token) {
      setLoading(true);
      loadDashboardData(period);
    } else {
      setLoading(false);
    }
  }, [token, refreshTrigger, period]);

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboardData(period);
  };

  // ── Derived Data & Formats ──
  const totalSpent = summary ? Number(summary.total_spent ?? summary.total_expense ?? 0).toFixed(2) : '0.00';
  const totalIncome = summary ? Number(summary.total_income ?? 0).toFixed(2) : '0.00';
  const netAmount = summary ? Number(summary.net ?? summary.balance ?? 0).toFixed(2) : '0.00';

  const deltaPct = summary?.spent_delta_percentage;
  const isLowerDelta = deltaPct !== null && deltaPct !== undefined && deltaPct < 0;
  const deltaText = deltaPct !== null && deltaPct !== undefined
    ? `${Math.abs(deltaPct)}% vs last ${period}`
    : null;

  const dailyBuckets = summary?.daily_buckets || [];
  const maxBucketAmount = Math.max(...dailyBuckets.map((b) => Number(b.amount || 0)), 1);
  const hasChartSpending = dailyBuckets.some((b) => Number(b.amount || 0) > 0);

  const categories = summary?.categories || [];
  const legacyBreakdown = summary?.category_breakdown || [];
  const displayCategories = categories.length > 0
    ? categories
    : legacyBreakdown.map((item) => ({
        category: item.category_name,
        amount: Number(item.total_amount),
        percentage: Number(summary?.total_expense) > 0
          ? Math.round((Number(item.total_amount) / Number(summary.total_expense)) * 100)
          : 0,
        category_id: item.category_id,
      }));

  const peopleData = summary?.people || {
    total_owed_to_user: 0,
    total_user_owes: 0,
    top_contacts: [],
  };
  const topContacts = peopleData.top_contacts || [];
  const totalOwed = Number(peopleData.total_owed_to_user || 0);
  const totalOwes = Number(peopleData.total_user_owes || 0);

  const recentTxns = transactions.slice(0, 5);

  // ── Error State ──
  if (error && !summary) {
    return (
      <View testID="dashboard-error" style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Failed to Load</Text>
        <Text style={styles.errorSubtitle}>{error}</Text>
        <Button
          testID="dashboard-retry-button"
          onPress={() => loadDashboardData(period)}
          title="Retry"
          size="sm"
        />
      </View>
    );
  }

  return (
    <ScrollView
      testID="dashboard-view"
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.brand.default}
        />
      }
    >
      {/* Inline error if refreshing failed */}
      {error ? (
        <View testID="dashboard-inline-error" style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>{error}</Text>
        </View>
      ) : null}

      {/* 1. Period Selector Segmented Control */}
      <View style={styles.periodSelectorContainer}>
        <SegmentedControl
          segments={PERIOD_SEGMENTS}
          selectedKey={period}
          onSelect={handlePeriodChange}
        />
      </View>

      {/* 2. Hero Card */}
      <View style={styles.heroSection}>
        <Balance
          balance={totalSpent}
          income={totalIncome}
          expense={netAmount}
          title={`Spent this ${period}`}
          deltaText={deltaText}
          isLowerDelta={isLowerDelta}
          loading={loading && !summary}
        />
      </View>

      {/* 3. Spending Chart (Daily Bars) */}
      <Card style={styles.chartCard} padding="lg">
        <Text style={styles.cardHeaderTitle}>Daily Spending</Text>
        {!hasChartSpending && !loading ? (
          <View style={styles.chartEmpty}>
            <Text style={styles.chartEmptyText}>No expenses recorded for this {period}</Text>
          </View>
        ) : (
          <View style={styles.barsContainer}>
            {dailyBuckets.map((bucket, idx) => {
              const amt = Number(bucket.amount || 0);
              const heightPct = Math.max((amt / maxBucketAmount) * 100, 6);
              const isPeak = amt === maxBucketAmount && amt > 0;

              return (
                <View key={bucket.date || idx} style={styles.barColumn}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${heightPct}%` },
                        isPeak ? styles.barFillPeak : styles.barFillNormal,
                      ]}
                    />
                  </View>
                  <Text style={[styles.barLabel, isPeak && styles.barLabelPeak]} numberOfLines={1}>
                    {bucket.label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {/* 4. People Card */}
      <Card style={styles.peopleCard} padding="lg">
        <View style={styles.peopleCardHeader}>
          <Text style={styles.cardHeaderTitle}>People & IOUs</Text>
          {onNavigateToPeople ? (
            <TouchableOpacity onPress={() => onNavigateToPeople()} hitSlop={8}>
              <Text style={styles.seeAllLink}>View all</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.peopleTotalsRow}>
          <View style={styles.peopleTotalCol}>
            <Text style={styles.peopleSubLabel}>You're owed</Text>
            <AmountText
              amount={totalOwed}
              type="income"
              size="lg"
              showSign={false}
            />
          </View>
          <View style={styles.peopleDivider} />
          <View style={styles.peopleTotalCol}>
            <Text style={styles.peopleSubLabel}>You owe</Text>
            <AmountText
              amount={totalOwes}
              type="expense"
              size="lg"
              showSign={false}
            />
          </View>
        </View>

        {topContacts.length === 0 ? (
          <View style={styles.peopleEmpty}>
            <Text style={styles.peopleEmptyText}>No active debts or IOUs with contacts</Text>
          </View>
        ) : (
          <View style={styles.topContactsList}>
            {topContacts.map((contact) => {
              const net = Number(contact.net_balance || 0);
              const isOwed = net > 0;

              return (
                <TouchableOpacity
                  key={contact.id}
                  style={styles.contactRow}
                  activeOpacity={0.7}
                  onPress={() => onNavigateToPeople && onNavigateToPeople(contact.id)}
                >
                  <Avatar name={contact.name} size={36} />
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.contactSubtitle}>
                      {isOwed ? 'owes you' : 'you owe'}
                    </Text>
                  </View>
                  <AmountText
                    amount={Math.abs(net)}
                    type={isOwed ? 'income' : 'expense'}
                    size="sm"
                    showSign={false}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </Card>

      {/* 5. "Where it went" (Expense Categories Proportion Bars) */}
      {displayCategories.length > 0 ? (
        <Card style={styles.categoriesCard} padding="lg">
          <SectionHeader
            title="Where it went"
            actionText={onNavigateToHistory ? "Filter" : null}
            onActionPress={() => onNavigateToHistory && onNavigateToHistory({ period })}
          />

          <View style={styles.categoriesList}>
            {displayCategories.map((item, idx) => {
              const catColor = colors.categories[item.category] || colors.brand.default;
              const testIdKey = item.category_id || idx + 1;

              return (
                <TouchableOpacity
                  key={item.category || idx}
                  testID={`category-item-${testIdKey}`}
                  activeOpacity={0.7}
                  onPress={() =>
                    onNavigateToHistory &&
                    onNavigateToHistory({ category: item.category, period })
                  }
                  style={styles.categoryRow}
                >
                  <View style={styles.categoryInfoRow}>
                    <View style={styles.categoryNameContainer}>
                      <View style={[styles.categoryDot, { backgroundColor: catColor }]} />
                      <Text style={styles.categoryNameText}>{item.category}</Text>
                    </View>
                    <View style={styles.categoryRight}>
                      <Text style={styles.categoryPctText}>{item.percentage}%</Text>
                      <AmountText
                        amount={item.amount}
                        type="neutral"
                        size="sm"
                        style={styles.categoryAmount}
                      />
                    </View>
                  </View>

                  {/* Horizontal proportion bar */}
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(Math.max(item.percentage, 2), 100)}%`,
                          backgroundColor: catColor,
                        },
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
      ) : !loading ? (
        <Card style={styles.categoriesCard} padding="lg">
          <Text testID="empty-categories-text" style={styles.emptyText}>
            No categories recorded yet.
          </Text>
        </Card>
      ) : null}

      {/* 6. Recent Activity (At most 5 rows) */}
      <View style={styles.recentSection}>
        <SectionHeader
          title="Recent Activity"
          actionText={transactions.length > 0 ? "See all" : null}
          onActionPress={() => onNavigateToHistory && onNavigateToHistory()}
        />

        {recentTxns.length === 0 ? (
          <Card padding="lg" style={styles.emptyRecentCard}>
            <Text testID="empty-transactions-text" style={styles.emptyText}>
              No recent transactions.
            </Text>
          </Card>
        ) : (
          <Card padding="none" style={styles.recentListCard}>
            {recentTxns.map((txn, index) => {
              const isIncome = txn.type === 'income';
              const isPeople = Boolean(txn.contact_name);
              const title = isPeople
                ? txn.contact_name
                : txn.description || txn.category_name || 'Expense';
              const subtitle = isPeople
                ? isIncome ? 'Received' : 'Sent'
                : txn.category_name || 'Transaction';

              return (
                <View
                  key={txn.id}
                  testID={`txn-item-${txn.id}`}
                  style={[
                    styles.txnRow,
                    index === recentTxns.length - 1 && styles.txnRowLast,
                  ]}
                >
                  {isPeople ? (
                    <Avatar name={txn.contact_name} size={36} />
                  ) : (
                    <View style={styles.categoryIconCircle}>
                      <Text style={styles.categoryIconText}>
                        {txn.category_name === 'Food' ? '🍔'
                          : txn.category_name === 'Transport' ? '🚗'
                          : txn.category_name === 'Shopping' ? '🛍️'
                          : txn.category_name === 'Bills' ? '📄'
                          : txn.category_name === 'Salary' ? '💼'
                          : '₹'}
                      </Text>
                    </View>
                  )}

                  <View style={styles.txnMiddle}>
                    <Text style={styles.txnTitle} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.txnSubtitle} numberOfLines={1}>
                      {subtitle} · {formatDateShort(txn.txn_date)}
                    </Text>
                  </View>

                  <AmountText
                    amount={txn.amount}
                    type={isIncome ? 'income' : 'expense'}
                    showSign={true}
                    size="md"
                  />
                </View>
              );
            })}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
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
    paddingTop: spacing.xs,
    paddingBottom: 110, // Room for bottom floating navigation bar
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.semantic.expense,
    marginBottom: spacing.xs,
  },
  errorSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  inlineError: {
    backgroundColor: colors.semantic.expenseBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.semantic.expenseBorder,
  },
  inlineErrorText: {
    color: colors.semantic.expense,
    fontSize: 13,
  },
  periodSelectorContainer: {
    marginVertical: spacing.md,
  },
  heroSection: {
    marginBottom: spacing.lg,
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing.md,
    letterSpacing: -0.2,
  },
  chartCard: {
    marginBottom: spacing.lg,
  },
  chartEmpty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  chartEmptyText: {
    color: colors.text.muted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    paddingTop: spacing.sm,
    justifyContent: 'space-between',
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barTrack: {
    width: 22,
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  barFill: {
    width: '100%',
    borderRadius: radius.full,
    minHeight: 6,
  },
  barFillNormal: {
    backgroundColor: '#93C5FD', // Soft brand blue tint
  },
  barFillPeak: {
    backgroundColor: colors.brand.default, // Confident solid blue
  },
  barLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.muted,
  },
  barLabelPeak: {
    color: colors.brand.default,
    fontWeight: '700',
  },
  peopleCard: {
    marginBottom: spacing.lg,
  },
  peopleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  seeAllLink: {
    color: colors.brand.default,
    fontSize: 13,
    fontWeight: '600',
  },
  peopleTotalsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  peopleTotalCol: {
    flex: 1,
    alignItems: 'center',
  },
  peopleSubLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  peopleDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  peopleEmpty: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  peopleEmptyText: {
    color: colors.text.muted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  topContactsList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  contactInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  contactSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 1,
  },
  categoriesCard: {
    marginBottom: spacing.lg,
  },
  categoriesList: {
    marginTop: spacing.xs,
    gap: spacing.md,
  },
  categoryRow: {
    paddingVertical: 2,
  },
  categoryInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  categoryNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  categoryPctText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  categoryAmount: {
    minWidth: 60,
    textAlign: 'right',
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  recentSection: {
    marginBottom: spacing.xl,
  },
  emptyRecentCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  recentListCard: {
    borderRadius: radius['2xl'],
    overflow: 'hidden',
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    minHeight: 52,
  },
  txnRowLast: {
    borderBottomWidth: 0,
  },
  categoryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconText: {
    fontSize: 16,
  },
  txnMiddle: {
    flex: 1,
    marginLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  txnTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  txnSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
});

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { fetchSummary, fetchTransactions } from '../api/client';
import { colors, radius, shadows, spacing } from '../theme/tokens';
import Balance from './ui/Balance';
import Card from './ui/Card';
import SegmentedControl from './ui/SegmentedControl';
import Avatar from './ui/Avatar';
import AmountText from './ui/AmountText';
import Button from './ui/Button';
import TransactionEditSheet from './ui/TransactionEditSheet';

const PERIOD_SEGMENTS = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

const CATEGORY_ICONS = {
  Food: 'restaurant',
  Transport: 'directions-car',
  Shopping: 'local-mall',
  Bills: 'receipt',
  Entertainment: 'confirmation-number',
  Salary: 'payments',
  People: 'group',
  Other: 'account-balance-wallet',
};

export default function Dashboard({
  token,
  refreshTrigger = 0,
  initialSummary = null,
  initialTransactions = null,
  onNavigateToHistory = null,
  onNavigateToPeople = null,
  onShowToast = null,
  onTransactionMutated = null,
}) {
  const [period, setPeriod] = useState('week');
  const [summary, setSummary] = useState(initialSummary);
  const [transactions, setTransactions] = useState(initialTransactions || []);
  const [loading, setLoading] = useState(Boolean(token && !initialSummary));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [editSheetVisible, setEditSheetVisible] = useState(false);

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
  const avgDailyAmount = dailyBuckets.length > 0
    ? Math.round(dailyBuckets.reduce((acc, b) => acc + Number(b.amount || 0), 0) / dailyBuckets.length)
    : 0;

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

      {/* 1. Period Selector Segmented Control (Stitch pill container) */}
      <View style={styles.periodSelectorWrapper}>
        <SegmentedControl
          segments={PERIOD_SEGMENTS}
          selectedKey={period}
          onSelect={handlePeriodChange}
        />
      </View>

      {/* 2. Hero Glass Card */}
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

      {/* 3. Daily Spending Card (Stitch bar chart with peak highlight) */}
      <Card style={styles.chartCard} padding="lg">
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardHeaderTitle}>Daily spending</Text>
          <Text style={styles.cardHeaderSubtitle}>
            Avg ₹{avgDailyAmount}/day
          </Text>
        </View>

        {!hasChartSpending && !loading ? (
          <View style={styles.chartEmpty}>
            <Text style={styles.chartEmptyText}>No expenses recorded for this {period}</Text>
          </View>
        ) : (
          <View style={styles.barsContainer}>
            {dailyBuckets.map((bucket, idx) => {
              const amt = Number(bucket.amount || 0);
              const heightPct = Math.max((amt / maxBucketAmount) * 100, 8);
              const isPeak = amt === maxBucketAmount && amt > 0;

              return (
                <View key={bucket.date || idx} style={styles.barColumn}>
                  {isPeak ? (
                    <View style={styles.peakBadge}>
                      <Text style={styles.peakBadgeText}>₹{Math.round(amt)}</Text>
                    </View>
                  ) : null}
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

      {/* 4. People Card (Stitch Split Overview) */}
      <Card style={styles.peopleCard} padding="lg">
        <View style={styles.peopleTotalsRow}>
          <View style={styles.peopleTotalCol}>
            <Text style={styles.peopleSubLabel}>You're owed</Text>
            <Text style={styles.peopleOwedAmount}>+₹{totalOwed.toFixed(0)}</Text>
          </View>
          <View style={styles.peopleDivider} />
          <View style={[styles.peopleTotalCol, { alignItems: 'flex-end' }]}>
            <Text style={styles.peopleSubLabel}>You owe</Text>
            <Text style={styles.peopleOwesAmount}>-₹{totalOwes.toFixed(0)}</Text>
          </View>
        </View>

        <View style={styles.hairline} />

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
                  <View style={styles.contactLeft}>
                    <View
                      style={[
                        styles.contactAvatarCircle,
                        {
                          backgroundColor: isOwed ? colors.brand.tint : colors.semantic.expenseBg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.contactAvatarInitial,
                          {
                            color: isOwed ? colors.brand.default : colors.semantic.expense,
                          },
                        ]}
                      >
                        {contact.name?.charAt(0)?.toUpperCase() || 'P'}
                      </Text>
                    </View>
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactName}>{contact.name}</Text>
                      <View
                        style={[
                          styles.statusPill,
                          {
                            backgroundColor: isOwed ? colors.semantic.incomeBg : colors.semantic.expenseBg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            {
                              color: isOwed ? colors.semantic.income : colors.semantic.expense,
                            },
                          ]}
                        >
                          {isOwed ? 'Owes you' : 'You owe'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.contactAmount,
                      { color: isOwed ? colors.semantic.income : colors.semantic.expense },
                    ]}
                  >
                    {isOwed ? '+' : '-'}₹{Math.abs(net).toFixed(0)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {onNavigateToPeople ? (
          <TouchableOpacity
            style={styles.viewAllRow}
            onPress={() => onNavigateToPeople()}
            activeOpacity={0.7}
          >
            <Text style={styles.seeAllLink}>View all</Text>
            <MaterialIcons name="chevron-right" size={16} color={colors.brand.default} />
          </TouchableOpacity>
        ) : null}
      </Card>

      {/* 5. "Where it went" (Stitch Segmented Proportion Bar + Categories) */}
      {displayCategories.length > 0 ? (
        <Card style={styles.categoriesCard} padding="lg">
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeaderTitle}>Where it went</Text>
            <Text style={styles.cardHeaderSubtitle}>
              {displayCategories.length} Categories
            </Text>
          </View>

          {/* Stitch multi-segment proportion bar */}
          <View style={styles.multiSegmentBar}>
            {displayCategories.map((item, idx) => {
              const catColor = colors.categories[item.category] || colors.brand.default;
              return (
                <View
                  key={`seg-${item.category || idx}`}
                  style={[
                    styles.multiSegmentPiece,
                    {
                      width: `${Math.max(item.percentage, 4)}%`,
                      backgroundColor: catColor,
                    },
                  ]}
                />
              );
            })}
          </View>

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
                  <View style={styles.categoryNameContainer}>
                    <View style={[styles.categoryDot, { backgroundColor: catColor }]} />
                    <Text style={styles.categoryNameText}>{item.category}</Text>
                    <Text style={styles.categoryPctText}>{item.percentage}%</Text>
                  </View>
                  <Text style={styles.categoryAmountText}>
                    ₹{Number(item.amount).toFixed(0)}
                  </Text>
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

      {/* 6. Recent Activity Section */}
      <View style={styles.recentSection}>
        <View style={styles.recentHeaderRow}>
          <Text style={styles.recentSectionTitle}>Recent</Text>
          {transactions.length > 0 && onNavigateToHistory ? (
            <TouchableOpacity onPress={() => onNavigateToHistory()} activeOpacity={0.7}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          ) : null}
        </View>

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
              const iconName = isPeople
                ? isIncome ? 'call-received' : 'call-made'
                : (CATEGORY_ICONS[txn.category_name] || 'account-balance-wallet');

              return (
                <TouchableOpacity
                  key={txn.id}
                  testID={`txn-item-${txn.id}`}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSelectedTxn(txn);
                    setEditSheetVisible(true);
                  }}
                  style={[
                    styles.txnRow,
                    index === recentTxns.length - 1 && styles.txnRowLast,
                  ]}
                >
                  <View
                    style={[
                      styles.txnIconCircle,
                      {
                        backgroundColor: isIncome ? colors.semantic.incomeBg : colors.surfaceSubtle,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={iconName}
                      size={18}
                      color={isIncome ? colors.semantic.income : colors.brand.default}
                    />
                  </View>

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
                </TouchableOpacity>
              );
            })}
          </Card>
        )}
      </View>

      {/* Edit / Delete Transaction BottomSheet */}
      <TransactionEditSheet
        visible={editSheetVisible}
        onClose={() => setEditSheetVisible(false)}
        transaction={selectedTxn}
        token={token}
        onSaved={() => {
          loadDashboardData();
          if (onTransactionMutated) onTransactionMutated();
          if (onShowToast) onShowToast('Transaction updated');
        }}
        onDeleted={() => {
          loadDashboardData();
          if (onTransactionMutated) onTransactionMutated();
          if (onShowToast) onShowToast('Transaction deleted');
        }}
      />
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
    paddingBottom: 110, // Inset clearance for floating bottom bar
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
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
  },
  inlineErrorText: {
    color: colors.semantic.expense,
    fontSize: 13,
  },
  periodSelectorWrapper: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.xs,
  },
  heroSection: {
    marginBottom: spacing.lg,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  cardHeaderSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  chartCard: {
    borderRadius: radius['2xl'],
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  chartEmpty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  chartEmptyText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 130,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  peakBadge: {
    position: 'absolute',
    top: -4,
    backgroundColor: colors.brand.tint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    shadowColor: colors.brand.default,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  peakBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.brand.default,
  },
  barTrack: {
    width: 24,
    height: '80%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: '100%',
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
  },
  barFillNormal: {
    backgroundColor: colors.brand.tintBorder,
  },
  barFillPeak: {
    backgroundColor: colors.brand.default,
  },
  barLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 6,
    fontWeight: '500',
  },
  barLabelPeak: {
    color: colors.brand.default,
    fontWeight: '700',
  },
  peopleCard: {
    borderRadius: radius['2xl'],
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  peopleTotalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  peopleTotalCol: {
    flex: 1,
  },
  peopleSubLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  peopleOwedAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.semantic.income,
    fontVariant: ['tabular-nums'],
  },
  peopleOwesAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.semantic.expense,
    fontVariant: ['tabular-nums'],
  },
  peopleDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  hairline: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  peopleEmpty: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  peopleEmptyText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  topContactsList: {
    marginTop: spacing.xs,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  contactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  contactAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarInitial: {
    fontSize: 15,
    fontWeight: '700',
  },
  contactInfo: {
    flexDirection: 'column',
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  contactAmount: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  seeAllLink: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.brand.default,
    marginRight: 2,
  },
  categoriesCard: {
    borderRadius: radius['2xl'],
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  multiSegmentBar: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    marginBottom: spacing.md,
  },
  multiSegmentPiece: {
    height: '100%',
  },
  categoriesList: {
    marginTop: spacing.xs,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  categoryNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  categoryNameText: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: '500',
  },
  categoryPctText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  categoryAmountText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  emptyText: {
    fontSize: 13,
    color: colors.text.muted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  recentSection: {
    marginBottom: spacing.md,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  recentSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.brand.default,
  },
  emptyRecentCard: {
    borderRadius: radius['2xl'],
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  recentListCard: {
    borderRadius: radius['2xl'],
    backgroundColor: colors.surface,
    padding: spacing.xs,
    ...shadows.md,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.xl,
  },
  txnRowLast: {
    borderBottomWidth: 0,
  },
  txnIconCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  txnMiddle: {
    flex: 1,
    marginRight: spacing.sm,
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

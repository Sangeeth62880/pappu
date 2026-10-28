import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  StyleSheet,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useQuery, useQueryClient, QueryClientContext, QueryClientProvider, QueryClient } from '@tanstack/react-query';

import { colors, radius, spacing } from '../theme/tokens';
import { fetchSummary, fetchProfile, fetchTransactions } from '../api/client';
import { queryKeys } from '../data/queryKeys';
import { queryClient as defaultQueryClient } from '../data/queryClient';
import { useReduceMotion } from '../utils/reduceMotion';
import { useCountUp } from '../utils/useCountUp';
import { formatAmount } from './ui/AmountText';

import Pappu from './ui/Pappu';
import Card from './ui/Card';
import SpendingChart from './ui/SpendingChart';
import Button from './ui/Button';
import TransactionEditSheet from './ui/TransactionEditSheet';

const PERIOD_SEGMENTS = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

const CATEGORY_COLORS = {
  Food: colors.categories.Food,
  Shopping: colors.categories.Shopping,
  Transport: colors.categories.Transport,
  People: colors.categories.People,
  Other: colors.categories.Other,
};

function getTimeGreeting(date = new Date()) {
  const hours = date.getHours();
  if (hours < 12) return 'Good morning';
  if (hours < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatTxnDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]}`;
}

function hasMalayalam(text) {
  if (!text) return false;
  return /[\u0D00-\u0D7F]/.test(text);
}

function DashboardInner({
  token,
  refreshTrigger = 0,
  initialSummary = null,
  initialTransactions = null,
  onNavigateToHistory = null,
  onNavigateToPeople = null,
  onShowToast = null,
  onTransactionMutated = null,
}) {
  const queryClient = useQueryClient();
  const reduceMotion = useReduceMotion();
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

  const [period, setPeriod] = useState('week');
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [editSheetVisible, setEditSheetVisible] = useState(false);

  // ── React Query Integration (with react-query keys from Prompt 3) ──
  const summaryQuery = useQuery({
    queryKey: queryKeys.summary(period),
    queryFn: () => fetchSummary(token, period),
    enabled: Boolean(token),
  });

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: async () => {
      try {
        const res = await fetchProfile(token);
        return res || null;
      } catch (_) {
        return null;
      }
    },
    enabled: Boolean(token),
  });

  const txnsQuery = useQuery({
    queryKey: queryKeys.transactions({ limit: 5 }),
    queryFn: () => fetchTransactions(token, { limit: 5 }),
    enabled: Boolean(token && (!summaryQuery.data?.recent_transactions || summaryQuery.data.recent_transactions.length === 0)),
  });

  // Re-fetch when refreshTrigger prop updates
  useEffect(() => {
    if (token && refreshTrigger > 0) {
      summaryQuery.refetch();
    }
  }, [refreshTrigger]);

  const summary = (token && summaryQuery.data) ? summaryQuery.data : (initialSummary || summaryQuery.data);
  const loading = Boolean(token && summaryQuery.isLoading && !summary);
  const error = summaryQuery.error?.message || null;

  // ── Financial Metrics ──
  const rawTotalSpent = Number(summary?.total_spent ?? summary?.total_expense ?? 0);
  const rawTotalIncome = Number(summary?.total_income ?? 0);
  const rawNet = Number(summary?.net ?? summary?.balance ?? (rawTotalIncome - rawTotalSpent));

  // Count up animations (400ms duration, 50ms delay on income/net)
  const animatedSpent = useCountUp(rawTotalSpent, 400, 0);
  const animatedIncome = useCountUp(rawTotalIncome, 400, 50);
  const animatedNet = useCountUp(rawNet, 400, 50);

  // Delta line logic
  const deltaPct = summary?.delta_pct ?? summary?.spent_delta_percentage;
  const rawDeltaAbs = summary?.delta_abs !== undefined && summary?.delta_abs !== null
    ? Number(summary.delta_abs)
    : (rawTotalSpent - Number(summary?.previous_period_spent || 0));

  const hasDelta = deltaPct !== null && deltaPct !== undefined;
  const isDeltaHigher = rawDeltaAbs > 0;
  const isDeltaLower = rawDeltaAbs < 0;

  // Daily buckets for chart with transaction fallback
  const dailyBuckets = useMemo(() => {
    if (Array.isArray(summary?.daily_buckets) && summary.daily_buckets.length > 0) {
      const hasNonZero = summary.daily_buckets.some((b) => Number(b.amount || 0) > 0);
      if (hasNonZero) return summary.daily_buckets;
    }
    // Fallback: If summary.daily_buckets has only zeros or is missing, compute from transactions
    const txns = summary?.recent_transactions || txnsQuery?.data || initialTransactions;
    if (Array.isArray(txns) && txns.length > 0) {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const map = {};
      days.forEach((d) => { map[d] = 0; });
      let foundTxn = false;
      txns.forEach((t) => {
        if (t.type === 'expense' && t.txn_date) {
          try {
            const d = new Date(t.txn_date);
            const dayName = days[(d.getDay() + 6) % 7];
            if (map[dayName] !== undefined) {
              map[dayName] += Number(t.amount || 0);
              foundTxn = true;
            }
          } catch (_) {}
        }
      });
      if (foundTxn) {
        return days.map((d) => ({ label: d, amount: map[d], date: d }));
      }
    }
    return summary?.daily_buckets || [];
  }, [summary?.daily_buckets, summary?.recent_transactions, txnsQuery?.data, initialTransactions]);

  const avgDailyAmount = useMemo(() => {
    if (summary?.avg_per_day !== undefined && summary?.avg_per_day !== null && Number(summary.avg_per_day) > 0) {
      return Math.round(Number(summary.avg_per_day));
    }
    if (dailyBuckets.length > 0) {
      const total = dailyBuckets.reduce((acc, b) => acc + Number(b.amount || 0), 0);
      return Math.round(total / dailyBuckets.length);
    }
    return 0;
  }, [summary?.avg_per_day, dailyBuckets]);

  // Categories for Where it went with robust fallback
  const categories = useMemo(() => {
    let list = summary?.categories || summary?.category_breakdown || summary?.expense_by_category || summary?.by_category;
    if (!Array.isArray(list) || list.length === 0) {
      // Fallback: derive from recent transactions or txnsQuery if summary doesn't supply categories
      const txns = summary?.recent_transactions || txnsQuery?.data || initialTransactions;
      if (Array.isArray(txns) && txns.length > 0) {
        const expenseTxns = txns.filter((t) => t.type === 'expense');
        if (expenseTxns.length > 0) {
          const catMap = {};
          let total = 0;
          expenseTxns.forEach((t) => {
            const name = t.category_name || t.category || 'Other';
            const val = Number(t.amount || 0);
            catMap[name] = (catMap[name] || 0) + val;
            total += val;
          });
          list = Object.entries(catMap)
            .sort((a, b) => b[1] - a[1])
            .map(([name, amt]) => ({
              category: name,
              amount: amt,
              percentage: total > 0 ? Math.round((amt / total) * 100) : 0,
            }));
        }
      }
    }

    if (Array.isArray(list) && list.length > 0) {
      const sumOfAmts = list.reduce((acc, item) => acc + Number(item.amount ?? item.total_amount ?? item.total ?? 0), 0);
      const denominator = rawTotalSpent > 0 ? rawTotalSpent : sumOfAmts;

      return list.map((item) => {
        const catName = item.category || item.category_name || item.name || 'Other';
        const amt = Number(item.amount ?? item.total_amount ?? item.total ?? 0);
        let pct = item.percentage !== undefined && item.percentage !== null && Number(item.percentage) > 0
          ? Number(item.percentage)
          : (denominator > 0 ? Math.round((amt / denominator) * 100) : 0);
        return {
          category: catName,
          amount: amt,
          percentage: pct,
          category_id: item.category_id || item.id,
        };
      });
    }
    return [];
  }, [summary, rawTotalSpent, txnsQuery?.data, initialTransactions]);

  // People data
  const peopleData = summary?.people || {
    total_owed_to_user: 0,
    total_user_owes: 0,
    top_contacts: [],
  };
  const totalOwed = Number(peopleData.total_owed_to_user ?? peopleData.owed_to_you ?? 0);
  const totalOwes = Number(peopleData.total_user_owes ?? peopleData.you_owe ?? 0);
  const topContacts = (peopleData.top_contacts || []).slice(0, 3);
  const isPeopleSettled = totalOwed === 0 && totalOwes === 0 && topContacts.length === 0;

  // Recent transactions (capped at 5)
  const recentTransactions = useMemo(() => {
    if (initialTransactions !== null && initialTransactions !== undefined) {
      return initialTransactions.slice(0, 5);
    }
    if (summary?.recent_transactions && summary.recent_transactions.length > 0) {
      return summary.recent_transactions.slice(0, 5);
    }
    if (txnsQuery.data && txnsQuery.data.length > 0) {
      return txnsQuery.data.slice(0, 5);
    }
    return [];
  }, [initialTransactions, summary, txnsQuery.data]);

  // Animated progress bars for "Where it went"
  const catAnimRefs = useRef([]);
  const catTrackWidth = useRef(0); // measured track pixel width
  if (catAnimRefs.current.length !== categories.length) {
    catAnimRefs.current = categories.map(() => new Animated.Value(isTest || reduceMotion ? 1 : 0));
  }

  useEffect(() => {
    if (isTest || reduceMotion) {
      catAnimRefs.current.forEach((a) => a.setValue(1));
      return;
    }
    catAnimRefs.current.forEach((a) => a.setValue(0));
    const anims = catAnimRefs.current.map((anim, idx) => {
      return Animated.timing(anim, {
        toValue: 1,
        duration: 350,
        delay: idx * 30,
        useNativeDriver: false,
      });
    });
    Animated.parallel(anims).start();
  }, [categories, isTest, reduceMotion]);

  // ── Pull-to-refresh ──
  const handleRefresh = async () => {
    await summaryQuery.refetch();
    await profileQuery.refetch();
  };

  // ── Error State ──
  if (error && !summary) {
    const isAuthError =
      summaryQuery.error?.status === 401 ||
      (error && (error.includes('401') || error.toLowerCase().includes('token') || error.toLowerCase().includes('unauthorized')));

    return (
      <View testID="dashboard-error" style={styles.errorContainer}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>
            {isAuthError ? 'Session Expired' : 'Could not connect to server'}
          </Text>
          <Text style={styles.errorSubtitle}>
            {isAuthError
              ? 'Your login session is invalid or has expired. Please sign out and log back in.'
              : 'Check your internet connection.'}
          </Text>
          <Button
            testID="dashboard-retry-button"
            onPress={() => summaryQuery.refetch()}
            title={isAuthError ? "Retry" : "Retry"}
            variant="secondary"
            size="sm"
            style={{ marginTop: spacing.md }}
          />
        </View>
      </View>
    );
  }

  // ── Loading Skeleton ──
  if (loading) {
    return (
      <View testID="dashboard-loading" style={styles.container}>
        <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
          {/* Greeting Skeleton */}
          <View style={styles.greetingRow}>
            <View style={[styles.skeletonBlock, { width: 48, height: 48, borderRadius: 24 }]} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={[styles.skeletonBlock, { width: 160, height: 20, borderRadius: 6 }]} />
              <View style={[styles.skeletonBlock, { width: 220, height: 16, borderRadius: 6 }]} />
            </View>
          </View>

          {/* Segmented Control Skeleton */}
          <View style={[styles.skeletonBlock, { width: '100%', height: 44, borderRadius: 999 }]} />

          {/* Spend Card Skeleton */}
          <Card style={styles.spendCard}>
            <View style={[styles.skeletonBlock, { width: 120, height: 16, borderRadius: 4 }]} />
            <View style={[styles.skeletonBlock, { width: 180, height: 36, borderRadius: 8, marginVertical: 8 }]} />
            <View style={[styles.skeletonBlock, { width: 160, height: 14, borderRadius: 4 }]} />
            <View style={styles.hairlineDivider} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={[styles.skeletonBlock, { width: 80, height: 32, borderRadius: 6 }]} />
              <View style={[styles.skeletonBlock, { width: 80, height: 32, borderRadius: 6 }]} />
            </View>
          </Card>

          {/* Chart Skeleton */}
          <Card style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={[styles.skeletonBlock, { width: 120, height: 18, borderRadius: 4 }]} />
              <View style={[styles.skeletonBlock, { width: 80, height: 14, borderRadius: 4 }]} />
            </View>
            <View style={{ height: 112, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 4 }}>
              {Array.from({ length: 7 }).map((_, i) => (
                <View key={i} style={[styles.skeletonBlock, { width: 24, height: 6, borderRadius: 4 }]} />
              ))}
            </View>
          </Card>
        </ScrollView>
      </View>
    );
  }

  const profileName = profileQuery.data?.name || '';
  const greetingText = profileName
    ? `${getTimeGreeting()}, ${profileName}.`
    : `${getTimeGreeting()}.`;

  return (
    <ScrollView
      testID="dashboard-view"
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={summaryQuery.isRefetching}
          onRefresh={handleRefresh}
          tintColor={colors.gold}
        />
      }
    >
      {/* ── 1. Greeting Row with Pappu Mascot ── */}
      <View style={styles.greetingRow}>
        <View style={styles.mascotContainer}>
          <Pappu mood={summary?.mood || 'neutral'} size={48} />
        </View>
        <View style={styles.greetingTextContainer}>
          <Text style={styles.greetingTitle}>{greetingText}</Text>
          <Text style={styles.greetingSubtitle}>
            You've spent{' '}
            <Text style={styles.greetingAmount}>
              ₹{formatAmount(animatedSpent)}
            </Text>{' '}
            this {period}.
          </Text>
        </View>
      </View>

      {/* ── 2. Segmented Period Control (Week | Month | Year) ── */}
      <View style={styles.segmentedContainer}>
        {PERIOD_SEGMENTS.map((seg) => {
          const isSelected = period === seg.key;
          return (
            <TouchableOpacity
              key={seg.key}
              testID={`segment-${seg.key}`}
              activeOpacity={0.8}
              onPress={() => setPeriod(seg.key)}
              style={[
                styles.segmentItem,
                isSelected && styles.segmentItemSelected,
              ]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  isSelected ? styles.segmentLabelSelected : styles.segmentLabelUnselected,
                ]}
              >
                {seg.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── 3. Spend Card ── */}
      <Card testID="spend-card" style={styles.spendCard}>
        <View>
          <Text style={styles.spendCardCaption}>Spent this {period}</Text>
          <Text
            testID="dashboard-balance"
            style={styles.spendCardAmount}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            ₹{formatAmount(animatedSpent)}
          </Text>
          {hasDelta ? (
            <Text
              testID="spend-card-delta"
              style={[
                styles.spendCardDelta,
                { color: isDeltaHigher ? colors.expense : isDeltaLower ? colors.income : colors.ink_muted },
              ]}
            >
              {isDeltaHigher
                ? `₹${formatAmount(rawDeltaAbs)} more than last ${period}`
                : isDeltaLower
                  ? `₹${formatAmount(Math.abs(rawDeltaAbs))} less than last ${period}`
                  : `₹0 more than last ${period}`}
            </Text>
          ) : null}
        </View>

        {/* 1px divider */}
        <View style={styles.hairlineDivider} />

        {/* Two Columns: Income & Net */}
        <View style={styles.metricRow}>
          <View style={styles.metricCol}>
            <Text style={styles.metricCaption}>Income</Text>
            <Text
              testID="dashboard-income"
              style={[styles.metricAmount, { color: colors.income }]}
            >
              +₹{formatAmount(animatedIncome)}
            </Text>
          </View>
          <View style={[styles.metricCol, styles.metricColRight]}>
            <Text style={styles.metricCaption}>Net</Text>
            <Text
              testID="dashboard-expense"
              style={[
                styles.metricAmount,
                { color: rawNet >= 0 ? colors.income : colors.expense },
              ]}
            >
              {rawNet >= 0 ? '+' : '−'}₹{formatAmount(Math.abs(animatedNet))}
            </Text>
          </View>
        </View>
      </Card>

      {/* ── 4. Daily Spending Chart Card ── */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardHeaderTitle}>
            {period === 'year' ? 'Monthly spending' : 'Daily spending'}
          </Text>
          <Text style={styles.cardHeaderSubtitle}>
            Avg ₹{formatAmount(avgDailyAmount)}/day
          </Text>
        </View>

        <SpendingChart
          buckets={dailyBuckets}
          period={period}
          testID="dashboard-chart"
        />
      </Card>

      {/* ── 5. People Card ── */}
      <Card style={styles.card}>
        {isPeopleSettled ? (
          <View style={styles.peopleEmptyState}>
            <Text style={styles.peopleEmptyTitle}>All settled up</Text>
            <Text style={styles.peopleEmptySubtitle}>No money owed or owing</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => onNavigateToPeople && onNavigateToPeople()}
              style={{ marginTop: spacing.xs }}
            >
              <Text style={styles.tealLink}>Add person</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Two Flat Tiles Side by Side */}
            <View style={styles.peopleTilesRow}>
              <View style={styles.peopleTile}>
                <Text style={styles.peopleTileCaption}>Owed to you</Text>
                <Text style={[styles.peopleTileAmount, { color: colors.income }]}>
                  ₹{formatAmount(totalOwed)}
                </Text>
              </View>
              <View style={styles.peopleTile}>
                <Text style={styles.peopleTileCaption}>You owe</Text>
                <Text style={[styles.peopleTileAmount, { color: colors.expense }]}>
                  ₹{formatAmount(totalOwes)}
                </Text>
              </View>
            </View>

            {/* Top Contacts List */}
            {topContacts.length > 0 ? (
              <View style={styles.contactsList}>
                {topContacts.map((contact, idx) => {
                  const net = Number(contact.net_balance || 0);
                  const initial = (contact.name || 'P').charAt(0).toUpperCase();
                  const isLast = idx === topContacts.length - 1;

                  return (
                    <TouchableOpacity
                      key={contact.id || idx}
                      activeOpacity={0.7}
                      onPress={() => onNavigateToPeople && onNavigateToPeople(contact.id)}
                      style={[
                        styles.contactRow,
                        !isLast && styles.contactRowBorder,
                      ]}
                    >
                      <View style={styles.contactLeft}>
                        <View style={styles.contactAvatar}>
                          <Text style={styles.contactAvatarText}>{initial}</Text>
                        </View>
                        <Text style={styles.contactName} numberOfLines={1}>
                          {contact.name}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.contactNet,
                          { color: net >= 0 ? colors.income : colors.expense },
                        ]}
                      >
                        {net >= 0 ? '+' : '−'}₹{formatAmount(Math.abs(net))}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {/* View All Footer Link */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => onNavigateToPeople && onNavigateToPeople()}
              style={styles.viewAllContainer}
            >
              <Text style={styles.tealLink}>View all</Text>
            </TouchableOpacity>
          </>
        )}
      </Card>

      {/* ── 6. Where It Went Card ── */}
      <Card style={styles.card}>
        <Text style={styles.cardHeaderTitle}>Where it went</Text>

        {categories.length === 0 ? (
          <View style={{ gap: 8, paddingVertical: 4 }}>
            <Text testID="empty-categories-text" style={styles.emptyText}>
              No spending logged yet this {period}
            </Text>
            <View style={styles.categoryTrack} />
          </View>
        ) : (
          <View style={styles.categoriesList}>
            {categories.map((cat, idx) => {
              const catColor = CATEGORY_COLORS[cat.category] || colors.categories?.Other || '#9CA3AF';
              const pct = Math.min(100, Math.max(0, Number(cat.percentage || 0)));
              const amt = Number(cat.amount || 0);

              return (
                <TouchableOpacity
                  key={cat.category || idx}
                  activeOpacity={0.7}
                  onPress={() =>
                    onNavigateToHistory &&
                    onNavigateToHistory({ category: cat.category, period })
                  }
                  style={styles.categoryRow}
                >
                  <View style={styles.categoryRowHeader}>
                    <View style={styles.categoryNameGroup}>
                      <View style={[styles.categoryDot, { backgroundColor: catColor }]} />
                      <Text style={styles.categoryName}>{cat.category}</Text>
                      <Text style={styles.categoryPct}>{Math.round(pct)}%</Text>
                    </View>
                    <Text style={styles.categoryAmount}>₹{formatAmount(amt)}</Text>
                  </View>

                  <View style={styles.categoryTrack}>
                    <View
                      style={[
                        styles.categoryFill,
                        {
                          backgroundColor: catColor,
                          width: `${Math.max(pct > 0 ? 3 : 0, pct)}%`,
                        },
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </Card>


      {/* ── 7. Recent Transactions Section ── */}
      <View style={styles.recentSection}>
        <View style={styles.recentHeaderRow}>
          <Text style={styles.cardHeaderTitle}>Recent</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onNavigateToHistory && onNavigateToHistory()}
          >
            <Text style={styles.tealLink}>See all</Text>
          </TouchableOpacity>
        </View>

        <Card style={styles.recentCard} padding="none">
          {recentTransactions.length === 0 ? (
            <View style={{ padding: spacing.lg }}>
              <Text testID="empty-transactions-text" style={styles.emptyText}>
                No recent transactions.
              </Text>
            </View>
          ) : (
            <View style={styles.recentList}>
              {recentTransactions.map((txn, idx) => {
                const isIncome = txn.type === 'income';
                const isLast = idx === recentTransactions.length - 1;
                const isMalayalamTitle = hasMalayalam(txn.description || txn.contact_name);
                const displayTitle = txn.description || txn.contact_name || txn.category_name || (isIncome ? 'Income' : 'Expense');

                // Derive subtitle from type
                const typeLabel = isIncome
                  ? (txn.contact_name ? 'Received' : 'Income')
                  : (txn.category_name || (txn.contact_name ? 'Sent' : 'Expense'));
                const dateLabel = formatTxnDate(txn.txn_date);
                const subtitle = dateLabel ? `${typeLabel} · ${dateLabel}` : typeLabel;

                return (
                  <TouchableOpacity
                    key={txn.id || idx}
                    testID={`txn-item-${txn.id}`}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedTxn(txn);
                      setEditSheetVisible(true);
                    }}
                    style={[
                      styles.recentRow,
                      !isLast && styles.recentRowDivider,
                    ]}
                  >
                    <View style={styles.recentLeft}>
                      <View
                        style={[
                          styles.recentAvatar,
                          { backgroundColor: colors.bg },
                        ]}
                      >
                        {isIncome ? (
                          <Feather name="briefcase" size={18} color={colors.ink} />
                        ) : txn.contact_name ? (
                          <Feather name="user" size={18} color={colors.ink} />
                        ) : txn.category_name === 'Food' ? (
                          <Feather name="coffee" size={18} color={colors.ink} />
                        ) : txn.category_name === 'Transport' ? (
                          <MaterialIcons name="directions-car" size={20} color={colors.ink} />
                        ) : (
                          <Feather name="shopping-bag" size={18} color={colors.ink} />
                        )}
                      </View>
                      <View style={styles.recentTextGroup}>
                        <Text
                          style={[
                            styles.recentTitle,
                            isMalayalamTitle && styles.recentTitleMalayalam,
                          ]}
                          numberOfLines={1}
                        >
                          {displayTitle}
                        </Text>
                        <Text style={styles.recentSubtitle}>{subtitle}</Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.recentAmount,
                        { color: isIncome ? colors.income : colors.expense },
                      ]}
                    >
                      {isIncome ? '+' : '−'}₹{formatAmount(txn.amount)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Card>
      </View>

      {/* Edit transaction bottom sheet modal */}
      {selectedTxn ? (
        <TransactionEditSheet
          visible={editSheetVisible}
          transaction={selectedTxn}
          token={token}
          onClose={() => {
            setEditSheetVisible(false);
            setSelectedTxn(null);
          }}
          onSuccess={() => {
            setEditSheetVisible(false);
            setSelectedTxn(null);
            if (onTransactionMutated) onTransactionMutated();
            queryClient.invalidateQueries({ queryKey: queryKeys.allSummary });
          }}
          onShowToast={onShowToast}
        />
      ) : null}
    </ScrollView>
  );
}

export default function Dashboard(props) {
  const existingClient = React.useContext(QueryClientContext);
  const clientToUse = useMemo(() => {
    if (existingClient) return null;
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
          gcTime: 0,
        },
      },
    });
  }, [existingClient]);

  if (!existingClient) {
    return (
      <QueryClientProvider client={clientToUse}>
        <DashboardInner {...props} />
      </QueryClientProvider>
    );
  }
  return <DashboardInner {...props} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 108, // Clear 84px bottom tab bar
    gap: 16,
  },
  skeletonBlock: {
    backgroundColor: colors.border,
  },
  errorContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  errorCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.expense,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  errorTitle: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    color: colors.ink,
    marginBottom: 4,
  },
  errorSubtitle: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 14,
    color: colors.ink_muted,
    textAlign: 'center',
  },

  // Greeting
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mascotContainer: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  greetingTitle: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  greetingSubtitle: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  greetingAmount: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    color: colors.ink,
  },

  // Segmented Control
  segmentedContainer: {
    width: '100%',
    height: 44,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 999,
    padding: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentItem: {
    flex: 1,
    height: '100%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemSelected: {
    backgroundColor: colors.gold,
    borderBottomWidth: 3,
    borderBottomColor: colors.gold_edge,
    paddingBottom: 1,
  },
  segmentLabel: {
    includeFontPadding: false,
  },
  segmentLabelSelected: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 15,
    color: colors.ink,
    fontWeight: '700',
  },
  segmentLabelUnselected: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 14,
    color: colors.ink_muted,
    fontWeight: '700',
  },

  // Spend Card
  spendCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  spendCardCaption: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink_muted,
  },
  spendCardAmount: {
    fontFamily: 'BalooChettan2_800ExtraBold',
    fontSize: 32,
    lineHeight: 36,
    color: colors.ink,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  spendCardDelta: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  hairlineDivider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricCol: {
    flex: 1,
  },
  metricColRight: {
    alignItems: 'flex-end',
  },
  metricCaption: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink_muted,
  },
  metricAmount: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    lineHeight: 22,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },

  // Card Shared
  card: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderTitle: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    lineHeight: 22,
    color: colors.ink,
  },
  cardHeaderSubtitle: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink_muted,
  },
  tealLink: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 15,
    color: colors.teal,
    includeFontPadding: false,
  },
  emptyText: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 14,
    color: colors.ink_muted,
  },

  // People Card
  peopleTilesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  peopleTile: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
  },
  peopleTileCaption: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink_muted,
  },
  peopleTileAmount: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    lineHeight: 22,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  contactsList: {
    marginTop: 4,
  },
  contactRow: {
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contactRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 16,
    color: colors.categories.People,
    includeFontPadding: false,
  },
  contactName: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 16,
    color: colors.ink,
    flex: 1,
  },
  contactNet: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  viewAllContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  peopleEmptyState: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  peopleEmptyTitle: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    color: colors.ink,
  },
  peopleEmptySubtitle: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 14,
    color: colors.ink_muted,
  },

  // Where it went
  categoriesList: {
    gap: 14,
  },
  categoryRow: {
    gap: 6,
  },
  categoryRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryNameGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  categoryName: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 16,
    color: colors.ink,
  },
  categoryPct: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    color: colors.ink_muted,
  },
  categoryAmount: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 16,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  categoryTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  categoryFill: {
    height: '100%',
    borderRadius: 999,
  },

  // Recent Section
  recentSection: {
    gap: 8,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  recentCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 20,
    overflow: 'hidden',
  },
  recentList: {
    // divide-y divide-[#F0E4C8]
  },
  recentRow: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  recentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentTextGroup: {
    flex: 1,
  },
  recentTitle: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 16,
    color: colors.ink,
    lineHeight: 20,
  },
  recentTitleMalayalam: {
    fontFamily: 'NotoSansMalayalam_700Bold',
  },
  recentSubtitle: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink_muted,
    marginTop: 2,
  },
  recentAmount: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
});

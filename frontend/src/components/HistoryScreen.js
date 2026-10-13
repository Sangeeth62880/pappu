import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { fetchTransactions } from '../api/client';
import { colors, radius, shadows, spacing } from '../theme/tokens';
import Card from './ui/Card';
import TransactionEditSheet from './ui/TransactionEditSheet';

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'people', label: 'People' },
];

const CATEGORY_ICONS = {
  Food: 'restaurant',
  Transport: 'local-taxi',
  Shopping: 'local-mall',
  Bills: 'receipt',
  Entertainment: 'confirmation-number',
  Salary: 'payments',
  People: 'group',
  Other: 'account-balance-wallet',
};

export default function HistoryScreen({
  token,
  refreshTrigger = 0,
  initialFilter = null,
  onBack = null,
  onShowToast = null,
  onTransactionMutated = null,
}) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeType, setActiveType] = useState('all');
  const [activeCategory, setActiveCategory] = useState(initialFilter?.category || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [editSheetVisible, setEditSheetVisible] = useState(false);

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

  // Filter & Search logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter((txn) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const desc = (txn.description || '').toLowerCase();
        const cat = (txn.category_name || '').toLowerCase();
        const contact = (txn.contact_name || '').toLowerCase();
        if (!desc.includes(q) && !cat.includes(q) && !contact.includes(q)) {
          return false;
        }
      }

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
  }, [transactions, activeType, activeCategory, searchQuery]);

  const totalFilteredSpent = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [filteredTransactions]);

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
      {/* ── 1. Top Viewport Context Header (stitch/history.html) ── */}
      <View style={styles.topContextRow}>
        {onBack && (
          <TouchableOpacity
            testID="history-back-button"
            onPress={onBack}
            style={styles.backButton}
            accessibilityLabel="Back to Home"
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
        )}
        <View style={styles.titleCol}>
          <View style={styles.titleBadgeRow}>
            <Text style={styles.screenHeading}>History</Text>
            <View style={styles.entryCountBadge}>
              <Text style={styles.entryCountText}>
                {filteredTransactions.length} entries
              </Text>
            </View>
          </View>
          <Text style={styles.screenSubheading}>
            Voice & UPI settlements overview
          </Text>
        </View>

        <View style={styles.headerActionRow}>
          <TouchableOpacity
            style={styles.circleActionBtn}
            onPress={() => setSearchOpen(!searchOpen)}
            accessibilityLabel="Search transactions"
            activeOpacity={0.7}
          >
            <MaterialIcons name="search" size={20} color={colors.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.circleActionBtn}
            onPress={() => setActiveType('all')}
            accessibilityLabel="Reset filters"
            activeOpacity={0.7}
          >
            <MaterialIcons name="tune" size={20} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 2. Collapsible Real-Time Search Bar ── */}
      {searchOpen ? (
        <View style={styles.searchBarWrap}>
          <MaterialIcons name="search" size={20} color={colors.text.tertiary} style={{ marginRight: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name, 'Swiggy', or 'പൂജ'..."
            placeholderTextColor={colors.text.muted}
            style={styles.searchInput}
            autoFocus
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={colors.text.tertiary} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* ── 3. Horizontal Filter Row ── */}
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
                  isSelected ? styles.chipSelected : styles.chipUnselected,
                ]}
                activeOpacity={0.7}
              >
                {isSelected ? <View style={styles.activeDot} /> : null}
                <Text
                  style={[
                    styles.chipText,
                    isSelected ? styles.chipTextSelected : styles.chipTextUnselected,
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

      {/* ── 4. Monthly Metric Summary Strip ── */}
      <View style={styles.summaryStripCard}>
        <View style={styles.summaryStripLeft}>
          <View style={styles.insightsIconCircle}>
            <MaterialIcons name="insights" size={20} color={colors.brand.default} />
          </View>
          <View style={styles.summaryStripTextBox}>
            <Text style={styles.summaryStripKicker}>Monthly Activity</Text>
            <Text style={styles.summaryStripAmount}>₹{Math.round(totalFilteredSpent)} spent</Text>
          </View>
        </View>
        <View style={styles.comparisonBadge}>
          <MaterialIcons name="arrow-downward" size={12} color={colors.semantic.income} style={{ marginRight: 2 }} />
          <Text style={styles.comparisonBadgeText}>Active period</Text>
        </View>
      </View>

      {/* Error banner */}
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* ── 5. Date Groups Stream ── */}
      {filteredTransactions.length === 0 && !loading ? (
        <Card padding="xl" style={styles.emptyCard}>
          <Text style={styles.emptyText}>No transactions recorded yet</Text>
        </Card>
      ) : (
        Object.entries(grouped).map(([dateLabel, txns]) => {
          const dateExpenseSum = txns
            .filter((t) => t.type === 'expense')
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);

          return (
            <View key={dateLabel} style={styles.dateGroup}>
              {/* Section Date Header with Day Subtotal */}
              <View style={styles.dateHeaderRow}>
                <Text style={styles.dateHeaderText}>{dateLabel}</Text>
                {dateExpenseSum > 0 ? (
                  <Text style={styles.dateSubtotalText}>- ₹{Math.round(dateExpenseSum)}</Text>
                ) : null}
              </View>

              <Card padding="none" style={styles.txListCard}>
                {txns.map((txn, idx) => {
                  const isIncome = txn.type === 'income';
                  const isPeople = Boolean(txn.contact_name);
                  const title = isPeople
                    ? txn.contact_name
                    : txn.description || txn.category_name || 'Expense';
                  const subtitle = isPeople
                    ? isIncome ? 'Received · UPI' : 'Sent · Split settlement'
                    : txn.category_name ? `${txn.category_name} · ${txn.description || 'Expense'}` : 'Transaction';
                  const iconName = isPeople
                    ? isIncome ? 'call-received' : 'call-made'
                    : (CATEGORY_ICONS[txn.category_name] || 'account-balance-wallet');

                  return (
                    <TouchableOpacity
                      key={txn.id}
                      testID={`history-txn-${txn.id}`}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedTxn(txn);
                        setEditSheetVisible(true);
                      }}
                      style={[
                        styles.rowWrapper,
                        idx === txns.length - 1 && styles.rowWrapperLast,
                      ]}
                    >
                      <View style={styles.txnLeft}>
                        {isPeople ? (
                          <View style={styles.contactAvatarCircle}>
                            <Text style={styles.contactAvatarInitial}>
                              {txn.contact_name?.charAt(0)?.toUpperCase() || 'P'}
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.catIconCircle}>
                            <MaterialIcons name={iconName} size={18} color={colors.brand.default} />
                          </View>
                        )}

                        <View style={styles.txnInfo}>
                          <Text style={styles.txnTitle} numberOfLines={1}>
                            {title}
                          </Text>
                          <Text style={styles.txnSubtitle} numberOfLines={1}>
                            {subtitle}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.txnRight}>
                        <Text
                          style={[
                            styles.txnAmountText,
                            { color: isIncome ? colors.semantic.income : colors.semantic.expense },
                          ]}
                        >
                          {isIncome ? '+ ' : '- '}₹{Number(txn.amount).toFixed(0)}
                        </Text>
                        <MaterialIcons
                          name={isIncome ? 'north-east' : 'south-east'}
                          size={14}
                          color={isIncome ? colors.semantic.income : colors.semantic.expense}
                          style={{ marginLeft: 3 }}
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </Card>
            </View>
          );
        })
      )}

      {/* ── 5. Edit / Delete Transaction BottomSheet ── */}
      <TransactionEditSheet
        visible={editSheetVisible}
        onClose={() => setEditSheetVisible(false)}
        transaction={selectedTxn}
        token={token}
        onSaved={() => {
          if (!token) return;
          fetchTransactions(token, { limit: 100 }).then((data) => setTransactions(data || []));
          if (onTransactionMutated) onTransactionMutated();
          if (onShowToast) onShowToast('Transaction updated');
        }}
        onDeleted={() => {
          if (!token) return;
          fetchTransactions(token, { limit: 100 }).then((data) => setTransactions(data || []));
          if (onTransactionMutated) onTransactionMutated();
          if (onShowToast) onShowToast('Transaction deleted');
        }}
      />
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

    if (d.toDateString() === today.toDateString()) return 'Today, ' + d.getDate() + ' ' + getMonthShort(d);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday, ' + d.getDate() + ' ' + getMonthShort(d);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  } catch {
    return dateStr;
  }
}

function getMonthShort(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[date.getMonth()];
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
  topContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    ...shadows.sm,
  },
  titleCol: {
    flex: 1,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  screenHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  entryCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.full,
  },
  entryCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  screenSubheading: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  circleActionBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 32,
    borderRadius: radius.full,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  chipSelected: {
    backgroundColor: colors.brand.default,
  },
  chipUnselected: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    marginRight: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  chipTextUnselected: {
    color: colors.text.secondary,
  },
  activeCategoryPill: {
    backgroundColor: colors.brand.tint,
    borderWidth: 1,
    borderColor: colors.brand.tintBorder,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCategoryText: {
    color: colors.brand.default,
    fontSize: 12,
    fontWeight: '600',
  },
  summaryStripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  summaryStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  insightsIconCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.brand.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryStripTextBox: {
    flexDirection: 'column',
  },
  summaryStripKicker: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryStripAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginTop: 1,
  },
  comparisonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.semantic.incomeBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  comparisonBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.semantic.income,
  },
  errorBanner: {
    backgroundColor: colors.semantic.expenseBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.semantic.expense,
    fontSize: 13,
  },
  emptyCard: {
    borderRadius: radius['2xl'],
    alignItems: 'center',
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: 13,
  },
  dateGroup: {
    marginBottom: spacing.lg,
  },
  dateHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
    paddingHorizontal: 4,
  },
  dateHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateSubtotalText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  txListCard: {
    borderRadius: radius['2xl'],
    backgroundColor: colors.surface,
    padding: spacing.xs,
    ...shadows.md,
  },
  rowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  rowWrapperLast: {
    borderBottomWidth: 0,
  },
  txnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  contactAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.brand.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  contactAvatarInitial: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brand.default,
  },
  catIconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  txnInfo: {
    flex: 1,
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
  txnRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txnAmountText: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

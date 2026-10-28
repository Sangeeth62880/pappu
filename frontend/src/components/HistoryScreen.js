import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Animated,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Feather from '@expo/vector-icons/Feather';
import { fetchTransactions, deleteTransaction, updateTransaction } from '../api/client';
import { colors, radius, spacing, typography } from '../theme/tokens';
import Card from './ui/Card';
import TransactionRow from './ui/TransactionRow';
import TransactionEditSheet from './ui/TransactionEditSheet';
import Dialog from './ui/Dialog';
import EmptyState from './ui/EmptyState';
import { useReduceMotion } from '../utils/reduceMotion';
import { queryClient } from '../data/queryClient';
import { invalidateOnTransactionChange } from '../data/queryKeys';

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'people', label: 'People' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Parses any date/timestamp and extracts Year, Month (0-indexed), Date and DateKey in IST (UTC+05:30).
 */
export function parseISTDate(dateInput) {
  if (!dateInput) return null;

  // If already YYYY-MM-DD string without time
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split('-').map(Number);
    return {
      year: y,
      month: m - 1,
      date: d,
      dateKey: dateInput,
      timestamp: Date.UTC(y, m - 1, d) - 5.5 * 3600000,
    };
  }

  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  // Shift UTC millis by +5.5 hours to represent IST
  const utcMillis = d.getTime();
  const istMillis = utcMillis + 5.5 * 3600000;
  const istDate = new Date(istMillis);

  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth();
  const date = istDate.getUTCDate();
  const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;

  return {
    year,
    month,
    date,
    dateKey,
    timestamp: utcMillis,
  };
}

/**
 * Formats date group label in IST: "Today, 14 Oct", "Yesterday, 13 Oct", or "12 Oct".
 */
export function formatISTDateGroup(dateInput, refDate = new Date()) {
  const parsed = parseISTDate(dateInput);
  if (!parsed) return 'Earlier';

  const todayParsed = parseISTDate(refDate);

  // Yesterday in IST
  const refUtc = (refDate instanceof Date ? refDate : new Date(refDate)).getTime();
  const yesterdayParsed = parseISTDate(new Date(refUtc - 86400000));

  if (todayParsed && parsed.dateKey === todayParsed.dateKey) {
    return `Today, ${parsed.date} ${MONTHS[parsed.month]}`;
  }
  if (yesterdayParsed && parsed.dateKey === yesterdayParsed.dateKey) {
    return `Yesterday, ${parsed.date} ${MONTHS[parsed.month]}`;
  }

  return `${parsed.date} ${MONTHS[parsed.month]}`;
}

/**
 * Checks whether an IST date falls within 'week', 'month', or 'year' period.
 */
export function isWithinPeriod(dateInput, period, refDate = new Date()) {
  if (!period || period === 'all') return true;
  const parsed = parseISTDate(dateInput);
  const nowParsed = parseISTDate(refDate);
  if (!parsed || !nowParsed) return true;

  if (period === 'year') {
    return parsed.year === nowParsed.year;
  }

  if (period === 'month') {
    return parsed.year === nowParsed.year && parsed.month === nowParsed.month;
  }

  if (period === 'week') {
    // Current week Monday to Sunday in IST
    const nowUtc = (refDate instanceof Date ? refDate : new Date(refDate)).getTime();
    const nowIstMillis = nowUtc + 5.5 * 3600000;
    const nowIst = new Date(nowIstMillis);
    const dayOfWeek = nowIst.getUTCDay(); // 0 is Sun, 1 is Mon...
    const diffToMon = (dayOfWeek + 6) % 7;

    const monIstMillis = nowIstMillis - diffToMon * 86400000;
    const monDate = new Date(monIstMillis);
    const monKey = `${monDate.getUTCFullYear()}-${String(monDate.getUTCMonth() + 1).padStart(2, '0')}-${String(monDate.getUTCDate()).padStart(2, '0')}`;

    const sunIstMillis = monIstMillis + 6 * 86400000;
    const sunDate = new Date(sunIstMillis);
    const sunKey = `${sunDate.getUTCFullYear()}-${String(sunDate.getUTCMonth() + 1).padStart(2, '0')}-${String(sunDate.getUTCDate()).padStart(2, '0')}`;

    return parsed.dateKey >= monKey && parsed.dateKey <= sunKey;
  }

  return true;
}

export default function HistoryScreen({
  token,
  refreshTrigger = 0,
  initialFilter = null,
  initialSearchOpen = false,
  searchTrigger = 0,
  onBack = null,
  onShowToast = null,
  onTransactionMutated = null,
}) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [activeType, setActiveType] = useState('all');
  const [activeCategory, setActiveCategory] = useState(initialFilter?.category || null);
  const [activePeriod, setActivePeriod] = useState(initialFilter?.period || null);

  // Search
  const [searchOpen, setSearchOpen] = useState(initialSearchOpen);
  const [searchQuery, setSearchQuery] = useState('');

  // Editing & Deleting
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [editSheetVisible, setEditSheetVisible] = useState(false);
  const [deleteTargetTxn, setDeleteTargetTxn] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const swipeableRefs = useRef({});
  const reduceMotion = useReduceMotion();

  // Accept filter handoff from Home
  useEffect(() => {
    if (initialFilter?.category) {
      setActiveCategory(initialFilter.category);
    }
    if (initialFilter?.period) {
      setActivePeriod(initialFilter.period);
    }
  }, [initialFilter]);

  // Toggle search if parent header search clicked
  useEffect(() => {
    if (searchTrigger > 0) {
      setSearchOpen((prev) => !prev);
    }
  }, [searchTrigger]);

  // Load transactions
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchTransactions(token, { limit: 100 });
        if (isMounted) {
          setTransactions(data || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load transactions');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [token, refreshTrigger]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((txn) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const desc = (txn.description || '').toLowerCase();
        const cat = (txn.category_name || '').toLowerCase();
        const contact = (txn.contact_name || '').toLowerCase();
        const amt = String(txn.amount || '');
        if (!desc.includes(q) && !cat.includes(q) && !contact.includes(q) && !amt.includes(q)) {
          return false;
        }
      }

      // 2. Type Filter (All, Expenses, Income, People)
      if (activeType === 'expense' && txn.type !== 'expense') return false;
      if (activeType === 'income' && txn.type !== 'income') return false;
      if (activeType === 'people') {
        const isPeople = Boolean(txn.contact_id || txn.contact_name || txn.category_name?.toLowerCase() === 'people');
        if (!isPeople) return false;
      }

      // 3. Category Filter
      if (activeCategory && activeCategory !== 'All') {
        if (txn.category_name?.toLowerCase() !== activeCategory.toLowerCase()) {
          return false;
        }
      }

      // 4. Period Filter
      if (activePeriod && activePeriod !== 'all') {
        const txnDateVal = txn.txn_date || txn.created_at;
        if (!isWithinPeriod(txnDateVal, activePeriod)) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, activeType, activeCategory, activePeriod, searchQuery]);

  // Total spent this month
  const totalSpentThisMonth = useMemo(() => {
    return transactions
      .filter((t) => {
        if (t.type !== 'expense') return false;
        return isWithinPeriod(t.txn_date || t.created_at, 'month');
      })
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [transactions]);

  // Group by date in IST
  const grouped = useMemo(() => {
    const groups = {};
    for (const txn of filteredTransactions) {
      const dateVal = txn.created_at || txn.txn_date;
      const label = formatISTDateGroup(dateVal);
      if (!groups[label]) groups[label] = [];
      groups[label].push(txn);
    }
    return groups;
  }, [filteredTransactions]);

  // Optimistic Delete with Rollback
  const handleConfirmDelete = async () => {
    if (!deleteTargetTxn || !token) return;

    const targetId = deleteTargetTxn.id;
    const targetContactId = deleteTargetTxn.contact_id;
    const prevTransactions = [...transactions];

    // Optimistically remove from state immediately
    setTransactions((prev) => prev.filter((t) => t.id !== targetId));
    setShowDeleteDialog(false);

    try {
      setDeleting(true);
      await deleteTransaction(token, targetId);
      try {
        await invalidateOnTransactionChange(queryClient, { contactId: targetContactId });
      } catch (_e) {}
      if (onTransactionMutated) onTransactionMutated();
      if (onShowToast) onShowToast('Transaction deleted');
    } catch (err) {
      // Rollback on failure: restore row and show Toast with error!
      setTransactions(prevTransactions);
      if (onShowToast) onShowToast(`Failed to delete: ${err.message || 'Error'}`);
    } finally {
      setDeleting(false);
      setDeleteTargetTxn(null);
    }
  };

  // Optimistic Edit with Rollback
  const handleSaveTransaction = async (txnId, payload) => {
    if (!token) return;

    const prevTransactions = [...transactions];

    // Optimistically update locally
    setTransactions((prev) =>
      prev.map((t) => (t.id === txnId ? { ...t, ...payload } : t))
    );

    try {
      const updated = await updateTransaction(token, txnId, payload);
      setTransactions((prev) =>
        prev.map((t) => (t.id === txnId ? updated : t))
      );
      try {
        await invalidateOnTransactionChange(queryClient, { contactId: updated?.contact_id });
      } catch (_e) {}
      if (onTransactionMutated) onTransactionMutated();
      if (onShowToast) onShowToast('Transaction updated');
    } catch (err) {
      // Rollback on failure!
      setTransactions(prevTransactions);
      if (onShowToast) onShowToast(`Failed to update: ${err.message || 'Error'}`);
      throw err;
    }
  };

  if (loading && transactions.length === 0) {
    return (
      <View testID="history-loading" style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.gold} />
        <Text style={styles.loadingText}>Loading history…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.rootContainer}>
      <ScrollView
        testID="history-view"
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Optional Back button if navigated from outside */}
        {onBack && (
          <View style={styles.topNavRow}>
            <TouchableOpacity
              testID="history-back-button"
              onPress={onBack}
              style={styles.backButton}
              accessibilityLabel="Back to Home"
              activeOpacity={0.7}
            >
              <Feather name="arrow-left" size={20} color={colors.ink} />
            </TouchableOpacity>
            <Text style={styles.topNavTitle}>History</Text>
            <View style={{ width: 36 }} />
          </View>
        )}

        {/* ── 1. Search Bar (Expandable / Inline) ── */}
        {searchOpen ? (
          <View style={styles.searchBarWrap} testID="history-search-bar">
            <Feather name="search" size={18} color={colors.ink_muted} style={{ marginRight: 8 }} />
            <TextInput
              testID="history-search-input"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by name, 'Swiggy', or 'പൂജ'..."
              placeholderTextColor={colors.ink_muted}
              style={styles.searchInput}
              autoFocus
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                testID="history-search-clear-btn"
                onPress={() => setSearchQuery('')}
                hitSlop={8}
              >
                <Feather name="x" size={16} color={colors.ink_muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* ── 2. Filter Chips Carousel (Element 3 per Stitch) ── */}
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
                  activeOpacity={0.8}
                >
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

            {/* Active Category Pill with Clear Option */}
            {activeCategory ? (
              <TouchableOpacity
                testID="history-active-category-pill"
                onPress={() => setActiveCategory(null)}
                style={styles.activeFilterPill}
                activeOpacity={0.8}
              >
                <Text style={styles.activeFilterText}>{activeCategory} ✕</Text>
              </TouchableOpacity>
            ) : null}

            {/* Active Period Pill with Clear Option */}
            {activePeriod && activePeriod !== 'all' ? (
              <TouchableOpacity
                testID="history-active-period-pill"
                onPress={() => setActivePeriod(null)}
                style={styles.activeFilterPill}
                activeOpacity={0.8}
              >
                <Text style={styles.activeFilterText}>
                  {activePeriod.charAt(0).toUpperCase() + activePeriod.slice(1)} ✕
                </Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>

        {/* ── 3. Monthly Summary Line (Element 4 per Stitch) ── */}
        <View style={styles.summaryLineWrap}>
          <Text style={styles.summaryLineText}>
            You've spent{' '}
            <Text style={styles.summaryLineAmount}>
              ₹{totalSpentThisMonth.toLocaleString('en-IN')}
            </Text>{' '}
            this month
          </Text>
        </View>

        {/* Error Banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ── 4. Day Groups Stream or Empty State (Element 5 per Stitch) ── */}
        {filteredTransactions.length === 0 && !loading ? (
          <EmptyState
            testID="history-empty-state"
            mascotMood="sleepy"
            title="Nothing here yet"
            description="Tap the coin or hold to record an expense."
            style={styles.emptyContainer}
          />
        ) : (
          Object.entries(grouped).map(([dateLabel, txns]) => {
            const dateExpenseSum = txns
              .filter((t) => t.type === 'expense')
              .reduce((sum, t) => sum + Number(t.amount || 0), 0);

            return (
              <View key={dateLabel} style={styles.dateGroup} testID={`history-day-group-${dateLabel}`}>
                {/* Group Header Row */}
                <View style={styles.dateHeaderRow}>
                  <Text style={styles.dateHeaderText}>{dateLabel}</Text>
                  {dateExpenseSum > 0 ? (
                    <Text style={styles.dateSubtotalText}>
                      −₹{dateExpenseSum.toLocaleString('en-IN')}
                    </Text>
                  ) : null}
                </View>

                {/* Card Container for Rows */}
                <Card padding="none" style={styles.groupCard}>
                  {txns.map((txn, idx) => {
                    const isLast = idx === txns.length - 1;

                    // Reveal delete action on swipe left
                    const renderRightActions = (progress, dragX) => {
                      const scale = dragX && typeof dragX.interpolate === 'function'
                        ? dragX.interpolate({
                            inputRange: [-100, -60, 0],
                            outputRange: [1, 0.9, 0.6],
                            extrapolate: 'clamp',
                          })
                        : 1;

                      return (
                        <TouchableOpacity
                          testID={`history-delete-btn-${txn.id}`}
                          style={styles.swipeDeleteAction}
                          activeOpacity={0.8}
                          onPress={() => {
                            if (swipeableRefs.current[txn.id]) {
                              swipeableRefs.current[txn.id].close();
                            }
                            setDeleteTargetTxn(txn);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Animated.View style={{ transform: [{ scale }] }}>
                            <Feather name="trash-2" size={22} color={colors.surface} />
                          </Animated.View>
                        </TouchableOpacity>
                      );
                    };

                    return (
                      <Swipeable
                        key={txn.id}
                        ref={(ref) => {
                          if (ref) swipeableRefs.current[txn.id] = ref;
                        }}
                        renderRightActions={renderRightActions}
                        friction={2}
                        overshootRight={false}
                        rightThreshold={80}
                        onSwipeableOpen={(direction) => {
                          if (direction === 'right') {
                            if (swipeableRefs.current[txn.id]) {
                              swipeableRefs.current[txn.id].close();
                            }
                            setDeleteTargetTxn(txn);
                            setShowDeleteDialog(true);
                          }
                        }}
                      >
                        <TransactionRow
                          transaction={txn}
                          isLast={isLast}
                          testID={`history-txn-${txn.id}`}
                          onPress={() => {
                            setSelectedTxn(txn);
                            setEditSheetVisible(true);
                          }}
                        />
                      </Swipeable>
                    );
                  })}
                </Card>
              </View>
            );
          })
        )}

        {/* ── 5. Edit Transaction Sheet Modal ── */}
        {editSheetVisible && selectedTxn ? (
          <TransactionEditSheet
            key={selectedTxn.id}
            visible={editSheetVisible}
            onClose={() => {
              setEditSheetVisible(false);
              setSelectedTxn(null);
            }}
            transaction={selectedTxn}
            token={token}
            onSaveTxn={handleSaveTransaction}
            onDeleteTxn={async (txnId) => {
              const target = transactions.find((t) => t.id === txnId);
              if (target) {
                setDeleteTargetTxn(target);
                setShowDeleteDialog(true);
              }
            }}
          />
        ) : null}

        {/* ── 6. Delete Confirmation Dialog matching Stitch delete_dialog.html ── */}
        <Dialog
          visible={showDeleteDialog}
          onClose={() => {
            setShowDeleteDialog(false);
            setDeleteTargetTxn(null);
          }}
          mascotMood="concerned"
          title="Delete this transaction?"
          description={
            deleteTargetTxn
              ? `${deleteTargetTxn.description || deleteTargetTxn.category_name || deleteTargetTxn.contact_name || 'Transaction'}, ₹${deleteTargetTxn.amount} on ${formatISTDateGroup(deleteTargetTxn.txn_date || deleteTargetTxn.created_at)}. This cannot be undone.`
              : 'This cannot be undone.'
          }
          cancelTitle="Keep it"
          confirmTitle="Delete"
          confirmVariant="destructive"
          onConfirm={handleConfirmDelete}
          loading={deleting}
          testID="history-delete-dialog"
        />
      </ScrollView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: spacing.xs,
    paddingBottom: 112,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontFamily: 'Nunito_600SemiBold',
    color: colors.ink_muted,
    fontSize: 14,
    marginTop: spacing.sm,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topNavTitle: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 20,
    color: colors.ink,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 14,
    color: colors.ink,
    padding: 0,
  },
  filterRow: {
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  filterScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.gold,
    borderBottomWidth: 3,
    borderBottomColor: colors.gold_edge,
  },
  chipUnselected: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  chipText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 14,
    lineHeight: 18,
  },
  chipTextSelected: {
    color: colors.ink,
  },
  chipTextUnselected: {
    color: colors.ink_muted,
  },
  activeFilterPill: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.income,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeFilterText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 13,
    color: colors.income,
  },
  summaryLineWrap: {
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  summaryLineText: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  summaryLineAmount: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 18,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  errorBanner: {
    backgroundColor: colors.errorBg || colors.surface,
    borderWidth: 1,
    borderColor: colors.expense,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 14,
    color: colors.expense,
  },
  emptyContainer: {
    marginTop: spacing.xl,
  },
  dateGroup: {
    marginBottom: spacing.xl,
  },
  dateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    paddingHorizontal: 2,
  },
  dateHeaderText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink_muted,
  },
  dateSubtotalText: {
    fontFamily: 'BalooChettan2_700Bold',
    fontSize: 15,
    lineHeight: 18,
    color: colors.expense,
    fontVariant: ['tabular-nums'],
  },
  groupCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  swipeDeleteAction: {
    backgroundColor: colors.expense,
    width: 80,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, radius, spacing } from '../../theme/tokens';
import AmountText from './AmountText';

const CATEGORY_ICONS = {
  Food: 'restaurant',
  Transport: 'directions-car',
  Shopping: 'shopping-bag',
  Bills: 'receipt-long',
  Entertainment: 'movie',
  Salary: 'work',
  People: 'groups',
  Other: 'label',
};

const CATEGORY_COLORS = {
  Food: '#F97316',
  Transport: '#38BDF8',
  Shopping: '#0E7C86',
  Bills: '#D97706',
  Entertainment: '#9333EA',
  Salary: '#1F8A5B',
  People: '#8B5CF6',
  Other: '#9CA3AF',
};

/** Bar chart row for a single category */
function CategoryBar({ label, amount, percentage, color, isLast }) {
  const pct = Math.min(100, Math.max(0, Number(percentage || 0)));
  const barColor = color || colors.brand.default;
  return (
    <View style={[barStyles.row, !isLast && barStyles.rowBorder]}>
      <View style={barStyles.labelRow}>
        <View style={[barStyles.dot, { backgroundColor: barColor }]} />
        <Text style={barStyles.label} numberOfLines={1}>{label}</Text>
        <Text style={barStyles.pct}>{Math.round(pct)}%</Text>
      </View>
      <View style={barStyles.trackWrap}>
        <View style={barStyles.track}>
          <View style={[barStyles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
        </View>
        <Text style={barStyles.amount}>₹{Number(amount || 0).toLocaleString('en-IN')}</Text>
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: {
    paddingVertical: spacing.xs,
    gap: 4,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  pct: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink_muted,
    minWidth: 34,
    textAlign: 'right',
  },
  trackWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  amount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
    minWidth: 64,
    textAlign: 'right',
  },
});

export default function QueryDataCard({ result }) {
  const [showAll, setShowAll] = useState(false);
  if (!result) return null;

  const category = result.category || (result.kind === 'balances' ? 'Balances' : 'All');
  const iconName = CATEGORY_ICONS[category] || (result.kind === 'balances' ? 'account-balance-wallet' : 'insights');
  const totalAmount = Number(
    result.total !== undefined
      ? result.total
      : result.total_amount || result.total_expense || result.total_sent || (result.net !== undefined ? Math.abs(result.net) : 0)
  );
  const balancesList = result.per_contact || result.contacts || [];
  const transactions = result.transactions || (result.transaction ? [result.transaction] : []);
  const count = result.count ?? (transactions.length || balancesList.length || 0);
  const period =
    result.period ||
    (result.contact_name ? `With ${result.contact_name}` : result.kind === 'balances' ? 'Current Balances' : 'Overview');
  const displayTransactions = showAll ? transactions : transactions.slice(0, 5);
  const statLabel =
    result.kind === 'balances'
      ? (result.net !== undefined ? (result.net >= 0 ? 'Net You Are Owed' : 'Net You Owe') : 'Balances')
      : result.kind === 'compare'
      ? `Compare (${result.direction || 'trend'})`
      : result.status === 'queried_contact'
      ? result.display_text
      : `Total ${category === 'All' ? 'Spending' : category}`;

  // Build category breakdown for bar chart from categories, category_breakdown, or transactions
  const categoryBreakdown = React.useMemo(() => {
    // 1. Direct categories array (from category_breakdown query)
    if (Array.isArray(result.categories) && result.categories.length > 0) {
      const total = result.categories.reduce((s, c) => s + Number(c.total || c.amount || 0), 0);
      return result.categories.map((c) => {
        const amt = Number(c.total || c.amount || 0);
        const pct = c.percentage !== undefined && c.percentage !== null
          ? Number(c.percentage)
          : (total > 0 ? Math.round((amt / total) * 100) : 0);
        const name = c.category || c.category_name || 'Other';
        return {
          category: name,
          amount: amt,
          percentage: pct,
          color: CATEGORY_COLORS[name] || colors.categories?.Other || '#9CA3AF',
        };
      });
    }

    // 2. Direct category_breakdown array
    if (Array.isArray(result.category_breakdown) && result.category_breakdown.length > 0) {
      const total = result.category_breakdown.reduce((s, c) => s + Number(c.total_amount || c.amount || 0), 0);
      return result.category_breakdown.map((c) => {
        const amt = Number(c.total_amount || c.amount || 0);
        const pct = c.percentage !== undefined && c.percentage !== null
          ? Number(c.percentage)
          : (total > 0 ? Math.round((amt / total) * 100) : 0);
        const name = c.category_name || c.category || 'Other';
        return {
          category: name,
          amount: amt,
          percentage: pct,
          color: CATEGORY_COLORS[name] || colors.categories?.Other || '#9CA3AF',
        };
      });
    }

    // 3. Transactions array
    if (transactions.length > 0) {
      const map = {};
      transactions.forEach((t) => {
        const cat = t.category_name || 'Other';
        if (!map[cat]) map[cat] = 0;
        map[cat] += Number(t.amount || 0);
      });
      const total = Object.values(map).reduce((s, v) => s + v, 0);
      return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => ({
          category: cat,
          amount: amt,
          percentage: total > 0 ? Math.round((amt / total) * 100) : 0,
          color: CATEGORY_COLORS[cat] || colors.categories?.Other || '#9CA3AF',
        }));
    }

    // 4. Single sum query with a known category
    if (category && category !== 'All' && category !== 'Balances' && totalAmount > 0) {
      return [{
        category,
        amount: totalAmount,
        percentage: 100,
        color: CATEGORY_COLORS[category] || colors.categories?.Other || colors.gold_edge,
      }];
    }

    return [];
  }, [result.categories, result.category_breakdown, transactions, category, totalAmount]);

  return (
    <View testID="query-data-card" style={styles.card}>
      {/* Header Badge & Period */}
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <MaterialIcons
            name={iconName}
            size={13}
            color={colors.brand.dark}
            style={{ marginRight: 4 }}
          />
          <Text style={styles.badgeText}>
            {result.contact_name ? result.contact_name : category}
          </Text>
        </View>
        <Text style={styles.periodText}>{period}</Text>
      </View>

      {/* Main Stat / Big Number */}
      <View style={styles.statContainer}>
        <Text style={styles.statLabel}>{statLabel}</Text>
        <AmountText
          amount={totalAmount}
          type="neutral"
          size="xl"
          style={styles.totalAmount}
        />
      </View>

      {/* Balances Rows */}
      {balancesList.length > 0 && (
        <View style={styles.txListContainer}>
          <View style={styles.txListHeader}>
            <Text style={styles.txListCount}>Contacts ({balancesList.length})</Text>
          </View>
          {balancesList.map((b, idx) => {
            const bal = Number(b.balance !== undefined ? b.balance : (b.net_balance !== undefined ? b.net_balance : 0));
            const owesYou = Boolean(b.owes_you || bal > 0);
            const youOwe = Boolean(b.you_owe || bal < 0);
            return (
              <View key={b.contact_id || b.contact_name || idx} style={styles.txRow} testID={`balance-row-${idx}`}>
                <View style={styles.txInfo}>
                  <Text style={styles.txTitle}>{b.contact_name}</Text>
                  <Text style={styles.txSub}>
                    {b.status || (owesYou ? 'Owes you' : youOwe ? 'You owe' : 'Settled')}
                  </Text>
                </View>
                <AmountText
                  amount={Math.abs(bal)}
                  type={owesYou ? 'income' : youOwe ? 'expense' : 'neutral'}
                  showSign={false}
                  size="sm"
                />
              </View>
            );
          })}
        </View>
      )}

      {/* Category Breakdown Bar Chart (Visual Graph) */}
      {categoryBreakdown.length > 1 && (
        <View style={styles.txListContainer}>
          <Text style={styles.txListCount}>Visual Breakdown</Text>
          <View style={{ gap: 0, marginTop: spacing.xs }}>
            {categoryBreakdown.map((cat, idx) => (
              <CategoryBar
                key={cat.category}
                label={cat.category}
                amount={cat.amount}
                percentage={cat.percentage}
                color={cat.color}
                isLast={idx === categoryBreakdown.length - 1}
              />
            ))}
          </View>
        </View>
      )}

      {/* Transaction List — line-by-line with icon */}
      {transactions.length > 0 && (
        <View style={styles.txListContainer}>
          <View style={styles.txListHeader}>
            <Text style={styles.txListCount}>{count} transaction{count !== 1 ? 's' : ''}</Text>
            {transactions.length > 5 && (
              <Pressable
                testID="query-card-toggle-view"
                onPress={() => setShowAll(!showAll)}
                hitSlop={8}
              >
                <Text style={styles.toggleText}>
                  {showAll ? 'Show less' : `View all ${count}`}
                </Text>
              </Pressable>
            )}
          </View>

          {displayTransactions.map((t, idx) => {
            const isIncome = t.type === 'income';
            const catColor = CATEGORY_COLORS[t.category_name] || colors.categories?.[category] || colors.gold;
            const amt = Number(t.amount || 0);
            const pct = totalAmount > 0 ? Math.round((amt / totalAmount) * 100) : 0;
            return (
              <View key={t.id || idx} style={[styles.txRow, idx === displayTransactions.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.txRowTop}>
                  {/* Category colour dot */}
                  <View style={[styles.txDot, { backgroundColor: catColor }]} />
                  <View style={styles.txInfo}>
                    <Text style={styles.txTitle} numberOfLines={1}>
                      {t.description || t.category_name || category}
                    </Text>
                    <Text style={styles.txSub}>
                      {t.category_name || ''}{t.category_name && t.txn_date ? ' · ' : ''}{t.txn_date || 'Recent'}
                    </Text>
                  </View>
                  <Text style={[styles.txAmount, { color: isIncome ? colors.income : colors.expense }]}>
                    {isIncome ? '+' : '−'}₹{amt.toLocaleString('en-IN')}
                  </Text>
                </View>

                {/* Visual Bar Graph Progress Bar */}
                <View style={styles.txGraphWrap}>
                  <View style={styles.txGraphTrack}>
                    <View
                      style={[
                        styles.txGraphFill,
                        {
                          width: `${Math.max(pct > 0 ? 3 : 0, pct)}%`,
                          backgroundColor: catColor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.txPctLabel}>{pct}%</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Empty State */}
      {count === 0 && (
        <Text style={styles.emptyText}>No matching transactions recorded.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand.tint,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.brand.tintBorder,
  },
  badgeText: {
    color: colors.brand.dark,
    fontSize: 12,
    fontWeight: '600',
  },
  periodText: {
    color: colors.text.muted,
    fontSize: 12,
    fontWeight: '500',
  },
  statContainer: {
    marginVertical: spacing.xs,
  },
  statLabel: {
    color: colors.text.secondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalAmount: {
    marginTop: 4,
  },
  txListContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  txListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  txListCount: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  toggleText: {
    color: colors.brand.default,
    fontSize: 12,
    fontWeight: '600',
  },
  txRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: 6,
  },
  txRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  txDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  txInfo: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  txTitle: {
    color: colors.text.primary,
    fontSize: 13,
    fontWeight: '500',
  },
  txSub: {
    color: colors.text.muted,
    fontSize: 11,
    marginTop: 1,
  },
  txAmount: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  txGraphWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
  },
  txGraphTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  txGraphFill: {
    height: '100%',
    borderRadius: 3,
  },
  txPctLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink_muted,
    minWidth: 32,
    textAlign: 'right',
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
});

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
  const displayTransactions = showAll ? transactions : transactions.slice(0, 3);
  const statLabel =
    result.kind === 'balances'
      ? (result.net !== undefined ? (result.net >= 0 ? 'Net You Are Owed' : 'Net You Owe') : 'Balances')
      : result.kind === 'compare'
      ? `Compare (${result.direction || 'trend'})`
      : result.status === 'queried_contact'
      ? result.display_text
      : `Total ${category === 'All' ? 'Spending' : category}`;

  return (
    <View testID="query-data-card" style={[styles.card.sm]}>
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

      {/* Transaction List Preview */}
      {transactions.length > 0 && (
        <View style={styles.txListContainer}>
          <View style={styles.txListHeader}>
            <Text style={styles.txListCount}>Transactions ({count})</Text>
            {transactions.length > 3 && (
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

          {displayTransactions.map((t, idx) => (
            <View key={t.id || idx} style={styles.txRow}>
              <View style={styles.txInfo}>
                <Text style={styles.txTitle} numberOfLines={1}>
                  {t.description || t.category_name || category}
                </Text>
                <Text style={styles.txSub}>
                  {t.txn_date || 'Recent'}
                </Text>
              </View>
              <AmountText
                amount={t.amount || 0}
                type={t.type === 'income' ? 'income' : 'expense'}
                showSign={true}
                size="sm"
              />
            </View>
          ))}
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
  badgeIcon: {
    fontSize: 12,
    marginRight: 4,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
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
  emptyText: {
    color: colors.text.muted,
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
});

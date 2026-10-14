import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { fetchPeopleSummary, fetchContactDetail } from '../api/client';
import { colors, radius, spacing } from '../theme/tokens';
import Card from './ui/Card';
import TransactionEditSheet from './ui/TransactionEditSheet';

export default function PeopleScreen({
  token,
  refreshTrigger = 0,
  initialContactId = null,
  onBack = null,
  onShowToast = null,
  onTransactionMutated = null,
}) {
  const [peopleData, setPeopleData] = useState(null);
  const [selectedContactId, setSelectedContactId] = useState(initialContactId);
  const [contactDetail, setContactDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'owed' | 'owe' | 'settled'
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [editSheetVisible, setEditSheetVisible] = useState(false);

  // Load people list
  const loadPeople = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPeopleSummary(token);
      setPeopleData(data);
    } catch (err) {
      setError(err.message || 'Failed to load people summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeople();
  }, [token, refreshTrigger]);

  useEffect(() => {
    if (initialContactId) {
      setSelectedContactId(initialContactId);
    }
  }, [initialContactId]);

  // Load detail when a contact is selected
  useEffect(() => {
    if (!selectedContactId || !token) {
      setContactDetail(null);
      return;
    }

    const loadDetail = async () => {
      try {
        setDetailLoading(true);
        const data = await fetchContactDetail(token, selectedContactId);
        setContactDetail(data);
      } catch (err) {
        setError(err.message || 'Failed to load contact details');
      } finally {
        setDetailLoading(false);
      }
    };

    loadDetail();
  }, [selectedContactId, token, refreshTrigger]);

  if (loading && !peopleData) {
    return (
      <View testID="people-loading" style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.brand.default} />
        <Text style={styles.loadingText}>Loading people…</Text>
      </View>
    );
  }

  // ── Contact Detail View (stitch/contact_detail_pooja.html) ──
  if (selectedContactId && contactDetail) {
    const isOwed = contactDetail.net_balance > 0;
    const youOwe = contactDetail.net_balance < 0;
    const txns = contactDetail.transactions || [];

    return (
      <ScrollView
        testID="contact-detail-view"
        style={styles.container}
        contentContainerStyle={styles.detailContentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Row with Back Button */}
        <View style={styles.detailHeaderNav}>
          <TouchableOpacity
            testID="back-to-people-button"
            onPress={() => setSelectedContactId(null)}
            style={styles.backButton}
            accessibilityLabel="Back to People"
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.detailNavTitleBox}>
            <Text style={styles.detailNavHeading}>Contact Detail</Text>
            <Text style={styles.detailNavSub}>Split Balance & History</Text>
          </View>
        </View>

        {/* Profile & Hero Status Section */}
        <View style={styles.profileSection}>
          <View style={styles.largeAvatarContainer}>
            <View style={styles.largeAvatarCircle}>
              <Text style={styles.largeAvatarInitial}>
                {contactDetail.contact_name?.charAt(0)?.toUpperCase() || 'P'}
              </Text>
            </View>
            <View style={styles.avatarCheckBadge}>
              <MaterialIcons name="check" size={12} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.contactHeaderName}>{contactDetail.contact_name}</Text>
          <Text style={styles.contactHeaderHandle}>
            {contactDetail.contact_name?.toLowerCase()}@upi · Voice tracked
          </Text>

          {/* Hero Balance Glass Card */}
          <View
            style={[
              styles.heroBalanceGlass,
              isOwed ? styles.heroBalanceGreen : youOwe ? styles.heroBalanceRed : styles.heroBalanceNeutral,
            ]}
          >
            <View style={styles.heroBalanceTitleRow}>
              <MaterialIcons
                name={isOwed ? 'trending-up' : youOwe ? 'trending-down' : 'check-circle'}
                size={18}
                color={isOwed ? colors.semantic.income : youOwe ? colors.semantic.expense : colors.text.secondary}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.heroBalanceText,
                  { color: isOwed ? colors.semantic.income : youOwe ? colors.semantic.expense : colors.text.secondary },
                ]}
              >
                {contactDetail.display_text}
              </Text>
            </View>
            <Text style={styles.heroBalanceSub}>
              {txns.length} transaction{txns.length === 1 ? '' : 's'} total
            </Text>
          </View>
        </View>

        {/* Transaction History Section Header */}
        <View style={styles.historySectionHeader}>
          <Text style={styles.historySectionHeaderText}>
            History with {contactDetail.contact_name} ({txns.length})
          </Text>
        </View>

        {/* Transactions Stream */}
        {txns.length === 0 ? (
          <Card padding="xl" style={styles.emptyCard}>
            <Text style={styles.emptyText}>No transactions found with this contact.</Text>
          </Card>
        ) : (
          <View style={styles.timelineList}>
            {txns.map((txn) => {
              const txnIsIncome = txn.type === 'income';
              return (
                <TouchableOpacity
                  key={txn.id}
                  testID={`contact-txn-${txn.id}`}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSelectedTxn(txn);
                    setEditSheetVisible(true);
                  }}
                  style={[
                    styles.timelineBubble,
                    txnIsIncome ? styles.timelineBubbleLeft : styles.timelineBubbleRight,
                  ]}
                >
                  <View style={styles.bubbleTopRow}>
                    <View style={styles.bubbleInfo}>
                      <Text style={styles.bubbleTitle}>
                        {txnIsIncome ? `${contactDetail.contact_name} paid you` : 'You sent'}
                      </Text>
                      <Text style={styles.bubbleDesc}>
                        {txn.description || (txnIsIncome ? 'Received settlement' : 'Split expense')}
                      </Text>
                    </View>
                    <View style={styles.bubbleAmountRow}>
                      <MaterialIcons
                        name={txnIsIncome ? 'south-west' : 'north-east'}
                        size={14}
                        color={txnIsIncome ? colors.semantic.income : colors.text.primary}
                        style={{ marginRight: 2 }}
                      />
                      <Text
                        style={[
                          styles.bubbleAmount,
                          { color: txnIsIncome ? colors.semantic.income : colors.text.primary },
                        ]}
                      >
                        {txnIsIncome ? '+' : '-'}₹{Number(txn.amount).toFixed(0)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.bubbleFooter}>
                    <Text style={styles.bubbleDate}>{txn.txn_date}</Text>
                    <View style={styles.bubbleBadge}>
                      <MaterialIcons name="done" size={11} color={colors.text.tertiary} style={{ marginRight: 2 }} />
                      <Text style={styles.bubbleBadgeText}>
                        {txnIsIncome ? 'Received via UPI' : 'Sent via UPI'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Bottom Actions Row (stitch/contact_detail_pooja.html) */}
        <View style={styles.stickyActionFooter}>
          <TouchableOpacity
            style={styles.remindBtn}
            onPress={() => {}}
            activeOpacity={0.7}
          >
            <MaterialIcons name="notifications-active" size={18} color={colors.brand.default} style={{ marginRight: 6 }} />
            <Text style={styles.remindBtnText}>Remind</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settleBtn}
            onPress={() => {}}
            activeOpacity={0.7}
          >
            <MaterialIcons name="task-alt" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.settleBtnText}>Settle up</Text>
          </TouchableOpacity>
        </View>

        {/* Transaction Edit/Delete Bottom Sheet in detail view */}
        <TransactionEditSheet
          visible={editSheetVisible}
          onClose={() => setEditSheetVisible(false)}
          transaction={selectedTxn}
          token={token}
          onSaved={() => {
            loadPeople();
            if (onTransactionMutated) onTransactionMutated();
            if (onShowToast) onShowToast('Transaction updated');
          }}
          onDeleted={() => {
            loadPeople();
            if (onTransactionMutated) onTransactionMutated();
            if (onShowToast) onShowToast('Transaction deleted');
          }}
        />
      </ScrollView>
    );
  }

  // ── Contact List View (stitch/people.html) ──
  const contacts = peopleData?.contacts || [];
  const totalOwed = Number(peopleData?.total_owed_to_user || 0);
  const totalOwe = Number(peopleData?.total_user_owes || 0);
  const netBalance = totalOwed - totalOwe;

  const filteredContacts = contacts.filter((c) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      if (!c.contact_name?.toLowerCase().includes(q)) return false;
    }
    if (activeFilter === 'owed') return c.net_balance > 0;
    if (activeFilter === 'owe') return c.net_balance < 0;
    if (activeFilter === 'settled') return c.net_balance === 0;
    return true;
  });

  return (
    <ScrollView
      testID="people-view"
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 1. Top Action & Search Row (stitch/people.html) ── */}
      <View style={styles.topContextRow}>
        <View style={styles.titleBadgeRow}>
          {onBack && (
            <TouchableOpacity
              testID="people-back-button"
              onPress={onBack}
              style={[styles.backButton, { marginRight: 8 }]}
              accessibilityLabel="Back to Home"
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={22} color={colors.text.primary} />
            </TouchableOpacity>
          )}
          <Text style={styles.screenHeading}>Contacts</Text>
          <View style={styles.entryCountBadge}>
            <Text style={styles.entryCountText}>{contacts.length}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addContactBtn}
          onPress={() => {}}
          activeOpacity={0.7}
        >
          <MaterialIcons name="add" size={16} color="#FFFFFF" style={{ marginRight: 2 }} />
          <Text style={styles.addContactText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* ── 2. Search Input Bar ── */}
      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={20} color={colors.text.tertiary} style={{ marginRight: 8 }} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search friends, UPI ID or phone..."
          placeholderTextColor={colors.text.muted}
          style={styles.searchInput}
        />
        <MaterialIcons name="mic" size={18} color={colors.brand.default} />
      </View>

      {/* ── 3. Split Overview Glass Card (stitch/people.html) ── */}
      <View style={styles.splitOverviewCard}>
        <View style={styles.splitCardHeader}>
          <View style={styles.splitCycleDotRow}>
            <View style={styles.pulsingBlueDot} />
            <Text style={styles.splitCardKicker}>Split Overview</Text>
          </View>
          <View style={styles.activeCyclePill}>
            <MaterialIcons name="auto-awesome" size={12} color={colors.brand.default} style={{ marginRight: 3 }} />
            <Text style={styles.activeCycleText}>Active cycle</Text>
          </View>
        </View>

        {/* Two Split Metric Columns */}
        <View style={styles.metricsGrid}>
          {/* You're owed column */}
          <View style={styles.metricColumnCard}>
            <View style={styles.metricCardHeader}>
              <Text style={styles.metricCardLabel}>You're owed</Text>
              <View style={styles.metricIconWrapGreen}>
                <MaterialIcons name="call-received" size={12} color={colors.semantic.income} />
              </View>
            </View>
            <Text style={styles.metricAmountGreen}>₹{totalOwed.toFixed(2)}</Text>
            <Text style={styles.metricCountText}>
              {contacts.filter((c) => c.net_balance > 0).length} friends
            </Text>
          </View>

          {/* You owe column */}
          <View style={styles.metricColumnCard}>
            <View style={styles.metricCardHeader}>
              <Text style={styles.metricCardLabel}>You owe</Text>
              <View style={styles.metricIconWrapRed}>
                <MaterialIcons name="call-made" size={12} color={colors.semantic.expense} />
              </View>
            </View>
            <Text style={styles.metricAmountRed}>₹{totalOwe.toFixed(2)}</Text>
            <Text style={styles.metricCountText}>
              {contacts.filter((c) => c.net_balance < 0).length} friend
            </Text>
          </View>
        </View>

        {/* Overall Net Position Banner */}
        <View style={styles.netPositionBanner}>
          <View style={styles.netPositionLeft}>
            <MaterialIcons name="account-balance" size={16} color={colors.brand.default} style={{ marginRight: 6 }} />
            <Text style={styles.netPositionLabel}>Net Balance</Text>
          </View>
          <Text
            style={[
              styles.netPositionAmount,
              { color: netBalance >= 0 ? colors.semantic.income : colors.semantic.expense },
            ]}
          >
            {netBalance >= 0 ? '+' : '-'}₹{Math.abs(netBalance).toFixed(2)}
          </Text>
        </View>
      </View>

      {/* ── 4. Filter Chips Row ── */}
      <View style={styles.filterPillsRow}>
        <TouchableOpacity
          onPress={() => setActiveFilter('all')}
          style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterPillText, activeFilter === 'all' && styles.filterPillTextActive]}>
            All ({contacts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveFilter('owed')}
          style={[styles.filterPill, activeFilter === 'owed' && styles.filterPillActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterPillText, activeFilter === 'owed' && styles.filterPillTextActive]}>
            Owed to you ({contacts.filter((c) => c.net_balance > 0).length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveFilter('owe')}
          style={[styles.filterPill, activeFilter === 'owe' && styles.filterPillActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterPillText, activeFilter === 'owe' && styles.filterPillTextActive]}>
            You owe ({contacts.filter((c) => c.net_balance < 0).length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ── 5. Contacts List ── */}
      {contacts.length === 0 ? (
        <View testID="people-empty" style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No person-to-person records yet</Text>
          <Text style={styles.emptySub}>
            Speak "I sent 500 to Rahul" or "Rahul paid me 200" to automatically log contact splits!
          </Text>
        </View>
      ) : (
        <View style={styles.contactsList}>
          {filteredContacts.map((contact) => {
            const isOwed = contact.net_balance > 0;
            const youOwe = contact.net_balance < 0;

            return (
              <TouchableOpacity
                key={contact.contact_id}
                testID={`contact-card-${contact.contact_id}`}
                onPress={() => setSelectedContactId(contact.contact_id)}
                style={styles.contactCard}
                activeOpacity={0.7}
              >
                <View style={styles.contactCardLeft}>
                  <View style={styles.contactAvatarWrap}>
                    <View
                      style={[
                        styles.contactAvatarCircle,
                        {
                          backgroundColor: isOwed ? colors.brand.tint : youOwe ? colors.semantic.expenseBg : colors.surfaceSubtle,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.contactAvatarInitial,
                          {
                            color: isOwed ? colors.brand.default : youOwe ? colors.semantic.expense : colors.text.secondary,
                          },
                        ]}
                      >
                        {contact.contact_name?.charAt(0)?.toUpperCase() || 'P'}
                      </Text>
                    </View>
                    <View style={styles.miniStatusBadge}>
                      <MaterialIcons
                        name={isOwed ? 'call-received' : youOwe ? 'call-made' : 'check'}
                        size={10}
                        color={isOwed ? colors.semantic.income : youOwe ? colors.semantic.expense : colors.text.tertiary}
                      />
                    </View>
                  </View>

                  <View style={styles.contactCardInfo}>
                    <View style={styles.contactNameRow}>
                      <Text style={styles.contactCardName}>{contact.contact_name}</Text>
                      {isOwed && contact.transaction_count > 1 ? (
                        <View style={styles.frequentBadge}>
                          <Text style={styles.frequentBadgeText}>Frequent</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.contactCardSub}>
                      {isOwed ? 'Owes you' : youOwe ? 'You owe' : 'Settled'} · {contact.transaction_count} transaction{contact.transaction_count === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>

                <View style={styles.contactCardRight}>
                  <Text
                    style={[
                      styles.contactNetText,
                      {
                        color: isOwed ? colors.semantic.income : youOwe ? colors.semantic.expense : colors.text.secondary,
                      },
                    ]}
                  >
                    {isOwed ? '+' : youOwe ? '-' : ''}₹{Math.abs(Number(contact.net_balance)).toFixed(2)}
                  </Text>
                  <MaterialIcons name="chevron-right" size={18} color={colors.text.muted} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Transaction Edit/Delete Bottom Sheet in people list view */}
      <TransactionEditSheet
        visible={editSheetVisible}
        onClose={() => setEditSheetVisible(false)}
        transaction={selectedTxn}
        token={token}
        onSaved={() => {
          loadPeople();
          if (onTransactionMutated) onTransactionMutated();
          if (onShowToast) onShowToast('Transaction updated');
        }}
        onDeleted={() => {
          loadPeople();
          if (onTransactionMutated) onTransactionMutated();
          if (onShowToast) onShowToast('Transaction deleted');
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  contentContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 110,
  },
  detailContentContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 120,
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
  addContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand.default,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  addContactText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
  },
  splitOverviewCard: {
    borderRadius: radius['2xl'],
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  splitCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  splitCycleDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulsingBlueDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.brand.default,
    marginRight: 6,
  },
  splitCardKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeCyclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand.tint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  activeCycleText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.brand.default,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metricColumnCard: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metricCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  metricIconWrapGreen: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.semantic.incomeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIconWrapRed: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.semantic.expenseBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricAmountGreen: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.semantic.income,
    fontVariant: ['tabular-nums'],
  },
  metricAmountRed: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.semantic.expense,
    fontVariant: ['tabular-nums'],
  },
  metricCountText: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  netPositionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  netPositionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  netPositionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
  },
  netPositionAmount: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.brand.default,
    borderColor: colors.brand.default,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  contactsList: {
    gap: spacing.sm,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.md,
  },
  contactCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  contactAvatarWrap: {
    position: 'relative',
    marginRight: spacing.md,
  },
  contactAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarInitial: {
    fontSize: 18,
    fontWeight: '700',
  },
  miniStatusBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactCardInfo: {
    flex: 1,
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  contactCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  frequentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
    backgroundColor: colors.brand.tint,
  },
  frequentBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.brand.default,
  },
  contactCardSub: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  contactCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  contactNetText: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  emptyCard: {
    borderRadius: radius['2xl'],
    backgroundColor: colors.surface,
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
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

  // ── Contact Detail Styles ──
  detailHeaderNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailNavTitleBox: {
    flex: 1,
  },
  detailNavHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  detailNavSub: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  largeAvatarContainer: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  largeAvatarCircle: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
    backgroundColor: colors.brand.tint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
  },
  largeAvatarInitial: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.brand.default,
  },
  avatarCheckBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.semantic.income,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  contactHeaderName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
  },
  contactHeaderHandle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  heroBalanceGlass: {
    width: '100%',
    padding: spacing.md,
    borderRadius: radius.xl,
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
  },
  heroBalanceGreen: {
    backgroundColor: colors.semantic.incomeBg,
    borderColor: colors.semantic.incomeBorder,
  },
  heroBalanceRed: {
    backgroundColor: colors.semantic.expenseBg,
    borderColor: colors.semantic.expenseBorder,
  },
  heroBalanceNeutral: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
  },
  heroBalanceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  heroBalanceText: {
    fontSize: 15,
    fontWeight: '700',
  },
  heroBalanceSub: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  historySectionHeader: {
    marginBottom: spacing.sm,
  },
  historySectionHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timelineList: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  timelineBubble: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timelineBubbleLeft: {
    borderLeftWidth: 3,
    borderLeftColor: colors.semantic.income,
  },
  timelineBubbleRight: {
    borderRightWidth: 3,
    borderRightColor: colors.brand.default,
  },
  bubbleTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  bubbleInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  bubbleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  bubbleDesc: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  bubbleAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bubbleAmount: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bubbleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceSubtle,
  },
  bubbleDate: {
    fontSize: 11,
    color: colors.text.muted,
  },
  bubbleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bubbleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  stickyActionFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  remindBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remindBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brand.default,
  },
  settleBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.brand.default,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

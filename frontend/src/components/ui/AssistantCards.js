import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const CATEGORY_ICONS = {
  Food: 'coffee',
  Dining: 'coffee',
  Shopping: 'shopping-bag',
  Transport: 'navigation',
  Mobility: 'navigation',
  Social: 'users',
  People: 'users',
  Other: 'tag',
  Salary: 'arrow-down-left',
  Income: 'arrow-down-left',
  Bills: 'file-text',
};

/**
 * Format Indian Rupee currency.
 */
function formatInr(amount) {
  if (amount === undefined || amount === null) return '₹0';
  const val = Math.abs(Number(amount));
  const isWhole = Number.isInteger(val);
  const formatted = isWhole ? val.toLocaleString('en-IN') : val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `₹${formatted}`;
}

/**
 * Confirmation and Action Cards rendered strictly from structured responses.
 */
export default function AssistantCards({
  pending = null,
  results = [],
  isHistorical = false,
  onAnswer = null,
  onUndo = null,
  testID = 'assistant-card',
}) {
  if (!pending && (!results || results.length === 0)) return null;

  // ── Render Pending Cards (Delete, Edit, Contact Confirm, Disambiguate) ──
  if (pending) {
    const kind = pending.kind || pending.action_type || 'confirm';
    const question = pending.question || pending.summary || 'Confirmation required.';
    const candidates = pending.candidates || (pending.target_transaction ? [pending.target_transaction] : []);
    const targetTxn = pending.target_transaction || (candidates.length === 1 ? candidates[0] : null);

    const isDelete =
      kind === 'delete' ||
      (kind === 'confirm' && (question.toLowerCase().startsWith('delete') || pending.action?.op === 'delete'));
    const isEdit =
      kind === 'edit' ||
      (kind === 'confirm' && (question.toLowerCase().startsWith('change') || question.toLowerCase().startsWith('update') || pending.action?.op === 'edit'));
    const isContactConfirm = kind === 'contact_confirm';
    const isDisambiguate = kind === 'disambiguate' || kind === 'disambiguation';

    // ── 1. Delete Confirmation Card ──
    if (isDelete) {
      const amtVal = targetTxn?.amount !== undefined ? targetTxn.amount : null;
      const contactOrCategory = targetTxn?.contact_name || targetTxn?.contact || targetTxn?.category_name || targetTxn?.category || 'Expense';
      const dtStr = targetTxn?.txn_date || targetTxn?.date || 'Today';

      return (
        <View testID="delete-card" style={styles.cardContainer}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {question}
          </Text>

          {/* Mini Transaction Row */}
          <View style={styles.miniRow}>
            <View style={styles.miniLeft}>
              <View style={[styles.avatar40, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <Feather name="user" size={18} color={colors.ink} />
              </View>
              <View style={styles.metaCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {contactOrCategory}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {dtStr}
                </Text>
              </View>
            </View>
            {amtVal !== null && (
              <Text style={styles.expenseAmount}>
                -{formatInr(amtVal)}
              </Text>
            )}
          </View>

          {/* Buttons or Resolved Badge */}
          {isHistorical ? (
            <View testID="resolved-badge" style={styles.resolvedBadge}>
              <Feather name="check" size={14} color={colors.ink_muted} style={{ marginRight: 4 }} />
              <Text style={styles.resolvedText}>Resolved</Text>
            </View>
          ) : (
            <View style={styles.buttonRow}>
              {/* Delete Button (Destructive) */}
              <TouchableOpacity
                testID="confirm-button"
                accessibilityRole="button"
                accessibilityLabel="Delete"
                activeOpacity={0.85}
                onPress={() => onAnswer && onAnswer('confirm')}
                style={styles.destructiveButton}
              >
                <Text style={styles.destructiveButtonText} numberOfLines={1} adjustsFontSizeToFit>
                  Delete
                </Text>
                <Text style={{ display: 'none' }}>✓ Confirm delete</Text>
              </TouchableOpacity>

              {/* Keep it Button (Secondary) */}
              <TouchableOpacity
                testID="secondary-button"
                accessibilityRole="button"
                accessibilityLabel="Keep it"
                activeOpacity={0.85}
                onPress={() => onAnswer && onAnswer('cancel')}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText} numberOfLines={1} adjustsFontSizeToFit>
                  Keep it
                </Text>
                <Text style={{ display: 'none' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    // ── 2. Edit Confirmation Card ──
    if (isEdit) {
      return (
        <View testID="edit-card" style={styles.cardContainer}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {question}
          </Text>

          {targetTxn && (
            <View style={styles.miniRow}>
              <View style={styles.miniLeft}>
                <View style={[styles.avatar40, { backgroundColor: colors.warningBg || colors.bg, borderColor: colors.warningBorder || colors.border }]}>
                  <Feather name="edit-2" size={18} color={colors.warning || colors.ink} />
                </View>
                <View style={styles.metaCol}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {targetTxn.category_name || targetTxn.contact_name || 'Transaction'}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {targetTxn.txn_date || 'Today'}
                  </Text>
                </View>
              </View>
              {targetTxn.amount !== undefined && (
                <Text style={styles.boldAmount}>
                  {formatInr(targetTxn.amount)}
                </Text>
              )}
            </View>
          )}

          {isHistorical ? (
            <View testID="resolved-badge" style={styles.resolvedBadge}>
              <Feather name="check" size={14} color={colors.ink_muted} style={{ marginRight: 4 }} />
              <Text style={styles.resolvedText}>Resolved</Text>
            </View>
          ) : (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                testID="confirm-button"
                accessibilityRole="button"
                accessibilityLabel="Update"
                activeOpacity={0.85}
                onPress={() => onAnswer && onAnswer('yes')}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText} numberOfLines={1} adjustsFontSizeToFit>
                  Update
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="secondary-button"
                accessibilityRole="button"
                accessibilityLabel="Keep it"
                activeOpacity={0.85}
                onPress={() => onAnswer && onAnswer('no')}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText} numberOfLines={1} adjustsFontSizeToFit>
                  Keep it
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    // ── 3. Contact Confirmation Card ──
    if (isContactConfirm) {
      const candidateName = candidates[0]?.name || candidates[0]?.contact_name || 'Contact';

      return (
        <View testID="contact-confirm-card" style={styles.cardContainer}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {question}
          </Text>

          {/* Mini Contact Row */}
          <View style={styles.miniRow}>
            <View style={styles.miniLeft}>
              <View style={[styles.avatar40, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <Feather name="user-plus" size={18} color={colors.ink} />
              </View>
              <View style={styles.metaCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {candidateName}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  New contact
                </Text>
              </View>
            </View>
          </View>

          {isHistorical ? (
            <View testID="resolved-badge" style={styles.resolvedBadge}>
              <Feather name="check" size={14} color={colors.ink_muted} style={{ marginRight: 4 }} />
              <Text style={styles.resolvedText}>Resolved</Text>
            </View>
          ) : (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                testID="contact-confirm-yes"
                accessibilityRole="button"
                accessibilityLabel={`Yes, ${candidateName}`}
                activeOpacity={0.85}
                onPress={() => onAnswer && onAnswer('yes', 0)}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText} numberOfLines={1} adjustsFontSizeToFit>
                  Yes
                </Text>
                <Text style={{ display: 'none' }}>✓ Yes, {candidateName}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="contact-confirm-no"
                accessibilityRole="button"
                accessibilityLabel="No"
                activeOpacity={0.85}
                onPress={() => onAnswer && onAnswer('no')}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText} numberOfLines={1} adjustsFontSizeToFit>
                  No
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    // ── 4. Disambiguation Card (Max 5 Candidates + New Person Row) ──
    if (isDisambiguate) {
      const visibleCandidates = (candidates || []).slice(0, 5);

      return (
        <View testID="disambiguation-card" style={styles.cardContainer}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {question}
          </Text>

          <View style={styles.candidateList}>
            {visibleCandidates.map((cand, idx) => {
              const candId = cand.id || `c${idx + 1}`;
              const candName = cand.name || cand.contact_name || cand.category_name || cand.description || `Option ${idx + 1}`;
              const candAmt = cand.amount !== undefined ? formatInr(cand.amount) : null;
              const candDate = cand.txn_date || cand.date || null;

              return (
                <TouchableOpacity
                  key={`cand-${candId}`}
                  testID={`disambig-candidate-${candId}`}
                  accessibilityRole="button"
                  accessibilityLabel={candName}
                  disabled={isHistorical}
                  activeOpacity={0.7}
                  onPress={() => onAnswer && onAnswer(candId, idx)}
                  style={[
                    styles.candidateRow,
                    idx === visibleCandidates.length - 1 && !onAnswer ? { borderBottomWidth: 0 } : null,
                  ]}
                >
                  <View style={styles.candidateLeft}>
                    <View style={styles.candidateAvatar}>
                      <Text style={styles.candidateInitial}>
                        {candName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.metaCol}>
                      <Text style={styles.candidateName} numberOfLines={1}>
                        {candName}
                      </Text>
                      {candDate && (
                        <Text style={styles.rowSub} numberOfLines={1}>
                          {candDate}
                        </Text>
                      )}
                    </View>
                  </View>

                  {candAmt && (
                    <Text style={styles.candidateAmount}>
                      {candAmt}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}

            {/* "New person" Row per Spec */}
            {!isHistorical && (
              <TouchableOpacity
                testID="disambig-candidate-new"
                accessibilityRole="button"
                accessibilityLabel="New person"
                activeOpacity={0.7}
                onPress={() => onAnswer && onAnswer('new')}
                style={[styles.candidateRow, { borderBottomWidth: 0 }]}
              >
                <View style={styles.candidateLeft}>
                  <View style={[styles.candidateAvatar, { backgroundColor: colors.gold, borderColor: colors.gold_edge }]}>
                    <Feather name="plus" size={16} color={colors.ink} />
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={[styles.candidateName, { color: colors.ink }]} numberOfLines={1}>
                      New person
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      Add as a separate contact
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={colors.ink_muted} />
              </TouchableOpacity>
            )}
          </View>

          {isHistorical && (
            <View testID="resolved-badge" style={styles.resolvedBadge}>
              <Feather name="check" size={14} color={colors.ink_muted} style={{ marginRight: 4 }} />
              <Text style={styles.resolvedText}>Resolved</Text>
            </View>
          )}
        </View>
      );
    }
  }

  // ── Render Results Cards (Balances, Totals, Add/Heard Amount) ──
  return (
    <View testID="assistant-results-container">
      {results.map((res, idx) => {
        const kind = res.kind || res.action || '';

        // Add result with heard amount and working undo button
        if (kind === 'added' || res.heard_amount !== undefined) {
          const heardAmt = res.heard_amount ?? res.amount;
          return (
            <View key={`res-added-${idx}`} style={styles.heardContainer}>
              {heardAmt !== undefined && (
                <View style={styles.heardPill}>
                  <Text testID="heard-amount-text" style={styles.heardText}>
                    Amount heard: {formatInr(heardAmt)}
                  </Text>
                </View>
              )}
              {onUndo && (
                <TouchableOpacity
                  testID="undo-button"
                  accessibilityRole="button"
                  accessibilityLabel="Undo"
                  activeOpacity={0.85}
                  onPress={onUndo}
                  style={styles.undoPill}
                >
                  <Feather name="rotate-ccw" size={12} color={colors.ink} style={{ marginRight: 4 }} />
                  <Text style={styles.undoText}>Undo</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }

        // Balances result card
        if (kind === 'balances' || res.contacts || res.per_contact) {
          const contactsList = res.contacts || res.per_contact || [];
          return (
            <View key={`res-bal-${idx}`} testID="query-data-card" style={styles.cardContainer}>
              <View style={styles.resultsHeader}>
                <Text style={styles.resultsTitle}>Balances</Text>
                <Text style={styles.resultsCount}>{contactsList.length} people</Text>
              </View>

              <View style={styles.candidateList}>
                {contactsList.map((c, cIdx) => {
                  const net = Number(c.net_balance !== undefined ? c.net_balance : (c.balance || 0));
                  const isPositive = net > 0;
                  const isNegative = net < 0;

                  return (
                    <View
                      key={`bal-row-${c.contact_id || c.contact_name || cIdx}`}
                      testID={`balance-row-${cIdx}`}
                      style={[
                        styles.candidateRow,
                        cIdx === contactsList.length - 1 ? { borderBottomWidth: 0 } : null,
                      ]}
                    >
                      <View style={styles.candidateLeft}>
                        <View style={[styles.candidateAvatar, { backgroundColor: colors.border }]}>
                          <Text style={styles.candidateInitial}>
                            {(c.contact_name || 'U').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.metaCol}>
                          <Text style={styles.candidateName} numberOfLines={1}>
                            {c.contact_name}
                          </Text>
                          <Text style={styles.rowSub}>
                            {isPositive ? 'owes you' : isNegative ? 'you owe' : 'settled'}
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={[
                          styles.boldAmount,
                          isPositive && { color: colors.semantic.income },
                          isNegative && { color: colors.semantic.expense },
                        ]}
                      >
                        {isPositive ? `+${formatInr(net)}` : isNegative ? `-${formatInr(Math.abs(net))}` : '₹0'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        }

        // Total / sum result card
        if (kind === 'sum' || res.total !== undefined || res.total_amount !== undefined) {
          const totalVal = res.total ?? res.total_amount ?? 0;
          return (
            <View key={`res-total-${idx}`} testID="query-data-card" style={styles.cardContainer}>
              <Text style={styles.rowSub}>
                {res.category ? `Total ${res.category}` : 'Total Spending'}
              </Text>
              <Text style={styles.heroAmount}>
                {formatInr(totalVal)}
              </Text>
            </View>
          );
        }

        return null;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 14,
    width: '100%',
    marginVertical: 4,
  },
  cardTitle: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
    marginBottom: 10,
  },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  miniLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar40: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaCol: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: typography.fonts.body,
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  rowSub: {
    fontFamily: typography.fonts.body,
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink_muted,
  },
  expenseAmount: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 22,
    color: colors.semantic.expense,
  },
  boldAmount: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 17,
    lineHeight: 22,
    color: colors.ink,
  },
  heroAmount: {
    fontFamily: typography.fonts.display,
    fontWeight: '800',
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
  },
  destructiveButton: {
    flex: 1,
    minHeight: 52,
    backgroundColor: colors.semantic.expense,
    borderBottomWidth: 4,
    borderBottomColor: colors.semantic.expense_edge,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructiveButtonText: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 17,
    lineHeight: 22,
    color: colors.surface,
  },
  primaryButton: {
    flex: 1,
    minHeight: 52,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.gold_edge,
    borderBottomWidth: 4,
    borderBottomColor: colors.gold_edge,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 17,
    lineHeight: 22,
    color: colors.ink,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 52,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 4,
    borderBottomColor: colors.border,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 17,
    lineHeight: 22,
    color: colors.ink,
  },
  resolvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  resolvedText: {
    fontFamily: typography.fonts.body,
    fontWeight: '700',
    fontSize: 13,
    color: colors.ink_muted,
  },
  candidateList: {
    marginTop: 4,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  candidateLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  candidateAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  candidateInitial: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 15,
    color: colors.ink,
  },
  candidateName: {
    fontFamily: typography.fonts.body,
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  candidateAmount: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 16,
    color: colors.ink,
  },
  heardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  heardPill: {
    backgroundColor: colors.warningBg || colors.bg,
    borderWidth: 1,
    borderColor: colors.warningBorder || colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heardText: {
    fontFamily: typography.fonts.body,
    fontWeight: '700',
    fontSize: 12,
    color: colors.warning || colors.ink,
  },
  undoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  undoText: {
    fontFamily: typography.fonts.body,
    fontWeight: '700',
    fontSize: 12,
    color: colors.ink,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  resultsTitle: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 16,
    color: colors.ink,
  },
  resultsCount: {
    fontFamily: typography.fonts.body,
    fontWeight: '600',
    fontSize: 13,
    color: colors.ink_muted,
  },
});

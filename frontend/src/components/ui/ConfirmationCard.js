import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, radius, spacing } from '../../theme/tokens';
import Button from './Button';
import AmountText from './AmountText';

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

/**
 * Stitch assistant confirmation and disambiguation card.
 * Embedded transaction card preview, visually distinct action buttons,
 * and vector icons for candidates.
 */
export default function ConfirmationCard({
  prompt,
  type = 'confirmation',
  onConfirm,
  candidates = [],
  onSelect,
  actionLabel = 'confirm',
  secondaryAction,
  onSecondaryAction,
  secondaryLabel = 'Cancel',
  targetTransaction = null,
  isHistorical = false,
}) {
  const isDestructive = actionLabel.toLowerCase().includes('delete');
  const catIcon = targetTransaction?.category_name
    ? (CATEGORY_ICONS[targetTransaction.category_name] || 'receipt')
    : 'receipt';

  return (
    <View testID={`${type}-card`} style={[styles.card.md]}>
      {/* Bot Header + Prompt */}
      <View style={styles.headerRow}>
        <View style={styles.botIconCircle}>
          <MaterialIcons name="smart-toy" size={16} color={colors.brand.default} />
        </View>
        <Text style={styles.promptText}>{prompt}</Text>
      </View>

      {/* Embedded Transaction Card (if target transaction data exists) */}
      {targetTransaction && (
        <View style={styles.embeddedTxnCard}>
          <View style={styles.embeddedLeft}>
            <View
              style={[
                styles.categoryIconCircle,
                isDestructive ? styles.categoryIconRed : styles.categoryIconBlue,
              ]}
            >
              <MaterialIcons
                name={catIcon}
                size={18}
                color={isDestructive ? colors.semantic.expense : colors.brand.default}
              />
            </View>
            <View style={styles.embeddedMeta}>
              <Text style={styles.embeddedCategory} numberOfLines={1}>
                {targetTransaction.category_name || 'Transaction'}
                {targetTransaction.description ? ` · ${targetTransaction.description}` : ''}
              </Text>
              <Text style={styles.embeddedDate}>
                {targetTransaction.txn_date || 'Today'}
              </Text>
            </View>
          </View>
          {targetTransaction.amount !== undefined && (
            <Text
              style={[
                styles.embeddedAmount,
                isDestructive && { color: colors.semantic.expense },
              ]}
            >
              ₹{Number(targetTransaction.amount).toLocaleString('en-IN')}
            </Text>
          )}
        </View>
      )}

      {/* Confirmation and Action buttons */}
      {(type === 'confirmation' || type === 'disambiguation') && (isHistorical || onConfirm || (secondaryAction && onSecondaryAction)) && (
        <View style={styles.buttonRow}>
          {isHistorical ? (
            <View testID="resolved-badge" style={styles.resolvedBadge}>
              <MaterialIcons name="done" size={14} color={colors.text.tertiary} style={{ marginRight: 4 }} />
              <Text style={styles.resolvedText}>Resolved</Text>
            </View>
          ) : (
            <>
              {onConfirm && (
                <Button
                  testID="confirm-action-button"
                  onPress={onConfirm}
                  title={
                    `✓ ${
                      actionLabel.toLowerCase().startsWith('confirm') ||
                      actionLabel.toLowerCase().startsWith('yes')
                        ? actionLabel
                        : `Confirm ${actionLabel}`
                    }`
                  }
                  variant={isDestructive ? 'destructive' : 'primary'}
                  size="sm"
                  icon={
                    <MaterialIcons
                      name={isDestructive ? 'delete' : 'check'}
                      size={16}
                      color="#FFFFFF"
                    />
                  }
                  style={{ flex: 1 }}
                />
              )}

              {secondaryAction && onSecondaryAction && (
                <Button
                  testID="secondary-action-button"
                  onPress={onSecondaryAction}
                  title={secondaryLabel}
                  variant="secondary"
                  size="sm"
                  style={{ flex: 1 }}
                />
              )}
            </>
          )}
        </View>
      )}

      {/* Disambiguation / candidate list */}
      {type === 'disambiguation' && (
        <View style={styles.candidatesList}>
          {isHistorical ? (
            <View testID="resolved-badge" style={[styles.resolvedBadge, { marginTop: spacing.xs }]}>
              <MaterialIcons name="done" size={14} color={colors.text.tertiary} style={{ marginRight: 4 }} />
              <Text style={styles.resolvedText}>Resolved</Text>
            </View>
          ) : (
            (candidates || []).slice(0, 5).map((cand, idx) => {
              const isString = typeof cand === 'string';
              const candId = isString ? `cand-${idx}` : (cand.id || `cand-${idx}`);
              const isContactCandidate = !isString && Boolean(cand.name && !cand.amount);

              return (
                <Pressable
                  key={candId}
                  testID={`disambig-candidate-${candId}`}
                  onPress={() => onSelect && onSelect(cand, idx)}
                  style={({ pressed }) => [
                    styles.candidateRow,
                    pressed && styles.candidateRowPressed,
                  ]}
                >
                  {isString ? (
                    <View style={styles.candidateInfo}>
                      <Text style={styles.candidateTitle}>{cand}</Text>
                    </View>
                  ) : isContactCandidate ? (
                    <View style={styles.contactRow}>
                      <View style={styles.candIconCircle}>
                        <MaterialIcons
                          name={cand.id === 'new' ? 'person-add' : 'person'}
                          size={16}
                          color={cand.id === 'new' ? colors.brand.default : colors.text.secondary}
                        />
                      </View>
                      <View style={styles.candidateInfo}>
                        <Text style={styles.candidateTitle}>
                          {cand.id === 'new' ? `Add new person "${cand.name}"` : cand.name}
                        </Text>
                        {cand.id !== 'new' && (
                          <Text style={styles.candidateSub}>Existing Contact</Text>
                        )}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.candidateInfo}>
                      <Text style={styles.candidateTitle}>
                        {cand.category_name || cand.category || 'Transaction'}
                      </Text>
                      <Text style={styles.candidateSub}>
                        {cand.txn_date || 'Recent'}
                        {cand.description ? ` · ${cand.description}` : ''}
                      </Text>
                    </View>
                  )}

                  {!isString && cand.amount !== undefined && (
                    <AmountText
                      amount={cand.amount}
                      type={cand.type === 'income' ? 'income' : 'expense'}
                      showSign={true}
                      size="sm"
                    />
                  )}
                </Pressable>
              );
            })
          )}
        </View>
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
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  botIconCircle: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.brand.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  promptText: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  embeddedTxnCard: {
    marginTop: spacing.md,
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  embeddedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  categoryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconRed: {
    backgroundColor: colors.semantic.expenseBg,
  },
  categoryIconBlue: {
    backgroundColor: colors.brand.tint,
  },
  embeddedMeta: {
    flex: 1,
  },
  embeddedCategory: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  embeddedDate: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  embeddedAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  buttonRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  candidatesList: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    minHeight: 44,
  },
  candidateRowPressed: {
    backgroundColor: colors.brand.tint,
    borderColor: colors.brand.tintBorder,
  },
  contactRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  candIconCircle: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  candidateInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  candidateTitle: {
    color: colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  candidateSub: {
    color: colors.text.secondary,
    fontSize: 11,
    marginTop: 2,
  },
  resolvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignSelf: 'flex-start',
  },
  resolvedText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
});

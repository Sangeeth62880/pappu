import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, shadows, spacing } from '../../theme/tokens';
import Button from './Button';
import AmountText from './AmountText';

/**
 * Modern light inline card for confirmation and disambiguation prompts.
 * Clear confirm-vs-cancel visual hierarchy.
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
}) {
  const isDestructive = actionLabel.toLowerCase().includes('delete');

  return (
    <View testID={`${type}-card`} style={[styles.card, shadows.md]}>
      {/* Prompt text */}
      <Text style={styles.promptText}>{prompt}</Text>

      {/* Confirmation buttons */}
      {type === 'confirmation' && (
        <View style={styles.buttonRow}>
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
            />
          )}

          {secondaryAction && onSecondaryAction && (
            <Button
              testID="secondary-action-button"
              onPress={onSecondaryAction}
              title={secondaryLabel}
              variant="secondary"
              size="sm"
            />
          )}
        </View>
      )}

      {/* Disambiguation / candidate list */}
      {(type === 'disambiguation' || candidates.length > 0) && (
        <View style={styles.candidatesList}>
          {candidates.map((cand) => {
            const isContactCandidate = Boolean(cand.name && !cand.amount);

            return (
              <Pressable
                key={cand.id}
                testID={`disambig-candidate-${cand.id}`}
                onPress={() => onSelect && onSelect(cand)}
                style={({ pressed }) => [
                  styles.candidateRow,
                  pressed && styles.candidateRowPressed,
                ]}
              >
                {isContactCandidate ? (
                  <View style={styles.contactRow}>
                    <Text style={styles.candidateIcon}>
                      {cand.id === 'new' ? '➕' : '👤'}
                    </Text>
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
                      {cand.category_name || 'Transaction'}
                    </Text>
                    <Text style={styles.candidateSub}>
                      {cand.txn_date}
                      {cand.description ? ` · ${cand.description}` : ''}
                    </Text>
                  </View>
                )}

                {cand.amount !== undefined && (
                  <AmountText
                    amount={cand.amount}
                    type={cand.type === 'income' ? 'income' : 'expense'}
                    showSign={true}
                    size="sm"
                  />
                )}
              </Pressable>
            );
          })}
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
    borderLeftWidth: 4,
    borderLeftColor: colors.brand.default,
    padding: spacing.lg,
  },
  promptText: {
    color: colors.text.primary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  buttonRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    borderRadius: radius.md,
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
  },
  candidateIcon: {
    fontSize: 15,
    marginRight: spacing.sm,
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
});

import React from 'react';
import { View, Text, Pressable } from 'react-native';

/**
 * Inline card for confirmation and disambiguation prompts.
 * Visually distinct from normal conversation messages.
 *
 * Supports:
 * 1. Transaction edit/delete confirmation
 * 2. Person/contact confirmation ("Did you mean Arjun Nair?")
 * 3. Person/transaction disambiguation candidates
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
  return (
    <View
      testID={`${type}-card`}
      className="my-2 bg-ink-navy-light border-l-[3px] border-l-warm-brass rounded-r-xl p-4 shadow-sm"
    >
      {/* Prompt text */}
      <Text className="text-bone font-sans text-sm leading-5">
        {prompt}
      </Text>

      {/* Confirmation buttons (single confirmation mode) */}
      {type === 'confirmation' && (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {onConfirm && (
            <Pressable
              testID="confirm-action-button"
              onPress={onConfirm}
              className="bg-warm-brass py-2 px-4 rounded-lg self-start active:bg-warm-brass-dark"
            >
              <Text className="text-ink-navy font-sans text-xs font-semibold uppercase tracking-wide">
                ✓ {actionLabel.toLowerCase().startsWith('confirm') || actionLabel.toLowerCase().startsWith('yes')
                  ? actionLabel
                  : `Confirm ${actionLabel}`}
              </Text>
            </Pressable>
          )}

          {secondaryAction && onSecondaryAction && (
            <Pressable
              testID="secondary-action-button"
              onPress={onSecondaryAction}
              className="border border-bone-darker/40 py-2 px-3 rounded-lg self-start active:bg-ink-navy-lighter"
            >
              <Text className="text-bone-darker font-sans text-xs font-medium">
                {secondaryLabel}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Disambiguation / candidate list */}
      {(type === 'disambiguation' || candidates.length > 0) && (
        <View className="mt-3 space-y-1.5">
          {candidates.map((cand) => {
            const isContactCandidate = Boolean(cand.name && !cand.amount);

            return (
              <Pressable
                key={cand.id}
                testID={`disambig-candidate-${cand.id}`}
                onPress={() => onSelect && onSelect(cand)}
                className="flex-row items-center justify-between py-2 px-3 my-0.5 rounded-lg border border-ink-navy-lighter bg-ink-navy active:bg-ink-navy-lighter"
              >
                {isContactCandidate ? (
                  <View className="flex-1 flex-row items-center">
                    <Text className="text-base mr-2">
                      {cand.id === 'new' ? '➕' : '👤'}
                    </Text>
                    <View className="flex-1">
                      <Text className="text-bone font-sans text-xs font-semibold">
                        {cand.id === 'new' ? `Add new person "${cand.name}"` : cand.name}
                      </Text>
                      {cand.id !== 'new' && (
                        <Text className="text-bone-darker font-sans text-[10px]">
                          Existing Contact
                        </Text>
                      )}
                    </View>
                  </View>
                ) : (
                  <View className="flex-1 pr-2">
                    <Text className="text-bone font-sans text-xs font-medium">
                      {cand.category_name || 'Transaction'}
                    </Text>
                    <Text className="text-bone-darker font-sans text-[10px]">
                      {cand.txn_date}{cand.description ? ` · ${cand.description}` : ''}
                    </Text>
                  </View>
                )}

                {cand.amount !== undefined && (
                  <Text
                    className={`font-serif text-xs font-bold ${
                      cand.type === 'income' ? 'text-banana-leaf' : 'text-clay-rust'
                    }`}
                    style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
                  >
                    ₹{Number(cand.amount).toFixed(2)}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

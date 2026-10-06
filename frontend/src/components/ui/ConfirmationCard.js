import React from 'react';
import { View, Text, Pressable } from 'react-native';

/**
 * Inline bordered card for confirmation and disambiguation prompts.
 * Visually distinct from normal conversation messages.
 *
 * Confirmation mode:
 *   prompt      — string, the confirmation question
 *   onConfirm   — function, called when user confirms
 *   actionLabel — string, e.g. "delete", "edit"
 *
 * Disambiguation mode:
 *   prompt      — string, the disambiguation question
 *   candidates  — array of { id, amount, category_name, txn_date, description }
 *   onSelect    — function(candidate), called when user picks one
 *   actionLabel — string
 */
export default function ConfirmationCard({
  prompt,
  type = 'confirmation',
  onConfirm,
  candidates = [],
  onSelect,
  actionLabel = 'confirm',
}) {
  return (
    <View
      testID={`${type}-card`}
      className="my-2 bg-ink-navy-light border-l-[3px] border-l-warm-brass rounded-r-xl p-4"
    >
      {/* Prompt text */}
      <Text className="text-bone font-sans text-sm leading-5">
        {prompt}
      </Text>

      {/* Confirmation button */}
      {type === 'confirmation' && onConfirm && (
        <Pressable
          testID="confirm-action-button"
          onPress={onConfirm}
          className="mt-3 bg-warm-brass py-2 px-4 rounded-lg self-start active:bg-warm-brass-dark"
        >
          <Text className="text-ink-navy font-sans text-xs font-semibold uppercase tracking-wide">
            ✓ Confirm {actionLabel}
          </Text>
        </Pressable>
      )}

      {/* Disambiguation candidates */}
      {type === 'disambiguation' && candidates.length > 0 && (
        <View className="mt-3">
          {candidates.map((cand) => (
            <Pressable
              key={cand.id}
              testID={`disambig-candidate-${cand.id}`}
              onPress={() => onSelect && onSelect(cand)}
              className="flex-row items-center justify-between py-2.5 border-b border-ink-navy-lighter active:bg-ink-navy-lighter rounded"
            >
              <View className="flex-1 pr-2">
                <Text className="text-bone font-sans text-sm font-medium">
                  {cand.category_name || 'Transaction'}
                </Text>
                <Text className="text-bone-darker font-sans text-xs">
                  {cand.txn_date}{cand.description ? ` · ${cand.description}` : ''}
                </Text>
              </View>
              <Text
                className={`font-serif text-sm font-bold ${
                  cand.type === 'income' ? 'text-banana-leaf' : 'text-clay-rust'
                }`}
                style={{ fontFamily: 'Libre Baskerville, Georgia, serif' }}
              >
                ₹{Number(cand.amount).toFixed(2)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

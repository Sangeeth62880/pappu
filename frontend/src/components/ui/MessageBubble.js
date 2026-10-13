import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, shadows, spacing } from '../../theme/tokens';

/**
 * Modern light message bubble.
 * User: Solid brand blue with white text.
 * Assistant: Pure white card with soft shadow and slate navy text.
 *
 * Props:
 *   text        — string, the message content
 *   sender      — 'user' | 'pappu'
 *   isError     — boolean, tints the bubble red
 *   hasAudio    — boolean, indicates synthesized audio is available
 *   onPlayAudio — function, triggered to play/replay speech
 *   testID      — string (optional)
 */
export default function MessageBubble({
  text,
  sender = 'pappu',
  isError = false,
  hasAudio = false,
  onPlayAudio = null,
  testID,
}) {
  const isUser = sender === 'user';

  return (
    <View
      testID={testID}
      style={[
        styles.bubble,
        isUser
          ? styles.userBubble
          : isError
          ? styles.errorBubble
          : styles.assistantBubble,
      ]}
    >
      {isUser ? (
        <Text style={styles.userText}>{text}</Text>
      ) : (
        <View style={styles.contentRow}>
          <Text
            style={[
              styles.assistantText,
              isError && styles.errorText,
            ]}
          >
            {text}
          </Text>

          {!isError && onPlayAudio && (
            <Pressable
              testID={`tts-replay-button-${testID || 'msg'}`}
              onPress={onPlayAudio}
              hitSlop={8}
              style={({ pressed }) => [
                styles.audioBtn,
                pressed && styles.audioBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Replay audio"
            >
              <Text style={styles.audioIcon}>🔊</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    marginVertical: 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    maxWidth: '84%',
    borderRadius: radius['2xl'],
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brand.default,
    borderBottomRightRadius: radius.xs,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.xs,
    ...shadows.sm,
  },
  errorBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.semantic.expenseBg,
    borderWidth: 1,
    borderColor: colors.semantic.expenseBorder,
    borderBottomLeftRadius: radius.xs,
  },
  userText: {
    color: colors.text.inverse,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  assistantText: {
    color: colors.text.primary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    flex: 1,
  },
  errorText: {
    color: colors.semantic.expense,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  audioBtn: {
    padding: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
  },
  audioBtnPressed: {
    backgroundColor: colors.brand.tint,
  },
  audioIcon: {
    fontSize: 13,
  },
});

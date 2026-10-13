import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, radius, shadows, spacing } from '../../theme/tokens';

/**
 * Stitch-inspired message bubble.
 * User: Royal brand blue with white text, double-check indicator, timestamp.
 * Assistant: Pure white card with subtle shadow, slate text, replay button, timestamp.
 */
export default function MessageBubble({
  text,
  sender = 'pappu',
  isError = false,
  hasAudio = false,
  onPlayAudio = null,
  timestamp = null,
  testID,
}) {
  const isUser = sender === 'user';
  const displayTime = timestamp || 'Just now';

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}
    >
      <View
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
                <MaterialIcons name="volume-up" size={16} color={colors.brand.default} />
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* Meta timestamp & read status row */}
      <View
        style={[
          styles.metaRow,
          isUser ? styles.userMetaRow : styles.assistantMetaRow,
        ]}
      >
        {isUser && (
          <MaterialIcons
            name="done-all"
            size={13}
            color={colors.text.tertiary}
            style={styles.checkIcon}
          />
        )}
        <Text style={styles.timestampText}>{displayTime}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    maxWidth: '85%',
  },
  userContainer: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius['2xl'],
  },
  userBubble: {
    backgroundColor: colors.brand.default,
    borderBottomRightRadius: radius.xs,
    shadowColor: colors.brand.default,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.xs,
    ...shadows.sm,
  },
  errorBubble: {
    backgroundColor: colors.semantic.expenseBg,
    borderWidth: 1,
    borderColor: colors.semantic.expenseBorder,
    borderBottomLeftRadius: radius.xs,
  },
  userText: {
    color: colors.text.inverse,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '400',
  },
  assistantText: {
    color: colors.text.primary,
    fontSize: 14,
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
    backgroundColor: colors.brand.tint,
  },
  audioBtnPressed: {
    backgroundColor: colors.brand.tintBorder,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    paddingHorizontal: 4,
  },
  userMetaRow: {
    justifyContent: 'flex-end',
  },
  assistantMetaRow: {
    justifyContent: 'flex-start',
  },
  checkIcon: {
    marginRight: 3,
  },
  timestampText: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
});

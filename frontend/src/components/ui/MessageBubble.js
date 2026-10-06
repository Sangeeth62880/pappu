import React from 'react';
import { View, Text, Pressable } from 'react-native';

/**
 * Conversation message bubble — restrained shape, no chat-tail decorations.
 * Supports audio replay button for synthesized spoken responses.
 *
 * Props:
 *   text        — string, the message content
 *   sender      — 'user' | 'pappu'
 *   isError     — boolean, tints the bubble clay-rust
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

  const bubbleClasses = isUser
    ? 'bg-warm-brass self-end rounded-2xl rounded-br-sm'
    : isError
    ? 'bg-clay-rust/15 border border-clay-rust/30 self-start rounded-2xl rounded-bl-sm'
    : 'bg-ink-navy-light self-start rounded-2xl rounded-bl-sm';

  const textClasses = isUser
    ? 'text-ink-navy font-sans text-sm font-medium'
    : isError
    ? 'text-clay-rust-light font-sans text-sm'
    : 'text-bone font-sans text-sm leading-5';

  return (
    <View
      testID={testID}
      className={`my-1.5 px-4 py-2.5 max-w-[85%] ${bubbleClasses}`}
    >
      {isUser ? (
        <Text className={textClasses}>
          {text}
        </Text>
      ) : (
        <View className="flex-row items-center justify-between gap-2">
          <Text className={`flex-1 ${textClasses}`}>
            {text}
          </Text>

          {!isError && onPlayAudio && (
            <Pressable
              testID={`tts-replay-button-${testID || 'msg'}`}
              onPress={onPlayAudio}
              hitSlop={8}
              className="p-1 rounded-full bg-ink-navy-lighter active:bg-warm-brass/20"
            >
              <Text className="text-[12px] text-warm-brass">🔊</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

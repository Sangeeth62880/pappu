import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  synthesizeSpeech,
  undoTransaction,
  fetchChatHistory,
  clearChatHistory,
  sendAssistantMessage,
  answerPending,
  fetchActivePending,
} from '../api/client';
import { generateUUID } from '../utils/uuid';
import { playAudioBase64 } from '../utils/audioPlayer';
import { colors, radius, shadows, spacing } from '../theme/tokens';
import MicButton from './MicButton';
import MessageBubble from './ui/MessageBubble';
import ConfirmationCard from './ui/ConfirmationCard';
import QueryDataCard from './ui/QueryDataCard';
import Skeleton from './ui/Skeleton';

const DIALECTS = ['Manglish', 'Malayalam', 'English'];

const SUGGESTED_PROMPTS = [
  'Sent 500 to Pooja',
  'ഇന്നലത്തെ food ചെലവ് എത്ര?',
  'ചായ 20 രൂപ',
  'Spent 250 on lunch today',
];

function formatTime(date = new Date()) {
  try {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    return 'Just now';
  }
}

function formatDateHeader(date = new Date()) {
  try {
    return `Today, ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  } catch (e) {
    return 'Today, 24 Oct';
  }
}

export default function ConversationLog({
  token,
  onTransactionMutated,
  initialMessages = [],
  messages: externalMessages = null,
  setMessages: externalSetMessages = null,
  onClearMessages = null,
  assistantV2 = true,
}) {
  const [inputText, setInputText] = useState('');
  const textRef = useRef(inputText);
  textRef.current = inputText;
  const scrollViewRef = useRef(null);

  const [dialectIndex, setDialectIndex] = useState(0);
  const activeDialect = DIALECTS[dialectIndex];

  // If parent controls state (for persistent history across tabs), use it; else fallback to local state
  const [localMessages, setLocalMessages] = useState(initialMessages);
  const messages = externalMessages !== null ? externalMessages : localMessages;
  const setMessages = externalSetMessages !== null ? externalSetMessages : setLocalMessages;

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(
    Boolean(token) && (!messages || messages.length === 0)
  );
  const [activePending, setActivePending] = useState(null);
  const [undoneIds, setUndoneIds] = useState({});

  // Fetch active pending action from server on mount
  useEffect(() => {
    let isMounted = true;
    if (token && typeof fetchActivePending === 'function') {
      try {
        const promise = fetchActivePending(token);
        if (promise && typeof promise.then === 'function') {
          promise
            .then((pending) => {
              if (!isMounted) return;
              if (pending && pending.id) {
                if (pending.expires_at) {
                  const expTime = new Date(pending.expires_at).getTime();
                  if (expTime > Date.now()) {
                    setActivePending(pending);
                  } else {
                    setActivePending(null);
                  }
                } else {
                  setActivePending(pending);
                }
              } else {
                setActivePending(null);
              }
            })
            .catch(() => {});
        }
      } catch (e) {}
    }
    return () => {
      isMounted = false;
    };
  }, [token]);

  useEffect(() => {
    let isMounted = true;
    if (token && typeof fetchChatHistory === 'function') {
      try {
        const promise = fetchChatHistory(token, { limit: 50, offset: 0 });
        if (promise && typeof promise.then === 'function') {
          promise
            .then((res) => {
              if (!isMounted || !res?.messages) return;
              if (res.messages.length > 0) {
                const mapped = res.messages.map((m) => {
                  const isUser = m.role === 'user';
                  const payload = typeof m.payload === 'object' && m.payload !== null ? m.payload : {};
                  return {
                    id: String(m.id),
                    sender: isUser ? 'user' : 'pappu',
                    text: m.text,
                    timestamp: m.created_at ? formatTime(new Date(m.created_at)) : 'Just now',
                    ...payload,
                    isHistorical: true,
                  };
                });
                setMessages(mapped);
              }
            })
            .catch((err) => {
              console.warn('Failed to load chat history:', err);
            })
            .finally(() => {
              if (isMounted) setHistoryLoading(false);
            });
        } else {
          setHistoryLoading(false);
        }
      } catch (err) {
        setHistoryLoading(false);
      }
    } else {
      setHistoryLoading(false);
    }
    return () => {
      isMounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [messages, loading]);

  const speakResponse = async (text, language = 'en') => {
    if (!token || !text) return null;
    try {
      const targetLang = (language === 'ml' || language === 'malayalam') ? 'ml-IN' : 'en-IN';
      const ttsRes = await synthesizeSpeech(token, text, targetLang);
      if (ttsRes?.audio_base64) {
        await playAudioBase64(ttsRes.audio_base64);
        return ttsRes.audio_base64;
      }
    } catch (err) {
      console.warn('TTS synthesis warning:', err);
    }
    return null;
  };

  const handleCycleDialect = () => {
    setDialectIndex((prev) => (prev + 1) % DIALECTS.length);
  };

  const handleSendMessage = async (explicitText = null, options = {}) => {
    const raw = typeof explicitText === 'string' && explicitText.length > 0 ? explicitText : textRef.current;
    const text = (raw || '').trim();
    if (!text || loading) return;

    setInputText('');
    textRef.current = '';
    const nowTime = formatTime();
    const clientMsgId = options.client_msg_id || generateUUID();
    const userMsgId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const userMsg = {
      id: userMsgId,
      sender: 'user',
      text,
      client_msg_id: clientMsgId,
      timestamp: nowTime,
    };
    setMessages((prev) => [...prev, userMsg]);

    if (!token) {
      setMessages((prev) => [
        ...prev,
        {
          id: `pappu-${Date.now()}`,
          sender: 'pappu',
          text: 'Error: You must be signed in to interact with Pappu.',
          isError: true,
          timestamp: formatTime(),
        },
      ]);
      return;
    }

    try {
      setLoading(true);
      const res = await sendAssistantMessage(token, {
        text,
        input: options.input || 'text',
        client_msg_id: clientMsgId,
      });

      const replyText = res.display_text || res.reply_text || res.spoken_text || 'Done';
      const spokenText = res.spoken_text || '';
      const msgId = `pappu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      if (res.pending && res.pending.id) {
        setActivePending(res.pending);
      } else {
        setActivePending(null);
      }

      const pappuMsg = {
        id: msgId,
        sender: 'pappu',
        text: replyText,
        spoken_text: spokenText,
        results: res.results || [],
        pending: res.pending || null,
        client_msg_id: clientMsgId,
        timestamp: formatTime(),
      };

      setMessages((prev) => [...prev, pappuMsg]);

      if (spokenText) {
        const lang = activeDialect === 'Malayalam' ? 'ml' : 'en';
        speakResponse(spokenText, lang).then((audioBase64) => {
          if (audioBase64) {
            setMessages((prev) =>
              prev.map((m) => (m.id === msgId ? { ...m, audioBase64 } : m))
            );
          }
        });
      }

      if (res.changed && onTransactionMutated) {
        onTransactionMutated();
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `pappu-err-${Date.now()}`,
          sender: 'pappu',
          text: `Error: ${err.message || 'Network request failed'}`,
          isError: true,
          canRetry: true,
          failedText: text,
          client_msg_id: clientMsgId,
          timestamp: formatTime(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };


  const handleAnswerPending = async (pendingId, answer, index = null) => {
    if (!token || !pendingId) return;
    try {
      setLoading(true);
      const res = await answerPending(token, pendingId, answer, index);
      const replyText = res.display_text || res.reply_text || res.spoken_text || 'Action confirmed.';
      const spokenText = res.spoken_text || '';
      const msgId = `pappu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      if (res.pending && res.pending.id) {
        setActivePending(res.pending);
      } else {
        setActivePending(null);
      }

      const pappuMsg = {
        id: msgId,
        sender: 'pappu',
        text: replyText,
        spoken_text: spokenText,
        results: res.results || [],
        pending: res.pending || null,
        timestamp: formatTime(),
      };

      setMessages((prev) => [...prev, pappuMsg]);

      if (spokenText) {
        const lang = activeDialect === 'Malayalam' ? 'ml' : 'en';
        speakResponse(spokenText, lang).then((audioBase64) => {
          if (audioBase64) {
            setMessages((prev) =>
              prev.map((m) => (m.id === msgId ? { ...m, audioBase64 } : m))
            );
          }
        });
      }

      if (res.changed && onTransactionMutated) {
        onTransactionMutated();
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `pappu-err-${Date.now()}`,
          sender: 'pappu',
          text: `Failed to answer: ${err.message || 'Unknown error'}`,
          isError: true,
          timestamp: formatTime(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };


  const handleUndo = async (msgId) => {
    if (!token) return;
    try {
      await undoTransaction(token);
      setUndoneIds((prev) => ({ ...prev, [msgId]: true }));
      if (onTransactionMutated) {
        onTransactionMutated();
      }
    } catch (err) {
      console.warn('Undo error:', err);
    }
  };

  const handleClearChat = async () => {
    if (token && typeof clearChatHistory === 'function') {
      try {
        const p = clearChatHistory(token);
        if (p && typeof p.then === 'function') {
          await p;
        }
      } catch (e) {
        console.warn('Failed to clear backend chat history:', e);
      }
    }
    if (onClearMessages) {
      onClearMessages();
    } else {
      setMessages([]);
    }
    setActivePending(null);
  };

  const renderPendingCard = (pending, isHistorical = false, defaultPrompt = '') => {
    if (!pending) return null;
    const promptText = pending.question || pending.summary || defaultPrompt;
    const kind = pending.kind || pending.action_type;

    // Disambiguation branch
    const isDisambiguate =
      kind === 'disambiguate' ||
      (!kind && pending.candidates && pending.candidates.length > 1) ||
      (kind !== 'confirm' && kind !== 'contact_confirm' && pending.candidates && pending.candidates.length > 1);

    if (isDisambiguate) {
      return (
        <ConfirmationCard
          prompt={promptText}
          type="disambiguation"
          candidates={pending.candidates}
          isHistorical={isHistorical}
          onSelect={
            isHistorical
              ? null
              : (cand, idx) =>
                  handleAnswerPending(
                    pending.id,
                    typeof cand === 'string' ? cand : (cand.id || cand.name || 'choose'),
                    idx
                  )
          }
          actionLabel="Yes"
          onConfirm={isHistorical ? null : () => handleAnswerPending(pending.id, 'yes', 0)}
          secondaryAction={!isHistorical}
          secondaryLabel="No"
          onSecondaryAction={() => handleAnswerPending(pending.id, 'no')}
        />
      );
    }

    if (kind === 'contact_confirm') {
      const suggestedContact = pending.candidates?.[0] || pending.target_transaction;
      const contactName = typeof suggestedContact === 'object' && suggestedContact !== null
        ? (suggestedContact.name || 'contact')
        : 'contact';

      return (
        <ConfirmationCard
          prompt={promptText}
          type="confirmation"
          isHistorical={isHistorical}
          actionLabel={isHistorical ? 'Resolved' : (contactName && contactName !== 'contact' ? `Yes, ${contactName}` : 'Yes')}
          onConfirm={
            isHistorical
              ? null
              : () => handleAnswerPending(pending.id, 'yes', 0)
          }
          secondaryAction={!isHistorical}
          secondaryLabel="No"
          onSecondaryAction={() => handleAnswerPending(pending.id, 'no')}
        />
      );
    }

    // Default confirmation card (Delete red, Cancel secondary, or generic confirm)
    const isDelete =
      kind === 'delete' ||
      (promptText || '').toLowerCase().includes('delete');
    const targetTxn =
      pending.target_transaction ||
      (pending.candidates && pending.candidates.length === 1 ? pending.candidates[0] : null);

    return (
      <ConfirmationCard
        prompt={promptText}
        type="confirmation"
        isHistorical={isHistorical}
        targetTransaction={targetTxn}
        onConfirm={isHistorical ? null : () => handleAnswerPending(pending.id, 'confirm')}
        actionLabel={isHistorical ? 'Resolved' : (isDelete ? 'delete' : (kind || 'confirm'))}
        secondaryAction={!isHistorical}
        secondaryLabel="Cancel"
        onSecondaryAction={() => handleAnswerPending(pending.id, 'cancel')}
      />
    );
  };

  const renderMessage = (msg) => {
    const isUser = msg.sender === 'user';
    const isUndone = Boolean(undoneIds[msg.id]);

    // 1. User Message Row
    if (isUser) {
      return (
        <View key={msg.id} testID={`message-${msg.id}`} style={styles.userMessageRow}>
          <View style={styles.userBubble}>
            <Text style={styles.userBubbleText} selectTextOnFocus={true}>
              {msg.text}
            </Text>
          </View>
          <View style={styles.userMetaRow}>
            <MaterialIcons name="done-all" size={13} color={colors.text.tertiary} style={{ marginRight: 3 }} />
            <Text style={styles.metaTimeText}>{msg.timestamp || 'Just now'}</Text>
          </View>
        </View>
      );
    }

    // 2. Assistant Message with Bot Avatar
    const hasV2Pending = Boolean(msg.pending && msg.pending.id);
    const isPendingHistorical = Boolean(msg.isHistorical || !activePending || activePending.id !== msg.pending?.id);

    // Check for add result in v2 results or v1 isAddSuccess
    const addResultItem = Array.isArray(msg.results)
      ? msg.results.find((r) => r && (r.kind === 'added' || r.action === 'add'))
      : null;
    const isAddCard = Boolean(msg.isAddSuccess || addResultItem);
    const heardAmount = addResultItem?.heard_amount ?? addResultItem?.amount ?? null;

    // Check for query results in v2 results
    const queryResultItems = Array.isArray(msg.results)
      ? msg.results.filter((r) => r && (r.kind === 'balances' || r.kind === 'sum' || r.kind === 'list' || r.kind === 'compare' || r.kind === 'query'))
      : [];

    return (
      <View key={msg.id} testID={`message-${msg.id}`} style={styles.assistantMessageRow}>
        <View style={styles.assistantAvatarCircle}>
          <MaterialIcons name="smart-toy" size={16} color={colors.brand.default} />
        </View>

        <View style={styles.assistantContentCol}>
          {/* v2 Pending Card */}
          {hasV2Pending ? (
            renderPendingCard(msg.pending, isPendingHistorical, msg.text)

          ) : isAddCard ? (
            /* Add Result Card with heard amount & Undo button */
            <View style={[styles.assistantCard, shadows.sm]} testID="add-result-card">
              <View style={styles.addSuccessRow}>
                <View style={styles.checkCircleBadge}>
                  <MaterialIcons name="check" size={13} color={colors.semantic.income} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.assistantCardText}>{msg.text}</Text>
                  {heardAmount !== null && heardAmount !== undefined && (
                    <Text style={styles.heardAmountText} testID="heard-amount-text">
                      Amount heard: ₹{Number(heardAmount).toLocaleString('en-IN')}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  testID="undo-button"
                  onPress={() => handleUndo(msg.id)}
                  disabled={isUndone}
                  style={[styles.undoPill, isUndone && styles.undoPillDisabled]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.undoPillText, isUndone && styles.undoPillTextDisabled]}>
                    {isUndone ? 'Undone' : 'Undo'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : msg.isError ? (
            /* Error bubble with retry button on network failure */
            <View style={styles.errorContainer}>
              <View style={styles.errorRow}>
                <MaterialIcons name="error-outline" size={16} color={colors.semantic.expense} style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{msg.text}</Text>
              </View>
              {msg.canRetry && (
                <TouchableOpacity
                  testID="retry-button"
                  onPress={() => handleSendMessage(msg.failedText, { client_msg_id: msg.client_msg_id })}
                  style={styles.retryBtn}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="refresh" size={14} color={colors.brand.default} style={{ marginRight: 4 }} />
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* Standard Assistant Bubble */
            <View style={styles.standardBubbleWrapper}>
              <MessageBubble
                text={msg.text}
                sender={msg.sender}
                isError={msg.isError}
                hasAudio={Boolean(msg.audioBase64)}
                onPlayAudio={
                  !msg.isError
                    ? () => {
                        if (msg.audioBase64) {
                          playAudioBase64(msg.audioBase64);
                        } else {
                          speakResponse(msg.spoken_text || msg.text, msg.language || 'en');
                        }
                      }
                    : null
                }
              />
            </View>
          )}

          {/* v2 Query result cards (balances, totals, lists) */}
          {queryResultItems.map((qItem, qIdx) => (
            <QueryDataCard key={`query-${qIdx}`} result={qItem} />
          ))}

          {/* Legacy Query Data Card */}
          {msg.queryResult && <QueryDataCard result={msg.queryResult} />}

          {/* Assistant Timestamp */}
          <Text style={styles.assistantMetaTime}>{msg.timestamp || 'Just now'}</Text>
        </View>
      </View>
    );
  };

  return (
    <View testID="conversation-container" style={styles.screenContainer}>
      {/* ── 1. Top Assistant Context & Status Bar (stitch/assistant.html) ── */}
      <View style={styles.contextStatusBar}>
        <View style={styles.syncStatusLeft}>
          <View style={styles.pulsingDot} />
          <Text style={styles.syncStatusText}>Voice Sync Active</Text>
        </View>

        <View style={styles.contextStatusRight}>
          <TouchableOpacity
            onPress={handleCycleDialect}
            style={styles.dialectToggleBtn}
            activeOpacity={0.7}
            accessibilityLabel="Switch dialect"
          >
            <Text style={styles.dialectLabel}>Tap to switch dialect: </Text>
            <Text style={styles.dialectValue}>{activeDialect}</Text>
          </TouchableOpacity>

          {loading && (
            <ActivityIndicator
              testID="conversation-loading"
              size="small"
              color={colors.brand.default}
              style={{ marginLeft: 8 }}
            />
          )}

          {messages.length > 0 && (
            <TouchableOpacity
              testID="clear-chat-button"
              onPress={handleClearChat}
              style={styles.clearChatBtn}
              activeOpacity={0.7}
              accessibilityLabel="Clear chat messages"
            >
              <Text style={styles.clearChatText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── 2. Message Stream ── */}
      <ScrollView
        ref={scrollViewRef}
        testID="conversation-messages"
        style={styles.messageScrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {/* Date Divider Chip */}
        <View style={styles.dateDividerRow}>
          <View style={styles.dateChip}>
            <Text style={styles.dateChipText}>{formatDateHeader()}</Text>
          </View>
        </View>

        {historyLoading && messages.length === 0 ? (
          <View testID="chat-skeleton-container" style={styles.skeletonContainer}>
            <View style={styles.skeletonBubbleRight}>
              <Skeleton width={180} height={42} borderRadius={radius.lg} />
            </View>
            <View style={styles.skeletonBubbleLeft}>
              <Skeleton width={32} height={32} borderRadius={16} style={{ marginRight: 8 }} />
              <Skeleton width={220} height={56} borderRadius={radius.lg} />
            </View>
            <View style={styles.skeletonBubbleRight}>
              <Skeleton width={140} height={42} borderRadius={radius.lg} />
            </View>
          </View>
        ) : messages.length === 0 && !activePending ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyBotBadge}>
              <MaterialIcons name="smart-toy" size={28} color={colors.brand.default} />
            </View>
            <Text style={styles.emptyTitle}>How can Pappu help today?</Text>
            <Text testID="empty-conversation-text" style={styles.emptySub}>
              Tap the microphone to speak Malayalam or English, or tap any suggestion below.
            </Text>
          </View>
        ) : (
          messages.map(renderMessage)
        )}

        {/* Live pending card from server if not already rendered inside a message */}
        {activePending && !messages.some((m) => m.pending?.id === activePending.id) && (
          <View testID="live-pending-container" style={styles.assistantMessageRow}>
            <View style={styles.assistantAvatarCircle}>
              <MaterialIcons name="smart-toy" size={16} color={colors.brand.default} />
            </View>
            <View style={styles.assistantContentCol}>
              {renderPendingCard(activePending, false, activePending.summary)}
              <Text style={styles.assistantMetaTime}>Action pending</Text>
            </View>
          </View>
        )}

        {/* 3. Thinking / Pulse State */}
        {loading && (
          <View style={styles.thinkingRow}>
            <View style={styles.assistantAvatarCircle}>
              <MaterialIcons name="smart-toy" size={16} color={colors.brand.default} />
            </View>
            <View style={[styles.thinkingBubble, shadows.sm]}>
              <View style={[styles.bouncingDot, styles.dot1]} />
              <View style={[styles.bouncingDot, styles.dot2]} />
              <View style={[styles.bouncingDot, styles.dot3]} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── 3. Sticky Bottom Composer Area (stitch/assistant.html) ── */}
      <View style={styles.bottomComposerArea}>
        {/* Quick Voice Prompt Suggestions Chips Carousel */}
        <View style={styles.suggestionsHeaderRow}>
          <MaterialIcons name="tips-and-updates" size={14} color={colors.text.tertiary} style={{ marginRight: 4 }} />
          <Text style={styles.suggestionsTitle} numberOfLines={1}>
            Try voice shortcuts:
          </Text>
        </View>

        <ScrollView
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionsScrollContent}
          style={styles.suggestionsScrollView}
        >
          {SUGGESTED_PROMPTS.map((prompt, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => handleSendMessage(prompt)}
              style={styles.promptChip}
              activeOpacity={0.7}
            >
              <Text style={styles.promptChipText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Composer Row */}
        <View style={[styles.composerContainer, shadows.md]}>
          <View style={styles.keyboardIconBtn}>
            <MaterialIcons name="keyboard" size={20} color={colors.text.tertiary} />
          </View>

          <TextInput
            testID="conversation-input"
            value={inputText}
            onChangeText={(val) => {
              setInputText(val);
              textRef.current = val;
            }}
            placeholder="Ask or tell Pappu anything..."
            placeholderTextColor={colors.text.muted}
            style={styles.textInput}
            onSubmitEditing={() => handleSendMessage(textRef.current)}
          />

          {inputText.trim().length > 0 && (
            <TouchableOpacity
              testID="conversation-send-button"
              onPress={() => handleSendMessage(textRef.current)}
              disabled={loading}
              style={styles.sendButton}
              activeOpacity={0.8}
            >
              <MaterialIcons name="arrow-upward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          )}

          <View style={styles.micWrapper}>
            <View style={styles.micPulseRing} pointerEvents="none" />
            <MicButton
              token={token}
              onTranscribed={(transcript) => handleSendMessage(transcript, { input: 'voice' })}
              disabled={loading}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  contextStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  syncStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.semantic.income,
  },
  syncStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  contextStatusRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dialectToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dialectLabel: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  dialectValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.default,
  },
  clearChatBtn: {
    marginLeft: spacing.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearChatText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  messageScrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 24,
  },
  dateDividerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  dateChip: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: spacing.xl,
  },
  emptyBotBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.brand.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  userMessageRow: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    marginVertical: 4,
    alignItems: 'flex-end',
  },
  userBubble: {
    backgroundColor: colors.brand.default,
    borderRadius: radius['2xl'],
    borderBottomRightRadius: radius.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: colors.brand.default,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  userBubbleText: {
    color: colors.text.inverse,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '400',
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    paddingRight: 4,
  },
  metaTimeText: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
  assistantMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    maxWidth: '92%',
    marginVertical: 6,
  },
  assistantAvatarCircle: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.brand.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  assistantContentCol: {
    flex: 1,
  },
  standardBubbleWrapper: {
    width: '100%',
  },
  assistantCard: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    borderBottomLeftRadius: radius.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addSuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  checkCircleBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.semantic.incomeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantCardText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text.primary,
    flex: 1,
  },
  heardAmountText: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  undoPill: {
    backgroundColor: colors.brand.tint,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  undoPillDisabled: {
    opacity: 0.5,
  },
  undoPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.brand.default,
  },
  undoPillTextDisabled: {
    color: colors.text.tertiary,
  },
  errorContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    borderBottomLeftRadius: radius.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    color: colors.semantic.expense,
    flex: 1,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.brand.tint,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
  retryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.brand.default,
  },
  assistantMetaTime: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: 3,
    paddingLeft: 4,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: 6,
  },
  thinkingBubble: {
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius['2xl'],
    borderBottomLeftRadius: radius.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bouncingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand.default,
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.7 },
  dot3: { opacity: 1 },
  bottomComposerArea: {
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.md,
    paddingBottom: 96,
    paddingTop: spacing.xs,
  },
  suggestionsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  suggestionsTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  suggestionsScrollView: {
    marginBottom: spacing.sm,
  },
  suggestionsScrollContent: {
    gap: 6,
    paddingHorizontal: 2,
  },
  promptChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  promptChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  keyboardIconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand.default,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  micWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micPulseRing: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brand.tint,
    opacity: 0.6,
  },
  skeletonContainer: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  skeletonBubbleRight: {
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  skeletonBubbleLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
});

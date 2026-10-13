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
  parseIntent,
  routeIntent,
  confirmAction,
  synthesizeSpeech,
  undoTransaction,
  fetchChatHistory,
  saveChatMessage,
  clearChatHistory,
} from '../api/client';
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
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [undoneIds, setUndoneIds] = useState({});

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

  const persistMessage = (role, text, payload = null) => {
    if (!token || typeof saveChatMessage !== 'function') return;
    try {
      const p = saveChatMessage(token, { role, text, payload });
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch (e) {}
  };

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

  const handleSendMessage = async (explicitText = null) => {
    const raw = typeof explicitText === 'string' && explicitText.length > 0 ? explicitText : textRef.current;
    const text = (raw || '').trim();
    if (!text || loading) return;

    setInputText('');
    textRef.current = '';
    const nowTime = formatTime();
    const userMsgId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const userMsg = {
      id: userMsgId,
      sender: 'user',
      text,
      timestamp: nowTime,
    };
    setMessages((prev) => [...prev, userMsg]);
    persistMessage('user', text);

    // If there is a pending confirmation and user types "yes" / "confirm"
    if (pendingConfirmation && ['yes', 'confirm', 'sure', 'ok', 'aam'].includes(text.toLowerCase())) {
      await handleConfirmAction(pendingConfirmation);
      return;
    }

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

      // 1. Parse text -> IntentObject
      const parseRes = await parseIntent(token, text);
      const intent = parseRes.intent;

      // 2. Route intent -> RoutingDecision + DB Execution or Prompts
      const routeRes = await routeIntent(token, intent);
      const decision = routeRes.decision;
      const lang = intent.language || (activeDialect === 'Malayalam' ? 'ml' : 'en');

      if (decision === 'EXECUTE') {
        let replyText = routeRes.spoken_response || 'Done!';
        const isAddAction = intent.action === 'add';
        if (!routeRes.spoken_response) {
          if (isAddAction) {
            const amt = intent.fields.amount;
            const cat = intent.fields.category || 'expense';
            replyText = `Added ${cat} transaction for ₹${amt}.`;
          } else if (intent.action === 'query') {
            replyText = 'Fetching your data. Details are displayed below.';
          }
        }

        const msgId = `pappu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        setMessages((prev) => [
          ...prev,
          {
            id: msgId,
            sender: 'pappu',
            text: replyText,
            language: lang,
            queryResult: intent.action === 'query' ? routeRes.execution_result : null,
            isAddSuccess: isAddAction,
            timestamp: formatTime(),
          },
        ]);

        persistMessage('assistant', replyText, {
          queryResult: intent.action === 'query' ? routeRes.execution_result : null,
          isAddSuccess: isAddAction,
          language: lang,
        });

        // Speak response aloud via TTS
        speakResponse(replyText, lang).then((audioBase64) => {
          if (audioBase64) {
            setMessages((prev) =>
              prev.map((m) => (m.id === msgId ? { ...m, audioBase64 } : m))
            );
          }
        });

        // Trigger live dashboard update!
        if (onTransactionMutated) {
          onTransactionMutated();
        }
      } else if (decision === 'ASK_CONFIRMATION') {
        // Check if this is a contact confirmation (e.g. "Did you mean Arjun Nair?")
        if (routeRes.contact_match) {
          const suggested = routeRes.contact_match;
          const prompt =
            routeRes.confirmation_prompt ||
            `Did you mean ${suggested.name}? Or add as new person "${suggested.original}"?`;

          const confirmData = {
            type: 'contact_confirmation',
            action: 'add',
            fields: intent.fields,
            contact_id: suggested.id,
            contact_name: suggested.name,
            suggested_contact: suggested,
            language: lang,
          };

          setPendingConfirmation(confirmData);

          const msgId = `pappu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          setMessages((prev) => [
            ...prev,
            {
              id: msgId,
              sender: 'pappu',
              text: prompt,
              type: 'contact_confirmation',
              confirmData,
              candidates: routeRes.candidates,
              language: lang,
              timestamp: formatTime(),
            },
          ]);

          persistMessage('assistant', prompt, {
            type: 'contact_confirmation',
            confirmData,
            candidates: routeRes.candidates,
            language: lang,
          });

          speakResponse(routeRes.spoken_response || prompt, lang);
        } else {
          // Standard transaction edit/delete confirmation
          const targetId = routeRes.matched_transactions?.[0];
          const prompt =
            routeRes.spoken_response ||
            routeRes.confirmation_prompt ||
            `Are you sure you want to ${intent.action} transaction ${targetId}?`;

          const confirmData = {
            transaction_id: targetId,
            action: intent.action,
            fields: intent.fields,
            target_transaction: routeRes.target_transaction,
            language: lang,
          };

          setPendingConfirmation(confirmData);

          const msgId = `pappu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          setMessages((prev) => [
            ...prev,
            {
              id: msgId,
              sender: 'pappu',
              text: prompt,
              type: 'confirmation',
              confirmData,
              target_transaction: routeRes.target_transaction,
              language: lang,
              timestamp: formatTime(),
            },
          ]);

          persistMessage('assistant', prompt, {
            type: 'confirmation',
            confirmData,
            target_transaction: routeRes.target_transaction,
            language: lang,
          });

          speakResponse(prompt, lang);
        }
      } else if (decision === 'ASK_DISAMBIGUATION') {
        const prompt =
          routeRes.spoken_response ||
          routeRes.disambiguation_prompt ||
          'Multiple options match. Please select:';
        const candidates = routeRes.candidates || [];

        const msgId = `pappu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        setMessages((prev) => [
          ...prev,
          {
            id: msgId,
            sender: 'pappu',
            text: prompt,
            type: 'disambiguation',
            action: intent.action,
            fields: intent.fields,
            candidates,
            language: lang,
            timestamp: formatTime(),
          },
        ]);

        persistMessage('assistant', prompt, {
          type: 'disambiguation',
          action: intent.action,
          fields: intent.fields,
          candidates,
          language: lang,
        });

        speakResponse(prompt, lang);
      } else if (decision === 'ASK_CLARIFICATION') {
        const prompt =
          routeRes.spoken_response ||
          routeRes.clarification_prompt ||
          'Please provide more details (amount, category, or date).';

        const msgId = `pappu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        setMessages((prev) => [
          ...prev,
          {
            id: msgId,
            sender: 'pappu',
            text: prompt,
            type: 'clarification',
            language: lang,
            timestamp: formatTime(),
          },
        ]);

        persistMessage('assistant', prompt, {
          type: 'clarification',
          language: lang,
        });

        speakResponse(prompt, lang);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `pappu-err-${Date.now()}`,
          sender: 'pappu',
          text: `Error: ${err.message || 'Something went wrong'}`,
          isError: true,
          timestamp: formatTime(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async (confirmData, customContact = null) => {
    try {
      setLoading(true);

      const action = confirmData.action || 'add';
      const extra = {};
      if (customContact) {
        if (customContact.id && customContact.id !== 'new') {
          extra.contact_id = customContact.id;
        }
        if (customContact.name) {
          extra.contact_name = customContact.name;
        }
      } else if (confirmData.contact_id) {
        extra.contact_id = confirmData.contact_id;
        extra.contact_name = confirmData.contact_name;
      }

      if (Object.keys(extra).length > 0) {
        await confirmAction(
          token,
          confirmData.transaction_id || null,
          action,
          confirmData.fields,
          extra
        );
      } else {
        await confirmAction(
          token,
          confirmData.transaction_id || null,
          action,
          confirmData.fields
        );
      }

      setPendingConfirmation(null);
      const replyText = action === 'add'
        ? `Added transaction for ${extra.contact_name || 'contact'}.`
        : `Successfully executed ${action}.`;

      const msgId = `pappu-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          sender: 'pappu',
          text: replyText,
          timestamp: formatTime(),
        },
      ]);

      persistMessage('assistant', replyText);

      speakResponse(replyText, confirmData.language || 'en');

      // Trigger dashboard update
      if (onTransactionMutated) {
        onTransactionMutated();
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `pappu-err-${Date.now()}`,
          sender: 'pappu',
          text: `Failed to execute: ${err.message}`,
          isError: true,
          timestamp: formatTime(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDisambiguationCandidate = (candidate, action, fields, lang = 'en') => {
    // If it's a contact candidate
    if (candidate.type === 'existing' || candidate.type === 'new' || (candidate.name && !candidate.amount)) {
      const confirmData = {
        action: action || 'add',
        fields,
        contact_id: candidate.id !== 'new' ? candidate.id : null,
        contact_name: candidate.name,
        language: lang,
      };
      handleConfirmAction(confirmData, candidate);
      return;
    }

    // Transaction candidate
    const confirmData = {
      transaction_id: candidate.id,
      action,
      fields,
      target_transaction: candidate,
      language: lang,
    };
    setPendingConfirmation(confirmData);

    const prompt = `Selected ₹${candidate.amount} (${candidate.category_name || 'txn'} on ${candidate.txn_date}). Confirm ${action}?`;
    setMessages((prev) => [
      ...prev,
      {
        id: `pappu-${Date.now()}`,
        sender: 'pappu',
        text: prompt,
        type: 'confirmation',
        confirmData,
        target_transaction: candidate,
        timestamp: formatTime(),
      },
    ]);

    speakResponse(prompt, lang);
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
    setPendingConfirmation(null);
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
    return (
      <View key={msg.id} testID={`message-${msg.id}`} style={styles.assistantMessageRow}>
        <View style={styles.assistantAvatarCircle}>
          <MaterialIcons name="smart-toy" size={16} color={colors.brand.default} />
        </View>

        <View style={styles.assistantContentCol}>
          {/* Contact Confirmation */}
          {msg.type === 'contact_confirmation' && msg.confirmData ? (
            <ConfirmationCard
              prompt={msg.text}
              type="confirmation"
              isHistorical={Boolean(msg.isHistorical)}
              actionLabel={msg.isHistorical ? 'Resolved' : `Yes, ${msg.confirmData.suggested_contact?.name || 'confirm'}`}
              onConfirm={
                msg.isHistorical
                  ? null
                  : () =>
                      handleConfirmAction(msg.confirmData, {
                        id: msg.confirmData.suggested_contact?.id,
                        name: msg.confirmData.suggested_contact?.name,
                      })
              }
              secondaryAction={!msg.isHistorical}
              secondaryLabel={`+ Add new "${msg.confirmData.suggested_contact?.original || 'person'}"`}
              onSecondaryAction={() =>
                handleConfirmAction(msg.confirmData, {
                  id: 'new',
                  name: msg.confirmData.suggested_contact?.original,
                })
              }
            />
          ) : msg.type === 'confirmation' && msg.confirmData ? (
            <ConfirmationCard
              prompt={msg.text}
              type="confirmation"
              isHistorical={Boolean(msg.isHistorical)}
              targetTransaction={msg.target_transaction || msg.confirmData.target_transaction}
              onConfirm={msg.isHistorical ? null : () => handleConfirmAction(msg.confirmData)}
              actionLabel={msg.isHistorical ? 'Resolved' : msg.confirmData.action}
              secondaryAction={!msg.isHistorical}
              secondaryLabel="Cancel"
              onSecondaryAction={() => setPendingConfirmation(null)}
            />
          ) : msg.type === 'disambiguation' && msg.candidates ? (
            <ConfirmationCard
              prompt={msg.text}
              type="disambiguation"
              candidates={msg.candidates}
              onSelect={(cand) =>
                handleSelectDisambiguationCandidate(cand, msg.action, msg.fields, msg.language)
              }
              actionLabel={msg.action}
            />
          ) : msg.isAddSuccess ? (
            /* Stitch Added Success Banner with Undo Pill */
            <View style={[styles.assistantCard, shadows.sm]}>
              <View style={styles.addSuccessRow}>
                <View style={styles.checkCircleBadge}>
                  <MaterialIcons name="check" size={13} color={colors.semantic.income} />
                </View>
                <Text style={styles.assistantCardText}>{msg.text}</Text>
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
                          speakResponse(msg.text, msg.language || 'en');
                        }
                      }
                    : null
                }
              />
            </View>
          )}

          {/* Rich Query Data Card */}
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
        ) : messages.length === 0 ? (
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
          {/* Keyboard Toggle Icon */}
          <View style={styles.keyboardIconBtn}>
            <MaterialIcons name="keyboard" size={20} color={colors.text.tertiary} />
          </View>

          {/* Text Input */}
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

          {/* Send Button (if text entered) */}
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

          {/* Hero Voice Mic FAB with Concentric Radiant Aura */}
          <View style={styles.micWrapper}>
            <View style={styles.micPulseRing} pointerEvents="none" />
            <MicButton
              token={token}
              onTranscribed={(transcript) => handleSendMessage(transcript)}
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
    paddingBottom: 96, // clearance for floating nav
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

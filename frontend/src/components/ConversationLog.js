import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  StyleSheet,
  Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  synthesizeSpeech,
  undoTransaction,
  fetchChatHistory,
  clearChatHistory,
  sendAssistantMessage,
  answerPending,
  fetchActivePending,
  fetchProfile,
} from '../api/client';
import { generateUUID } from '../utils/uuid';
import { playAudioBase64 } from '../utils/audioPlayer';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useReduceMotion } from '../utils/reduceMotion';
import { queryClient } from '../data/queryClient';
import { queryKeys } from '../data/queryKeys';

import Pappu from './ui/Pappu';
import MessageBubble from './ui/MessageBubble';
import ConfirmationCard from './ui/ConfirmationCard';
import QueryDataCard from './ui/QueryDataCard';
import MicButton from './MicButton';
import CoinShower from './ui/CoinShower';
import VoiceWaveAnimation from './ui/VoiceWaveAnimation';

const SUGGESTION_CHIPS = [
  'Sent 500 to Pooja',
  'ചായ 20 രൂപ',
  'Food this week?',
];

function formatTime(date = new Date()) {
  try {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    return '6:16 PM';
  }
}

/**
 * Assistant Modal Component per Stitch Design System.
 * Visual source: Stitch screen 7fe009e4a12c4c8c83a8f7ebaf6a6f48 (assistant.html)
 */
export default function ConversationLog({
  token,
  onTransactionMutated,
  initialMessages = [],
  messages: externalMessages = null,
  setMessages: externalSetMessages = null,
  onClearMessages = null,
  assistantV2 = true,
  onBack = null,
  testID = 'assistant-modal',
  route = null,
}) {
  const reduceMotion = useReduceMotion();
  const [inputText, setInputText] = useState('');
  const textRef = useRef('');
  const scrollViewRef = useRef(null);

  // Messages state (local or controlled by parent)
  const [localMessages, setLocalMessages] = useState(initialMessages);
  const messages = externalMessages !== null ? externalMessages : localMessages;
  const setMessages = externalSetMessages !== null ? externalSetMessages : setLocalMessages;

  // Assistant states: 'listening', 'thinking', 'speaking', 'confused', 'idle'
  const [assistantState, setAssistantState] = useState('idle');
  const [activeMood, setActiveMood] = useState('idle');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(
    Boolean(token) && (!messages || messages.length === 0)
  );
  const [activePending, setActivePending] = useState(null);
  const [showCoinShower, setShowCoinShower] = useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState(null);
  const [lastFailedMessage, setLastFailedMessage] = useState(null);

  // Typing dots animation: 3 dots cycle translateY(-4px -> 0) staggered by 120ms, 600ms loop per motion spec
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let anim;
    if (loading && !reduceMotion) {
      const createBounce = (animVal, delay) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(animVal, {
              toValue: -4,
              duration: 150,
              useNativeDriver: true,
            }),
            Animated.timing(animVal, {
              toValue: 0,
              duration: 150,
              useNativeDriver: true,
            }),
            Animated.delay(Math.max(0, 600 - delay - 300)),
          ])
        );

      anim = Animated.parallel([
        createBounce(dot1Anim, 0),
        createBounce(dot2Anim, 120),
        createBounce(dot3Anim, 240),
      ]);
      anim.start();
    } else {
      dot1Anim.setValue(0);
      dot2Anim.setValue(0);
      dot3Anim.setValue(0);
    }
    return () => {
      if (anim) anim.stop();
    };
  }, [loading, reduceMotion, dot1Anim, dot2Anim, dot3Anim]);

  // Fetch active pending action on mount
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
                    setActiveMood('concerned');
                  } else {
                    setActivePending(null);
                  }
                } else {
                  setActivePending(pending);
                  setActiveMood('concerned');
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

  // Load chat history from GET /chat/history with pagination
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
                    text: m.text || m.content || '',
                    timestamp: m.created_at ? formatTime(new Date(m.created_at)) : formatTime(),
                    pending: m.pending || payload.pending || null,
                    results: m.results || payload.results || [],
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

  // Scroll to bottom on updates
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: !reduceMotion });
      }, 80);
    }
  }, [messages, loading, activePending, reduceMotion]);

  // TTS audio playback
  const speakResponse = useCallback(
    async (text, language = 'en', messageId = null, isManualTap = false) => {
      if (!token || !text) return null;

      // Respect user's voice_replies preference for automatic replies
      if (!isManualTap) {
        let voiceEnabled = true;
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            const stored = window.localStorage.getItem('pappu_voice_replies');
            if (stored !== null) {
              voiceEnabled = stored === 'true' || stored === true;
            }
          } catch (_) {}
        }
        if (voiceEnabled && queryClient) {
          const cached = queryClient.getQueryData(queryKeys.profile());
          if (cached && cached.voice_replies !== undefined && cached.voice_replies !== null) {
            voiceEnabled = Boolean(cached.voice_replies);
          }
        }
        if (!voiceEnabled) {
          return null;
        }
      }

      try {
        setAssistantState('speaking');
        setActiveMood('speaking');
        if (messageId) setCurrentlySpeakingId(messageId);

        const targetLang = language === 'ml' || language === 'malayalam' ? 'ml-IN' : 'en-IN';
        const ttsRes = await synthesizeSpeech(token, text, targetLang);
        if (ttsRes?.audio_base64) {
          await playAudioBase64(ttsRes.audio_base64);
          return ttsRes.audio_base64;
        }
      } catch (err) {
        console.warn('TTS playback warning:', err);
      } finally {
        setAssistantState('idle');
        setCurrentlySpeakingId(null);
      }
      return null;
    },
    [token]
  );

  // Invalidate queries when changed: true
  const handleDataChanged = useCallback(() => {
    if (queryClient) {
      queryClient.invalidateQueries({ queryKey: queryKeys.summary() });
      queryClient.invalidateQueries({ queryKey: queryKeys.people() });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
      queryClient.invalidateQueries({ queryKey: queryKeys.chatHistory() });
    }
    if (onTransactionMutated) {
      onTransactionMutated();
    }
  }, [onTransactionMutated]);

  // Main message sender
  const handleSendMessage = useCallback(
    async (explicitText = null, options = {}) => {
      const raw = typeof explicitText === 'string' && explicitText.length > 0 ? explicitText : (textRef.current || inputText);
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
      setLastFailedMessage(null);

      if (!token) {
        setAssistantState('confused');
        setActiveMood('confused');
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
        setAssistantState('thinking');
        setActiveMood('thinking');

        const res = await sendAssistantMessage(token, {
          text,
          input: options.input === 'voice' ? 'voice' : 'typed',
          client_msg_id: clientMsgId,
        });

        const replyText = res.display_text || res.reply_text || res.spoken_text || 'Done';
        const spokenText = res.spoken_text || '';
        const msgId = `pappu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const resMood = res.mood || 'neutral';

        // Check if pending exists or was superseded
        if (res.pending && res.pending.id) {
          setActivePending(res.pending);
          setActiveMood('concerned');
        } else {
          setActivePending(null);
        }

        // Trigger celebratory coin shower on income
        const hasIncome = (res.results || []).some(
          (r) =>
            r.kind === 'income' ||
            r.type === 'income' ||
            r.direction === 'received' ||
            (r.data && (r.data.type === 'income' || r.data.direction === 'received'))
        );
        if (hasIncome && !reduceMotion) {
          setShowCoinShower(true);
        }

        const pappuMsg = {
          id: msgId,
          sender: 'pappu',
          text: replyText,
          spoken_text: spokenText,
          results: res.results || [],
          pending: res.pending || null,
          mood: resMood,
          client_msg_id: clientMsgId,
          timestamp: formatTime(),
        };

        // If old card was pending, mark earlier messages as resolved
        setMessages((prev) =>
          prev
            .map((m) => (m.pending && !res.pending ? { ...m, isHistorical: true } : m))
            .concat(pappuMsg)
        );

        // Derive mascot mood / state
        if (resMood === 'confused') {
          setAssistantState('confused');
          setActiveMood('confused');
        } else if (resMood === 'excited') {
          setActiveMood('excited');
          setAssistantState('idle');
        } else if (resMood === 'happy') {
          setActiveMood('happy');
          setAssistantState('idle');
        } else if (res.pending) {
          setActiveMood('concerned');
          setAssistantState('idle');
        } else {
          setActiveMood('idle');
          setAssistantState('idle');
        }

        // Play audio if spokenText exists
        if (spokenText) {
          speakResponse(spokenText, res.language || 'en', msgId);
        }

        if (res.changed) {
          handleDataChanged();
        }
      } catch (err) {
        setAssistantState('confused');
        setActiveMood('confused');
        setLastFailedMessage({ text, client_msg_id: clientMsgId });

        setMessages((prev) => [
          ...prev,
          {
            id: `pappu-err-${Date.now()}`,
            sender: 'pappu',
            text: `Error: ${err.message || 'Network error'}`,
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
    },
    [loading, token, reduceMotion, speakResponse, handleDataChanged, setMessages, inputText]
  );

  // Answering pending confirmations / disambiguations directly
  const handleAnswerPending = useCallback(
    async (pendingId, answer, index = null) => {
      if (!token || !pendingId) return;

      try {
        setLoading(true);
        setAssistantState('thinking');
        setActiveMood('thinking');

        const res = await answerPending(token, pendingId, answer, index);
        const replyText = res.display_text || res.reply_text || res.spoken_text || 'Action confirmed.';
        const spokenText = res.spoken_text || '';
        const msgId = `pappu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const resMood = res.mood || 'neutral';

        if (res.pending && res.pending.id) {
          setActivePending(res.pending);
          setActiveMood('concerned');
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
          mood: resMood,
          timestamp: formatTime(),
        };

        // Mark previously pending card as resolved
        setMessages((prev) =>
          prev
            .map((m) => (m.pending ? { ...m, isHistorical: true } : m))
            .concat(pappuMsg)
        );

        if (resMood === 'confused') {
          setAssistantState('confused');
          setActiveMood('confused');
        } else {
          setActiveMood(resMood || 'idle');
          setAssistantState('idle');
        }

        if (spokenText) {
          speakResponse(spokenText, res.language || 'en', msgId);
        }

        if (res.changed) {
          handleDataChanged();
        }
      } catch (err) {
        setAssistantState('confused');
        setActiveMood('confused');
        setMessages((prev) => [
          ...prev,
          {
            id: `pappu-err-${Date.now()}`,
            sender: 'pappu',
            text: `Error: ${err.message || 'Failed to process confirmation'}`,
            isError: true,
            timestamp: formatTime(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [token, speakResponse, handleDataChanged, setMessages]
  );

  // Retry sending last failed message using same client_msg_id
  const handleRetry = useCallback(() => {
    if (lastFailedMessage?.text) {
      handleSendMessage(lastFailedMessage.text, {
        client_msg_id: lastFailedMessage.client_msg_id,
      });
    }
  }, [lastFailedMessage, handleSendMessage]);

  // Undo transaction
  const handleUndo = useCallback(async () => {
    if (!token) return;
    try {
      await undoTransaction(token);
      handleDataChanged();
      setMessages((prev) => [
        ...prev,
        {
          id: `pappu-undo-${Date.now()}`,
          sender: 'pappu',
          text: 'Action undone successfully.',
          timestamp: formatTime(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `pappu-undo-err-${Date.now()}`,
          sender: 'pappu',
          text: `Failed to undo: ${err.message || 'Error'}`,
          isError: true,
          timestamp: formatTime(),
        },
      ]);
    }
  }, [token, handleDataChanged, setMessages]);

  // Helper to render pending confirmation/disambiguation card
  const renderPendingCard = (pendingItem, isHistorical = false) => {
    const actionType = pendingItem.action_type || pendingItem.kind || 'confirm';
    const isDisambig = actionType === 'disambiguate' || actionType === 'disambiguation';
    const isContact = actionType === 'contact_confirm';
    const targetTxn = !isDisambig ? (pendingItem.target_transaction || pendingItem.candidates?.[0]) : null;

    let actionLabel = 'confirm';
    if (isDeleteAction(pendingItem)) {
      actionLabel = 'delete';
    } else if (isEditAction(pendingItem)) {
      actionLabel = 'update';
    } else if (isContact) {
      const candName = pendingItem.candidates?.[0]?.name;
      actionLabel = candName ? `Yes, ${candName}` : 'Yes';
    }

    return (
      <ConfirmationCard
        prompt={pendingItem.question || pendingItem.summary || 'Confirmation required'}
        type={isDisambig ? 'disambiguation' : isContact ? 'contact_confirm' : 'confirmation'}
        actionLabel={actionLabel}
        candidates={pendingItem.candidates || []}
        targetTransaction={targetTxn}
        isHistorical={isHistorical}
        onConfirm={() => handleAnswerPending(pendingItem.id, isContact ? 'yes' : 'confirm', isContact ? 0 : null)}
        secondaryAction={true}
        secondaryLabel={isContact ? 'No' : (isDeleteAction(pendingItem) || isEditAction(pendingItem)) ? 'Keep it' : 'Cancel'}
        onSecondaryAction={() => handleAnswerPending(pendingItem.id, isContact ? 'no' : 'cancel', null)}
        onSelect={(cand, idx) => {
          const candAnswer = typeof cand === 'string' ? cand : (cand.id || cand.name || 'select');
          handleAnswerPending(pendingItem.id, candAnswer, idx);
        }}
      />
    );
  };

  const isDeleteAction = (p) => {
    const q = (p.question || p.summary || '').toLowerCase();
    return q.startsWith('delete') || p.action_type === 'delete' || p.action?.op === 'delete';
  };

  const isEditAction = (p) => {
    const q = (p.question || p.summary || '').toLowerCase();
    return (
      q.startsWith('update') ||
      q.startsWith('change') ||
      q.startsWith('edit') ||
      p.action_type === 'edit' ||
      p.action_type === 'update' ||
      p.action?.op === 'edit' ||
      p.action?.op === 'update'
    );
  };

  // Determine state caption below mascot
  let stateCaption = null;
  if (assistantState === 'listening') {
    stateCaption = 'Listening…';
  } else if (assistantState === 'thinking' || loading) {
    stateCaption = 'One sec…';
  } else if (assistantState === 'speaking') {
    stateCaption = 'Pappu is talking';
  } else if (assistantState === 'confused') {
    stateCaption = "Didn't catch that. Try again?";
  } else if (activePending) {
    stateCaption = 'Confirmation required';
  } else {
    stateCaption = null;
  }

  const handleClearHistory = useCallback(async () => {
    if (!token) return;
    try {
      if (typeof clearChatHistory === 'function') {
        await clearChatHistory(token);
      }
      setMessages([]);
      setActivePending(null);
    } catch (err) {
      console.warn('Failed to clear chat history:', err);
    }
  }, [token]);

  return (
    <View testID={testID} style={styles.container}>
      <View testID="conversation-container" style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      {/* ── Top Bar: Close Button, Time & Clear ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          testID="assistant-close-button"
          accessibilityRole="button"
          accessibilityLabel="Close Assistant"
          activeOpacity={0.85}
          onPress={() => {
            if (onBack) onBack();
          }}
          style={styles.closeButton}
        >
          <Feather name="x" size={20} color={colors.ink} />
          <View testID="conversation-back-button" style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        </TouchableOpacity>
        <Text style={styles.topTimeText}>{formatTime()}</Text>
        <TouchableOpacity
          testID="clear-chat-button"
          accessibilityRole="button"
          accessibilityLabel="Clear chat history"
          activeOpacity={0.7}
          onPress={handleClearHistory}
          style={styles.clearButton}
        >
          <Feather name="trash-2" size={16} color={colors.ink_muted} />
        </TouchableOpacity>
      </View>

      {/* ── Mascot Header with State Caption & Retry Button ── */}
      <View style={styles.mascotHeader} testID="assistant-mascot-header">
        {assistantState === 'listening' ? (
          <View style={styles.listeningWaveHeader} testID="assistant-listening-wave-header">
            <VoiceWaveAnimation
              color={colors.gold_edge}
              maxHeight={64}
              minHeight={12}
              barWidth={6}
              gap={5}
              barCount={15}
            />
            <Text style={styles.stateCaption} testID="assistant-state-caption">
              Listening…
            </Text>
          </View>
        ) : (
          <>
            <Pappu mood={activeMood} size={120} testID="assistant-mascot" />
            {Boolean(stateCaption) && (
              <Text style={styles.stateCaption} testID="assistant-state-caption">
                {stateCaption}
              </Text>
            )}
          </>
        )}

        {/* Retry Button in Confused State */}
        {assistantState === 'confused' && (
          <TouchableOpacity
            testID="assistant-retry-button"
            accessibilityRole="button"
            accessibilityLabel="Try again"
            activeOpacity={0.85}
            onPress={handleRetry}
            style={styles.confusedRetryButton}
          >
            <Feather name="refresh-cw" size={15} color={colors.ink} style={{ marginRight: 6 }} />
            <Text style={styles.confusedRetryText}>Try again</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Chat Conversation Scroll Area ── */}
      <ScrollView
        ref={scrollViewRef}
        testID="conversation-scroll"
        style={styles.chatScroll}
        contentContainerStyle={styles.chatScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && !loading && !activePending && (
          <View style={styles.emptyContainer}>
            <Text testID="empty-conversation-text" style={styles.emptyText}>
              Hold the coin or type below to start talking with Pappu
            </Text>
          </View>
        )}
        {messages.map((msg, index) => {
          const isUser = msg.sender === 'user';
          const isCurrentlyPlaying = currentlySpeakingId === msg.id;
          const hasPending = Boolean(msg.pending && msg.pending.id);
          const isPendingHistorical = Boolean(msg.isHistorical || !activePending || activePending.id !== msg.pending?.id);

          // Check if add card with heard amount
          const addResult = Array.isArray(msg.results)
            ? msg.results.find((r) => r && (r.kind === 'added' || r.action === 'add' || r.heard_amount !== undefined))
            : null;
          const heardAmount = addResult?.heard_amount ?? addResult?.amount ?? null;

          // Check if query results
          const rawQueryResult = Array.isArray(msg.results)
            ? msg.results.find((r) => r && (
                r.kind === 'balances' ||
                r.kind === 'sum' ||
                r.kind === 'list' ||
                r.kind === 'category_breakdown' ||
                r.kind === 'biggest' ||
                r.kind === 'compare' ||
                r.status === 'sum' ||
                r.status === 'balances' ||
                r.status === 'category_breakdown' ||
                r.status === 'list' ||
                r.action === 'query' ||
                r.contacts ||
                r.per_contact ||
                r.data?.sum !== undefined ||
                r.data?.categories !== undefined ||
                r.data?.balances !== undefined ||
                r.data?.transactions !== undefined
              ))
            : null;

          const queryResult = rawQueryResult
            ? {
                ...rawQueryResult,
                ...(rawQueryResult.data || {}),
                kind: rawQueryResult.data?.kind || rawQueryResult.kind || rawQueryResult.status || 'sum',
                category: rawQueryResult.data?.category || rawQueryResult.category || rawQueryResult.data?.filters_used?.category || rawQueryResult.filters_used?.category,
                period: rawQueryResult.data?.period || rawQueryResult.period || rawQueryResult.data?.filters_used?.period || rawQueryResult.filters_used?.period,
                total_amount: rawQueryResult.data?.total_amount ?? rawQueryResult.data?.sum ?? rawQueryResult.data?.total ?? rawQueryResult.total_amount ?? rawQueryResult.total,
                transactions: rawQueryResult.data?.transactions || rawQueryResult.transactions || [],
                categories: rawQueryResult.data?.categories || rawQueryResult.categories || [],
                balances: rawQueryResult.data?.balances || rawQueryResult.data?.per_contact || rawQueryResult.balances || rawQueryResult.per_contact || [],
              }
            : null;

          if (isUser) {
            return (
              <View key={msg.id || `msg-${index}`} style={styles.messageRowWrapper}>
                <MessageBubble
                  testID={`msg-bubble-${index}`}
                  text={msg.text}
                  sender="user"
                  timestamp={msg.timestamp}
                />
              </View>
            );
          }

          // Pappu message: If message has a pending card, render the card directly (Stitch layout)
          if (hasPending) {
            return (
              <View key={msg.id || `msg-${index}`} style={styles.cardWrapper}>
                {renderPendingCard(msg.pending, isPendingHistorical)}
              </View>
            );
          }

          // Otherwise, render message bubble + optional add result / query cards
          return (
            <View key={msg.id || `msg-${index}`} style={styles.messageRowWrapper}>
              <MessageBubble
                testID={`msg-bubble-${index}`}
                text={msg.text}
                sender="pappu"
                isError={msg.isError}
                hasAudio={Boolean(msg.spoken_text || msg.audioBase64)}
                isPlayingAudio={isCurrentlyPlaying}
                onPlayAudio={() => {
                  if (msg.spoken_text) {
                    speakResponse(msg.spoken_text, 'en', msg.id, true);
                  }
                }}
                timestamp={msg.timestamp}
                canRetry={msg.canRetry}
                onRetry={() => {
                  if (msg.failedText) {
                    handleSendMessage(msg.failedText, { client_msg_id: msg.client_msg_id });
                  } else {
                    handleRetry();
                  }
                }}
              />

              {/* Add heard amount & undo pill */}
              {addResult && heardAmount !== null && (
                <View style={styles.heardWrapper} testID="add-result-card">
                  <View style={styles.heardPill}>
                    <Text testID="heard-amount-text" style={styles.heardText}>
                      Amount heard: ₹{heardAmount}
                    </Text>
                  </View>
                  <TouchableOpacity
                    testID="undo-button"
                    accessibilityRole="button"
                    accessibilityLabel="Undo"
                    activeOpacity={0.8}
                    onPress={handleUndo}
                    style={styles.undoPill}
                  >
                    <Feather name="rotate-ccw" size={12} color={colors.ink} style={{ marginRight: 4 }} />
                    <Text style={styles.undoText}>Undo</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Query data card */}
              {queryResult && (
                <View style={styles.cardWrapper}>
                  <QueryDataCard result={queryResult} />
                </View>
              )}
            </View>
          );
        })}

        {/* Live Pending Item (persists closing & reopening modal, rendered once) */}
        {activePending && !messages.some((m) => m.pending?.id === activePending.id) && (
          <View testID="live-pending-container" style={styles.cardWrapper}>
            {renderPendingCard(activePending, false)}
          </View>
        )}

        {/* Thinking Typing Bubble with 3 Bouncing Dots */}
        {loading && (
          <View style={styles.typingBubbleRow} testID="typing-bubble">
            <View style={styles.miniAvatar}>
              <Text style={styles.avatarRupee}>₹</Text>
            </View>
            <View style={styles.typingBubble}>
              <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot1Anim }] }]} />
              <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot2Anim }] }]} />
              <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot3Anim }] }]} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Suggestion Chips Row ── */}
      <View style={styles.chipsRow} testID="suggestion-chips-row">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScrollContent}
        >
          {SUGGESTION_CHIPS.map((chipText, idx) => (
            <TouchableOpacity
              key={`chip-${idx}`}
              testID={`suggestion-chip-${idx}`}
              accessibilityRole="button"
              accessibilityLabel={chipText}
              activeOpacity={0.8}
              onPress={() => handleSendMessage(chipText)}
              style={styles.chipPill}
            >
              <Text style={styles.chipText}>{chipText}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Active Voice Listening Wave Banner ── */}
      {assistantState === 'listening' && (
        <View style={styles.listeningActiveBanner} testID="assistant-listening-banner">
          <VoiceWaveAnimation color={colors.gold_edge} maxHeight={16} minHeight={4} barWidth={3} gap={2.5} style={{ marginRight: 8 }} />
          <Text style={styles.listeningActiveBannerText}>Listening to your voice... Speak now</Text>
        </View>
      )}

      {/* ── Thumb Zone Input Bar with Overlapping Coin Mic ── */}
      <View style={styles.inputBarContainer} testID="assistant-input-bar">
        <View style={styles.inputPill}>
          {/* Keyboard outline icon */}
          <Feather name="edit-3" size={18} color={colors.ink_muted} style={styles.keyboardIcon} />

          {/* Text Input Field */}
          <TextInput
            testID="conversation-input"
            value={inputText}
            onChangeText={(val) => {
              setInputText(val);
              textRef.current = val;
            }}
            placeholder="Type or hold the coin to talk"
            placeholderTextColor={colors.ink_muted}
            onSubmitEditing={() => handleSendMessage(textRef.current)}
            returnKeyType="send"
            style={styles.textInputField}
            editable={!loading}
          />

          {/* Send Button if text entered */}
          {inputText.trim().length > 0 && (
            <TouchableOpacity
              testID="conversation-send-button"
              accessibilityRole="button"
              accessibilityLabel="Send message"
              activeOpacity={0.85}
              onPress={() => handleSendMessage(textRef.current)}
              style={styles.inlineSendBtn}
            >
              <Feather name="arrow-up" size={18} color={colors.surface} />
            </TouchableOpacity>
          )}
        </View>

        {/* 72px Coin Mic Button Overlapping right edge */}
        <View style={styles.coinMicWrapper}>
          <MicButton
            token={token}
            isCoinStyle={true}
            size={72}
            autoRecord={route?.params?.autoRecord || false}
            onTranscribed={(transcript) => handleSendMessage(transcript, { input: 'voice' })}
            onRecordingStateChange={(recording) => {
              if (recording) {
                setAssistantState('listening');
                setActiveMood('listening');
              } else {
                setAssistantState('thinking');
                setActiveMood('thinking');
              }
            }}
            disabled={loading}
          />
        </View>
      </View>

      {/* ── Celebratory Coin Shower ── */}
      {showCoinShower && (
        <CoinShower onComplete={() => setShowCoinShower(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTimeText: {
    fontFamily: typography.fonts.body,
    fontWeight: '700',
    fontSize: 12,
    color: colors.ink_muted,
  },
  mascotHeader: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 12,
  },
  listeningWaveHeader: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stateCaption: {
    fontFamily: typography.fonts.body,
    fontWeight: '700',
    fontSize: 13,
    color: colors.ink_muted,
    marginTop: 6,
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: typography.fonts.body,
    fontWeight: '600',
    fontSize: 13,
    color: colors.ink_muted,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  confusedRetryButton: {
    marginTop: 8,
    height: 44,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 4,
    borderBottomColor: colors.border,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confusedRetryText: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 15,
    color: colors.ink,
  },
  chatScroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  chatScrollContent: {
    paddingBottom: 16,
  },
  messageRowWrapper: {
    marginVertical: 4,
  },
  cardWrapper: {
    marginTop: 6,
    marginBottom: 4,
    marginLeft: 40, // Aligns under Pappu reply bubble
  },
  miniAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    flexShrink: 0,
  },
  avatarRupee: {
    fontFamily: typography.fonts.display,
    fontWeight: '800',
    fontSize: 12,
    color: colors.ink,
  },
  typingBubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 6,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.gold_edge,
  },
  heardWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 40,
    marginTop: 6,
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
  chipsRow: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  chipsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipPill: {
    height: 38,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: typography.fonts.body,
    fontWeight: '600',
    fontSize: 14,
    color: colors.ink,
  },
  inputBarContainer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    paddingTop: 4,
    position: 'relative',
    justifyContent: 'center',
  },
  inputPill: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 74, // Clearance for overlapping 70px coin mic
  },
  keyboardIcon: {
    marginRight: 10,
  },
  textInputField: {
    flex: 1,
    fontFamily: typography.fonts.body,
    fontWeight: '600',
    fontSize: 14,
    color: colors.ink,
    height: '100%',
  },
  inlineSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gold_edge,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  coinMicWrapper: {
    position: 'absolute',
    right: 18,
    zIndex: 10,
  },
  listeningActiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 8,
    borderBottomWidth: 3,
    borderBottomColor: colors.borderDark || colors.border,
  },
  listeningActiveBannerText: {
    fontFamily: typography.fonts.display,
    fontWeight: '700',
    fontSize: 12,
    color: colors.ink,
  },
});

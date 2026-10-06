import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { parseIntent, routeIntent, confirmAction, synthesizeSpeech } from '../api/client';
import { playAudioBase64 } from '../utils/audioPlayer';
import MicButton from './MicButton';
import MessageBubble from './ui/MessageBubble';
import ConfirmationCard from './ui/ConfirmationCard';

export default function ConversationLog({
  token,
  onTransactionMutated,
  initialMessages = [],
}) {
  const [inputText, setInputText] = useState('');
  const textRef = useRef(inputText);
  textRef.current = inputText;
  const scrollViewRef = useRef(null);

  const [messages, setMessages] = useState(initialMessages);
  const [loading, setLoading] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

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

  const handleSendMessage = async (explicitText = null) => {
    const raw = typeof explicitText === 'string' && explicitText.length > 0 ? explicitText : textRef.current;
    const text = (raw || '').trim();
    if (!text || loading) return;

    setInputText('');
    textRef.current = '';
    const userMsgId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const userMsg = {
      id: userMsgId,
      sender: 'user',
      text,
    };
    setMessages((prev) => [...prev, userMsg]);

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
      const lang = intent.language || 'en';

      if (decision === 'EXECUTE') {
        let replyText = routeRes.spoken_response || 'Done!';
        if (!routeRes.spoken_response) {
          if (intent.action === 'add') {
            const amt = intent.fields.amount;
            const cat = intent.fields.category || 'expense';
            replyText = `Added ${cat} transaction for ₹${amt}.`;
          } else if (intent.action === 'query') {
            const count = routeRes.execution_result?.count ?? 0;
            replyText = `Found ${count} matching transactions.`;
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
          },
        ]);

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
            language: lang,
          },
        ]);

        // Speak confirmation question aloud
        speakResponse(prompt, lang);
      } else if (decision === 'ASK_DISAMBIGUATION') {
        const prompt =
          routeRes.spoken_response ||
          routeRes.disambiguation_prompt ||
          'Multiple transactions match. Please select which one:';
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
          },
        ]);

        // Speak disambiguation prompt aloud
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
          },
        ]);

        // Speak clarification prompt aloud
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
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async (confirmData) => {
    try {
      setLoading(true);
      await confirmAction(
        token,
        confirmData.transaction_id,
        confirmData.action,
        confirmData.fields
      );

      setPendingConfirmation(null);
      const replyText = `Successfully executed ${confirmData.action}.`;
      const msgId = `pappu-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          sender: 'pappu',
          text: replyText,
        },
      ]);

      speakResponse(replyText, confirmData.language || 'en');

      // NOW trigger dashboard update!
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
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDisambiguationCandidate = (candidate, action, fields, lang = 'en') => {
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
      },
    ]);

    speakResponse(prompt, lang);
  };

  const renderMessage = (msg) => {
    // Confirmation prompt — use ConfirmationCard
    if (msg.type === 'confirmation' && msg.confirmData) {
      return (
        <View key={msg.id} testID={`message-${msg.id}`}>
          <ConfirmationCard
            prompt={msg.text}
            type="confirmation"
            onConfirm={() => handleConfirmAction(msg.confirmData)}
            actionLabel={msg.confirmData.action}
          />
        </View>
      );
    }

    // Disambiguation prompt — use ConfirmationCard in disambiguation mode
    if (msg.type === 'disambiguation' && msg.candidates) {
      return (
        <View key={msg.id} testID={`message-${msg.id}`}>
          <ConfirmationCard
            prompt={msg.text}
            type="disambiguation"
            candidates={msg.candidates}
            onSelect={(cand) =>
              handleSelectDisambiguationCandidate(cand, msg.action, msg.fields, msg.language)
            }
            actionLabel={msg.action}
          />
        </View>
      );
    }

    // Normal message — use MessageBubble
    return (
      <MessageBubble
        key={msg.id}
        testID={`message-${msg.id}`}
        text={msg.text}
        sender={msg.sender}
        isError={msg.isError}
        hasAudio={Boolean(msg.audioBase64)}
        onPlayAudio={
          msg.sender !== 'user' && !msg.isError
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
    );
  };

  return (
    <View testID="conversation-container" className="flex-1 bg-ink-navy">
      {/* Header */}
      <View className="px-5 py-2.5 flex-row justify-between items-center border-b border-ink-navy-lighter">
        <Text className="text-bone-darker font-sans text-[10px] font-medium uppercase tracking-widest">
          Assistant
        </Text>
        {loading && <ActivityIndicator testID="conversation-loading" size="small" color="#C9A227" />}
      </View>

      {/* Message Stream */}
      <ScrollView
        ref={scrollViewRef}
        testID="conversation-messages"
        className="flex-1 px-4 py-3"
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <Text
            testID="empty-conversation-text"
            className="text-bone-darker font-sans text-xs text-center py-8"
            style={{ fontFamily: 'Libre Baskerville, Georgia, serif', fontStyle: 'italic' }}
          >
            Type an expense, income, edit, or question to begin...
          </Text>
        ) : (
          messages.map(renderMessage)
        )}
      </ScrollView>

      {/* Input Bar */}
      <View className="flex-row items-center px-4 py-3 bg-ink-navy-light border-t border-ink-navy-lighter">
        <View className="mr-2">
          <MicButton
            token={token}
            onTranscribed={(transcript) => handleSendMessage(transcript)}
            disabled={loading}
          />
        </View>
        <TextInput
          testID="conversation-input"
          value={inputText}
          onChangeText={(val) => {
            setInputText(val);
            textRef.current = val;
          }}
          placeholder="Type or tap mic…"
          placeholderTextColor="#8A8A9A"
          className="flex-1 bg-ink-navy text-bone font-sans px-4 py-2.5 rounded-xl border border-ink-navy-lighter text-sm"
          onSubmitEditing={() => handleSendMessage(textRef.current)}
        />
        <Pressable
          testID="conversation-send-button"
          onPress={() => handleSendMessage(textRef.current)}
          disabled={loading}
          className={`ml-2 px-4 py-2.5 rounded-xl ${
            inputText.trim() && !loading ? 'bg-warm-brass active:bg-warm-brass-dark' : 'bg-ink-navy-lighter opacity-50'
          }`}
        >
          <Text className={`font-sans font-semibold text-xs ${
            inputText.trim() && !loading ? 'text-ink-navy' : 'text-bone-darker'
          }`}>
            Send
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

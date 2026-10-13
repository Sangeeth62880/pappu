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
import QueryDataCard from './ui/QueryDataCard';

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

  // If parent controls state (for persistent history across tabs), use it; else fallback to local state
  const [localMessages, setLocalMessages] = useState(initialMessages);
  const messages = externalMessages !== null ? externalMessages : localMessages;
  const setMessages = externalSetMessages !== null ? externalSetMessages : setLocalMessages;

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
            },
          ]);

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
              language: lang,
            },
          ]);

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
          },
        ]);

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
        },
      ]);

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
      },
    ]);

    speakResponse(prompt, lang);
  };

  const handleClearChat = () => {
    if (onClearMessages) {
      onClearMessages();
    } else {
      setMessages([]);
    }
    setPendingConfirmation(null);
  };

  const renderMessage = (msg) => {
    // Contact confirmation prompt
    if (msg.type === 'contact_confirmation' && msg.confirmData) {
      const suggested = msg.confirmData.suggested_contact;
      return (
        <View key={msg.id} testID={`message-${msg.id}`}>
          <ConfirmationCard
            prompt={msg.text}
            type="confirmation"
            actionLabel={`Yes, ${suggested?.name || 'confirm'}`}
            onConfirm={() =>
              handleConfirmAction(msg.confirmData, { id: suggested?.id, name: suggested?.name })
            }
            secondaryAction={true}
            secondaryLabel={`+ Add new "${suggested?.original || 'person'}"`}
            onSecondaryAction={() =>
              handleConfirmAction(msg.confirmData, { id: 'new', name: suggested?.original })
            }
          />
        </View>
      );
    }

    // Standard confirmation prompt — use ConfirmationCard
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

    // Disambiguation prompt
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

    // Normal message or Query Result
    return (
      <View key={msg.id} testID={`message-${msg.id}`}>
        <MessageBubble
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
        {/* Render Rich Query Data Card when present */}
        {msg.queryResult && <QueryDataCard result={msg.queryResult} />}
      </View>
    );
  };

  return (
    <View testID="conversation-container" className="flex-1 bg-surface-canvas">
      {/* Header */}
      <View className="px-5 py-2.5 flex-row justify-between items-center border-b border-border-subtle bg-surface-card">
        <Text className="text-text-tertiary font-sans text-[11px] font-semibold uppercase tracking-wider">
          Assistant
        </Text>
        <View className="flex-row items-center">
          {loading && (
            <ActivityIndicator testID="conversation-loading" size="small" color="#2563EB" className="mr-3" />
          )}
          {messages.length > 0 && (
            <Pressable
              testID="clear-chat-button"
              onPress={handleClearChat}
              className="py-1 px-2.5 rounded-lg border border-border-default bg-surface-card active:bg-surface-canvas"
            >
              <Text className="text-text-secondary font-sans text-[11px] font-medium">
                Clear Chat
              </Text>
            </Pressable>
          )}
        </View>
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
            className="text-text-tertiary font-sans text-xs text-center py-8 italic"
          >
            Type an expense, income, edit, or question to begin...
          </Text>
        ) : (
          messages.map(renderMessage)
        )}
      </ScrollView>

      {/* Input Bar */}
      <View className="flex-row items-center px-4 py-3 bg-surface-card border-t border-border-subtle shadow-sm">
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
          placeholderTextColor="#94A3B8"
          className="flex-1 bg-surface-canvas text-text-primary font-sans px-4 py-2.5 rounded-xl border border-border-default text-sm"
          onSubmitEditing={() => handleSendMessage(textRef.current)}
        />
        <Pressable
          testID="conversation-send-button"
          onPress={() => handleSendMessage(textRef.current)}
          disabled={loading}
          className={`ml-2 px-4 py-2.5 rounded-xl ${
            inputText.trim() && !loading ? 'bg-brand-blue active:bg-brand-blue-dark' : 'bg-surface-canvas border border-border-subtle opacity-50'
          }`}
        >
          <Text className={`font-sans font-semibold text-xs ${
            inputText.trim() && !loading ? 'text-white' : 'text-text-tertiary'
          }`}>
            Send
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

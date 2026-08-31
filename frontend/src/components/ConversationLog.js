import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { parseIntent, routeIntent, confirmAction } from '../api/client';

export default function ConversationLog({
  token,
  onTransactionMutated,
  initialMessages = [],
}) {
  const [inputText, setInputText] = useState('');
  const textRef = React.useRef(inputText);
  textRef.current = inputText;

  const [messages, setMessages] = useState(initialMessages);
  const [loading, setLoading] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);

  const handleSendMessage = async (explicitText = null) => {
    const raw = typeof explicitText === 'string' && explicitText.length > 0 ? explicitText : textRef.current;
    const text = (raw || '').trim();
    if (!text || loading) return;

    setInputText('');
    textRef.current = '';
    const userMsg = {
      id: String(Date.now()),
      sender: 'user',
      text,
    };
    setMessages((prev) => [...prev, userMsg]);

    // If there is a pending confirmation and user types "yes" / "confirm"
    if (pendingConfirmation && ['yes', 'confirm', 'sure', 'ok', 'aam'].includes(text.toLowerCase())) {
      await handleConfirmAction(pendingConfirmation);
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

      if (decision === 'EXECUTE') {
        let replyText = 'Done!';
        if (intent.action === 'add') {
          const amt = intent.fields.amount;
          const cat = intent.fields.category || 'expense';
          replyText = `Added ${cat} transaction for ₹${amt}.`;
        } else if (intent.action === 'query') {
          const count = routeRes.execution_result?.count ?? 0;
          replyText = `Found ${count} matching transactions.`;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: String(Date.now() + 1),
            sender: 'pappu',
            text: replyText,
          },
        ]);

        // Trigger live dashboard update!
        if (onTransactionMutated) {
          onTransactionMutated();
        }
      } else if (decision === 'ASK_CONFIRMATION') {
        const targetId = routeRes.matched_transactions?.[0];
        const prompt =
          routeRes.confirmation_prompt ||
          `Are you sure you want to ${intent.action} transaction ${targetId}?`;

        const confirmData = {
          transaction_id: targetId,
          action: intent.action,
          fields: intent.fields,
          target_transaction: routeRes.target_transaction,
        };

        setPendingConfirmation(confirmData);

        setMessages((prev) => [
          ...prev,
          {
            id: String(Date.now() + 1),
            sender: 'pappu',
            text: prompt,
            type: 'confirmation',
            confirmData,
          },
        ]);
        // DO NOT refresh dashboard yet (blocked per §6)
      } else if (decision === 'ASK_DISAMBIGUATION') {
        const prompt =
          routeRes.disambiguation_prompt ||
          'Multiple transactions match. Please select which one:';
        const candidates = routeRes.candidates || [];

        setMessages((prev) => [
          ...prev,
          {
            id: String(Date.now() + 1),
            sender: 'pappu',
            text: prompt,
            type: 'disambiguation',
            action: intent.action,
            fields: intent.fields,
            candidates,
          },
        ]);
        // DO NOT refresh dashboard yet (blocked per §6)
      } else if (decision === 'ASK_CLARIFICATION') {
        const prompt =
          routeRes.clarification_prompt ||
          'Please provide more details (amount, category, or date).';

        setMessages((prev) => [
          ...prev,
          {
            id: String(Date.now() + 1),
            sender: 'pappu',
            text: prompt,
            type: 'clarification',
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
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
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          sender: 'pappu',
          text: `Successfully executed ${confirmData.action}.`,
        },
      ]);

      // NOW trigger dashboard update!
      if (onTransactionMutated) {
        onTransactionMutated();
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          sender: 'pappu',
          text: `Failed to execute: ${err.message}`,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDisambiguationCandidate = (candidate, action, fields) => {
    const confirmData = {
      transaction_id: candidate.id,
      action,
      fields,
      target_transaction: candidate,
    };
    setPendingConfirmation(confirmData);

    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        sender: 'pappu',
        text: `Selected ₹${candidate.amount} (${candidate.category_name || 'txn'} on ${candidate.txn_date}). Confirm ${action}?`,
        type: 'confirmation',
        confirmData,
      },
    ]);
  };

  return (
    <View testID="conversation-container" className="flex-1 bg-slate-950 border-t border-slate-800">
      <View className="px-4 py-2 bg-slate-900/80 border-b border-slate-800 flex-row justify-between items-center">
        <Text className="text-slate-300 font-semibold text-xs uppercase tracking-wider">Conversation Log</Text>
        {loading && <ActivityIndicator testID="conversation-loading" size="small" color="#38bdf8" />}
      </View>

      {/* Message Stream */}
      <ScrollView testID="conversation-messages" className="flex-1 px-4 py-2">
        {messages.length === 0 ? (
          <Text testID="empty-conversation-text" className="text-slate-500 text-xs italic text-center py-6">
            Type an expense, income, edit, or question to begin...
          </Text>
        ) : (
          messages.map((msg) => (
            <View
              key={msg.id}
              testID={`message-${msg.id}`}
              className={`my-1.5 p-3 rounded-xl max-w-[85%] ${
                msg.sender === 'user'
                  ? 'bg-blue-600 self-end rounded-br-none'
                  : msg.isError
                  ? 'bg-red-950/80 border border-red-800 self-start rounded-bl-none'
                  : 'bg-slate-800 border border-slate-700 self-start rounded-bl-none'
              }`}
            >
              <Text
                className={`text-sm ${
                  msg.sender === 'user'
                    ? 'text-white font-medium'
                    : msg.isError
                    ? 'text-red-300'
                    : 'text-slate-200'
                }`}
              >
                {msg.text}
              </Text>

              {/* Confirmation Action Button */}
              {msg.type === 'confirmation' && msg.confirmData && (
                <Pressable
                  testID={`confirm-button-${msg.id}`}
                  onPress={() => handleConfirmAction(msg.confirmData)}
                  className="mt-2.5 bg-emerald-600 py-1.5 px-3 rounded-md self-start"
                >
                  <Text className="text-white text-xs font-semibold">✓ Confirm {msg.confirmData.action}</Text>
                </Pressable>
              )}

              {/* Disambiguation Candidates */}
              {msg.type === 'disambiguation' && msg.candidates && (
                <View className="mt-2">
                  {msg.candidates.map((cand) => (
                    <Pressable
                      key={cand.id}
                      testID={`disambig-candidate-${cand.id}`}
                      onPress={() =>
                        handleSelectDisambiguationCandidate(cand, msg.action, msg.fields)
                      }
                      className="bg-slate-700/80 p-2 rounded-md my-1 border border-slate-600"
                    >
                      <Text className="text-slate-200 text-xs font-medium">
                        {cand.category_name || 'Txn'} — ₹{cand.amount} ({cand.txn_date})
                      </Text>
                      {cand.description ? (
                        <Text className="text-slate-400 text-[10px]">{cand.description}</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Input Bar */}
      <View className="flex-row items-center p-3 bg-slate-900 border-t border-slate-800">
        <TextInput
          testID="conversation-input"
          value={inputText}
          onChangeText={(val) => {
            setInputText(val);
            textRef.current = val;
          }}
          placeholder="e.g. I spent 500 on food today"
          placeholderTextColor="#64748b"
          className="flex-1 bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-700 text-sm"
          onSubmitEditing={() => handleSendMessage(textRef.current)}
        />
        <Pressable
          testID="conversation-send-button"
          onPress={() => handleSendMessage(textRef.current)}
          disabled={loading}
          className={`ml-2 px-4 py-2.5 rounded-lg ${
            inputText.trim() && !loading ? 'bg-blue-600' : 'bg-slate-700 opacity-50'
          }`}
        >
          <Text className="text-white font-semibold text-xs">Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

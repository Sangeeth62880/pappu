import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import BottomSheet from './BottomSheet';
import MicButton from '../MicButton';
import ConfirmationCard from './ConfirmationCard';
import QueryDataCard from './QueryDataCard';
import Button from './Button';
import { colors, radius, shadows, spacing } from '../../theme/tokens';
import {
  parseIntent,
  routeIntent,
  confirmAction,
  synthesizeSpeech,
  saveChatMessage,
} from '../../api/client';
import { playAudioBase64 } from '../../utils/audioPlayer';

export default function VoiceListeningSheet({
  visible,
  onClose,
  token,
  onTransactionMutated,
}) {
  const [transcript, setTranscript] = useState('');
  const [statusText, setStatusText] = useState('Tap the microphone to speak');
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [queryResult, setQueryResult] = useState(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [disambigCandidates, setDisambigCandidates] = useState(null);
  const [error, setError] = useState(null);
  const [textInput, setTextInput] = useState('');

  // Reset state whenever the sheet is opened or closed
  useEffect(() => {
    if (visible) {
      setTranscript('');
      setStatusText('Tap the microphone to speak');
      setLoading(false);
      setResultMessage(null);
      setQueryResult(null);
      setPendingConfirmation(null);
      setDisambigCandidates(null);
      setError(null);
      setTextInput('');
    }
  }, [visible]);

  const speak = async (text, lang = 'en') => {
    if (!token || !text) return;
    try {
      const targetLang = lang === 'ml' ? 'ml-IN' : 'en-IN';
      const res = await synthesizeSpeech(token, text, targetLang);
      if (res?.audio_base64) {
        await playAudioBase64(res.audio_base64);
      }
    } catch (e) {
      console.warn('TTS playback error:', e);
    }
  };

  const handleProcessText = async (text) => {
    const query = (text || '').trim();
    if (!query || !token || loading) return;

    setTranscript(query);
    setStatusText('Processing with Pappu…');
    setLoading(true);
    setError(null);
    setResultMessage(null);
    setQueryResult(null);
    setPendingConfirmation(null);
    setDisambigCandidates(null);

    // Save user message to persistent history
    if (typeof saveChatMessage === 'function') {
      try {
        const p = saveChatMessage(token, { role: 'user', text: query });
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {}
    }

    try {
      const parseRes = await parseIntent(token, query);
      const intent = parseRes.intent;
      const lang = intent.language || 'en';

      const routeRes = await routeIntent(token, intent);
      const decision = routeRes.decision;

      if (decision === 'EXECUTE') {
        let reply = routeRes.spoken_response;
        if (!reply) {
          if (intent.action === 'add') {
            const amt = intent.fields?.amount;
            const cat = intent.fields?.category || 'expense';
            reply = `Added ${cat} for ₹${amt}.`;
          } else if (intent.action === 'query') {
            reply = 'Here is your data summary.';
          } else {
            reply = 'Done!';
          }
        }

        setResultMessage(reply);
        setStatusText('Done!');
        if (intent.action === 'query') {
          setQueryResult(routeRes.execution_result);
        }

        if (typeof saveChatMessage === 'function') {
          try {
            const p = saveChatMessage(token, {
              role: 'assistant',
              text: reply,
              payload: {
                queryResult: intent.action === 'query' ? routeRes.execution_result : null,
                isAddSuccess: intent.action === 'add',
                language: lang,
              },
            });
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch (e) {}
        }

        speak(reply, lang);

        if (onTransactionMutated) {
          onTransactionMutated();
        }
      } else if (decision === 'ASK_CONFIRMATION') {
        const prompt =
          routeRes.spoken_response ||
          routeRes.confirmation_prompt ||
          `Confirm ${intent.action}?`;

        const confirmData = {
          transaction_id: routeRes.matched_transactions?.[0] || null,
          action: intent.action,
          fields: intent.fields,
          target_transaction: routeRes.target_transaction,
          language: lang,
          prompt,
        };

        setPendingConfirmation(confirmData);
        setStatusText('Confirmation required');
        speak(prompt, lang);
      } else if (decision === 'ASK_DISAMBIGUATION') {
        setDisambigCandidates({
          candidates: routeRes.candidates || [],
          action: intent.action,
          fields: intent.fields,
          prompt: routeRes.disambiguation_prompt || 'Select matching item:',
        });
        setStatusText('Please select:');
      } else if (decision === 'ASK_CLARIFICATION') {
        const prompt = routeRes.clarification_prompt || 'Could you provide more details?';
        setResultMessage(prompt);
        setStatusText('Clarification needed');
        speak(prompt, lang);
      }
    } catch (err) {
      setError(err.message || 'Failed to process request');
      setStatusText('Error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (confirmData) => {
    if (!token || !confirmData) return;
    try {
      setLoading(true);
      await confirmAction(
        token,
        confirmData.transaction_id,
        confirmData.action,
        confirmData.fields
      );
      setPendingConfirmation(null);
      const reply = `Successfully executed ${confirmData.action}.`;
      setResultMessage(reply);
      setStatusText('Done!');

      if (typeof saveChatMessage === 'function') {
        try {
          const p = saveChatMessage(token, { role: 'assistant', text: reply });
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (e) {}
      }

      speak(reply, confirmData.language || 'en');

      if (onTransactionMutated) {
        onTransactionMutated();
      }
    } catch (err) {
      setError(err.message || 'Failed to execute confirmation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View testID="voice-listening-sheet" style={styles.container}>
        {/* Header */}
        <View style={styles.sheetHeader}>
          <View style={styles.headerTitleBox}>
            <View style={styles.botIconCircle}>
              <MaterialIcons name="auto-awesome" size={16} color={colors.brand.default} />
            </View>
            <Text style={styles.sheetTitle}>Voice Assistant</Text>
          </View>
          <TouchableOpacity
            testID="voice-sheet-close-button"
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close voice assistant"
          >
            <MaterialIcons name="close" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* Status Pill */}
        <View style={styles.statusRow}>
          <Text testID="voice-status-text" style={styles.statusText}>
            {statusText}
          </Text>
        </View>

        {/* Transcript / Spoken Preview */}
        {Boolean(transcript) && (
          <View style={styles.transcriptBox}>
            <Text style={styles.transcriptLabel}>You said:</Text>
            <Text testID="voice-transcript-text" style={styles.transcriptText}>
              "{transcript}"
            </Text>
          </View>
        )}

        {/* Interactive Center: Mic Button */}
        {!resultMessage && !pendingConfirmation && (
          <View style={styles.micCenterArea}>
            <View style={styles.micOuterCircle}>
              <MicButton
                token={token}
                onTranscribed={(txt) => handleProcessText(txt)}
                size={64}
                disabled={loading}
              />
            </View>
            <Text style={styles.micHelperText}>
              Speak in Malayalam, Manglish, or English
            </Text>
          </View>
        )}

        {/* Loading Spinner */}
        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={colors.brand.default} />
            <Text style={styles.loadingText}>Pappu is thinking…</Text>
          </View>
        )}

        {/* Error Banner */}
        {Boolean(error) && (
          <View style={styles.errorBox}>
            <MaterialIcons name="error-outline" size={18} color={colors.semantic.expense} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Confirmation Card */}
        {pendingConfirmation && (
          <View style={styles.cardContainer}>
            <ConfirmationCard
              prompt={pendingConfirmation.prompt}
              type="confirmation"
              targetTransaction={pendingConfirmation.target_transaction}
              actionLabel={pendingConfirmation.action}
              onConfirm={() => handleConfirm(pendingConfirmation)}
              secondaryAction={true}
              secondaryLabel="Cancel"
              onSecondaryAction={() => setPendingConfirmation(null)}
            />
          </View>
        )}

        {/* Disambiguation Candidates */}
        {disambigCandidates && (
          <View style={styles.cardContainer}>
            <ConfirmationCard
              prompt={disambigCandidates.prompt}
              type="disambiguation"
              candidates={disambigCandidates.candidates}
              actionLabel={disambigCandidates.action}
              onSelect={(cand) =>
                handleConfirm({
                  transaction_id: cand.id,
                  action: disambigCandidates.action,
                  fields: disambigCandidates.fields,
                  prompt: `Confirm ${disambigCandidates.action} for ₹${cand.amount}?`,
                })
              }
            />
          </View>
        )}

        {/* Result Success Message */}
        {resultMessage && (
          <View style={styles.successBox}>
            <View style={styles.successIconBadge}>
              <MaterialIcons name="check" size={20} color={colors.semantic.income} />
            </View>
            <Text testID="voice-result-message" style={styles.successText}>
              {resultMessage}
            </Text>
          </View>
        )}

        {/* Query Result Card */}
        {queryResult && <QueryDataCard result={queryResult} />}

        {/* Text fallback input row */}
        <View style={styles.textFallbackRow}>
          <TextInput
            testID="voice-fallback-input"
            style={styles.textInput}
            placeholder="Or type here… (e.g. Spent 250 on lunch)"
            placeholderTextColor={colors.text.tertiary}
            value={textInput}
            onChangeText={setTextInput}
            onSubmitEditing={() => {
              if (textInput.trim()) {
                handleProcessText(textInput);
                setTextInput('');
              }
            }}
          />
          <TouchableOpacity
            testID="voice-fallback-send"
            onPress={() => {
              if (textInput.trim()) {
                handleProcessText(textInput);
                setTextInput('');
              }
            }}
            style={styles.sendIconBtn}
            accessibilityLabel="Send typed text"
          >
            <MaterialIcons name="send" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Bottom Done / Close Button */}
        {resultMessage && (
          <Button
            testID="voice-sheet-done-btn"
            title="Done"
            variant="primary"
            onPress={onClose}
            style={{ marginTop: spacing.md }}
          />
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  botIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brand.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  statusRow: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  transcriptBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  transcriptLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 2,
  },
  transcriptText: {
    fontSize: 14,
    color: colors.text.primary,
    fontStyle: 'italic',
  },
  micCenterArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  micOuterCircle: {
    marginBottom: spacing.md,
  },
  micHelperText: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  loadingText: {
    marginLeft: spacing.sm,
    fontSize: 13,
    color: colors.brand.default,
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.semantic.expenseBg || '#FEE2E2',
    padding: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  errorText: {
    marginLeft: spacing.xs,
    fontSize: 13,
    color: colors.semantic.expense,
    flex: 1,
  },
  cardContainer: {
    marginBottom: spacing.md,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.semantic.incomeBg || '#ECFDF5',
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  successIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  successText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
  },
  textFallbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    paddingVertical: 6,
    paddingHorizontal: spacing.xs,
  },
  sendIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand.default,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
});

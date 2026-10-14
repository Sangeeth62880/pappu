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
import { colors, radius, spacing } from '../../theme/tokens';
import {
  synthesizeSpeech,
  sendAssistantMessage,
  answerPending,
} from '../../api/client';
import { generateUUID } from '../../utils/uuid';
import { playAudioBase64 } from '../../utils/audioPlayer';

function formatTime(date = new Date()) {
  try {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    return 'Just now';
  }
}

export default function VoiceListeningSheet({
  visible,
  onClose,
  token,
  onTransactionMutated,
  setMessages = null,
}) {
  const [transcript, setTranscript] = useState('');
  const [statusText, setStatusText] = useState('Tap the microphone to speak');
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [queryResult, setQueryResult] = useState(null);
  const [v2Pending, setV2Pending] = useState(null);
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
      setV2Pending(null);
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
    setStatusText('Processing with Pappu');
    setLoading(true);
    setError(null);
    setResultMessage(null);
    setQueryResult(null);
    setV2Pending(null);

    const clientMsgId = generateUUID();
    const nowTime = formatTime();

    // Append user message to persistent chat history
    if (typeof setMessages === 'function') {
      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          sender: 'user',
          text: query,
          client_msg_id: clientMsgId,
          timestamp: nowTime,
        },
      ]);
    }

    try {
      const res = await sendAssistantMessage(token, {
        text: query,
        input: 'voice',
        client_msg_id: clientMsgId,
      });

      const reply = res.display_text || res.reply_text || res.spoken_text || 'Done';
      setResultMessage(reply);
      setStatusText('Done');

      if (res.pending && res.pending.id) {
        setV2Pending(res.pending);
        setStatusText('Action pending');
      }

      const qRes = Array.isArray(res.results)
        ? res.results.find((r) => r && (r.kind === 'balances' || r.kind === 'sum' || r.kind === 'list' || r.kind === 'compare' || r.kind === 'query'))
        : null;
      if (qRes) {
        setQueryResult(qRes);
      }

      // Append to chat history
      if (typeof setMessages === 'function') {
        setMessages((prev) => [
          ...prev,
          {
            id: `pappu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            sender: 'pappu',
            text: reply,
            spoken_text: res.spoken_text,
            results: res.results || [],
            pending: res.pending || null,
            client_msg_id: clientMsgId,
            timestamp: nowTime,
          },
        ]);
      }

      // TTS speaks spoken_text only
      if (res.spoken_text) {
        speak(res.spoken_text, 'en');
      }

      if (res.changed && onTransactionMutated) {
        onTransactionMutated();
      }
    } catch (err) {
      setError(err.message || 'Failed to process request');
      setStatusText('Error');
    } finally {
      setLoading(false);
    }

  };

  const handleV2Answer = async (pendingId, answer, index = null) => {
    if (!token || !pendingId) return;
    try {
      setLoading(true);
      const res = await answerPending(token, pendingId, answer, index);
      const reply = res.display_text || res.reply_text || res.spoken_text || 'Action confirmed.';
      setResultMessage(reply);
      setStatusText('Done');
      setV2Pending(res.pending || null);

      if (typeof setMessages === 'function') {
        setMessages((prev) => [
          ...prev,
          {
            id: `pappu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            sender: 'pappu',
            text: reply,
            spoken_text: res.spoken_text,
            results: res.results || [],
            pending: res.pending || null,
            timestamp: formatTime(),
          },
        ]);
      }

      // TTS speaks spoken_text only
      if (res.spoken_text) {
        speak(res.spoken_text, 'en');
      }

      if (res.changed && onTransactionMutated) {
        onTransactionMutated();
      }
    } catch (err) {
      setError(err.message || 'Failed to answer pending action');
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
        {!resultMessage && !v2Pending && (
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
            <Text style={styles.loadingText}>Pappu is thinking</Text>
          </View>
        )}

        {/* Error Banner */}
        {Boolean(error) && (
          <View style={styles.errorBox}>
            <MaterialIcons name="error-outline" size={18} color={colors.semantic.expense} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* v2 Pending Card */}
        {v2Pending && (() => {
          const promptText = v2Pending.question || v2Pending.summary || 'Confirmation required';
          const kind = v2Pending.kind || v2Pending.action_type;
          const isDisambiguate =
            kind === 'disambiguate' ||
            (!kind && v2Pending.candidates && v2Pending.candidates.length > 1) ||
            (kind !== 'confirm' && kind !== 'contact_confirm' && v2Pending.candidates && v2Pending.candidates.length > 1);

          if (isDisambiguate) {
            return (
              <View style={styles.cardContainer}>
                <ConfirmationCard
                  prompt={promptText}
                  type="disambiguation"
                  candidates={v2Pending.candidates}
                  onSelect={(cand, idx) =>
                    handleV2Answer(
                      v2Pending.id,
                      typeof cand === 'string' ? cand : (cand.id || cand.name || 'choose'),
                      idx
                    )
                  }
                  actionLabel="Yes"
                  onConfirm={() => handleV2Answer(v2Pending.id, 'yes', 0)}
                  secondaryAction={true}
                  secondaryLabel="No"
                  onSecondaryAction={() => handleV2Answer(v2Pending.id, 'no')}
                />
              </View>
            );
          }

          if (kind === 'contact_confirm') {
            return (
              <View style={styles.cardContainer}>
                <ConfirmationCard
                  prompt={promptText}
                  type="confirmation"
                  actionLabel="Yes"
                  onConfirm={() => handleV2Answer(v2Pending.id, 'yes', 0)}
                  secondaryAction={true}
                  secondaryLabel="No"
                  onSecondaryAction={() => handleV2Answer(v2Pending.id, 'no')}
                />
              </View>
            );
          }

          const isDelete =
            kind === 'delete' ||
            (promptText || '').toLowerCase().includes('delete');
          const targetTxn =
            v2Pending.target_transaction ||
            (v2Pending.candidates && v2Pending.candidates.length === 1 ? v2Pending.candidates[0] : null);

          return (
            <View style={styles.cardContainer}>
              <ConfirmationCard
                prompt={promptText}
                type="confirmation"
                targetTransaction={targetTxn}
                actionLabel={isDelete ? 'delete' : (kind || 'confirm')}
                onConfirm={() => handleV2Answer(v2Pending.id, 'confirm')}
                secondaryAction={true}
                secondaryLabel="Cancel"
                onSecondaryAction={() => handleV2Answer(v2Pending.id, 'cancel')}
              />
            </View>
          );
        })()}


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
            placeholder="Or type here (e.g. Spent 250 on lunch)"
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
    textAlign: 'center',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.semantic.expense,
    marginBottom: spacing.md,
  },
  errorText: {
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
    gap: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
  successIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.semantic.incomeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: '500',
    flex: 1,
  },
  textFallbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text.primary,
  },
  sendIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brand.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

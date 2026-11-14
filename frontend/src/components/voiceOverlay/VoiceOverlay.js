import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import { Linking } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import VoiceOverlayView from './VoiceOverlayView';
import {
  overlayReducer,
  initialOverlayState,
  hasPending,
  normalizeLevel,
  overlayVisual,
  AUTO_DISMISS_MS,
  PHASES,
} from './overlayMachine';
import { hapticTick } from '../../utils/haptics';
import { useVoiceRecorder } from '../../utils/useVoiceRecorder';
import { useReduceMotion } from '../../utils/reduceMotion';
import { playAudioBase64, stopAudio } from '../../utils/audioPlayer';
import { ttsLanguageCode } from '../../utils/ttsLanguage';
import { generateUUID } from '../../utils/uuid';
import {
  sendAssistantMessage,
  answerPending,
  synthesizeSpeech,
  undoTransaction,
  fetchProfile,
  isStillProcessingError,
} from '../../api/client';
import { queryClient } from '../../data/queryClient';
import { queryKeys } from '../../data/queryKeys';

// If the exit animation never reports back, close anyway after this long.
const EXIT_FALLBACK_MS = 400;

function cachedLanguage() {
  const lang = queryClient.getQueryData(queryKeys.profile())?.language;
  return lang === 'ml' ? 'ml' : 'en';
}

function sendErrorKind(err) {
  if (isStillProcessingError(err)) return 'processing';
  if (/network request failed|failed to fetch|network/i.test(String(err?.message || ''))) {
    return 'network';
  }
  return 'server';
}

/**
 * One voice overlay session, from summon to dismiss: records hands-free (the same
 * useVoiceRecorder as MicButton), sends the transcript to /assistant/message with a
 * fresh client_msg_id, speaks the reply in its language, shows the result and leaves.
 * A pending confirmation gets one more listen for a spoken answer.
 */
export default function VoiceOverlay({ token, onTransactionMutated, onClosed }) {
  const reduceMotion = useReduceMotion();
  const [state, dispatch] = useReducer(overlayReducer, undefined, () =>
    initialOverlayState(cachedLanguage())
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const level = useSharedValue(0);

  const mountedRef = useRef(true);
  const closingRef = useRef(false);
  const finishedRef = useRef(false);
  const ownsAudioRef = useRef(false);
  const answeredRef = useRef(new Set());
  const exitTimerRef = useRef(null);
  const live = () => mountedRef.current && !closingRef.current;

  const sendRef = useRef(null);
  const recorder = useVoiceRecorder({
    token,
    logTag: '[VoiceOverlay]',
    onRecordingStateChange: (recording) => {
      if (!live()) return;
      dispatch({ type: recording ? 'RECORDING_STARTED' : 'RECORDING_STOPPED' });
      if (!recording) level.value = withTiming(0, { duration: 150 });
    },
    onLevel: (db) => {
      level.value = withTiming(normalizeLevel(db), { duration: 120 });
    },
    onTranscribed: (text) => {
      if (!live()) return;
      dispatch({ type: 'TRANSCRIPT', text });
      sendRef.current(text, generateUUID());
    },
    onError: (err) => {
      if (!live()) return;
      const kind = err?.kind === 'auth' || err?.kind === 'stop' ? 'stt' : err?.kind;
      dispatch({ type: 'ERROR', kind, retry: 'listen' });
    },
  });
  // Async steps finish renders later; they must start the recorder from the latest one.
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const dataChanged = () => {
    [queryKeys.summary(), queryKeys.people(), queryKeys.transactions(), queryKeys.chatHistory()].forEach(
      (queryKey) => queryClient.invalidateQueries({ queryKey })
    );
    if (onTransactionMutated) onTransactionMutated();
  };

  const listen = () => recorderRef.current.start({ auto: true });

  // After the reply finished speaking: listen once more for a confirmation answer.
  const afterSpeaking = (res) => {
    const pendingId = res?.pending?.id;
    if (!pendingId || answeredRef.current.has(pendingId)) return;
    if (stateRef.current.relistensLeft <= 0) return;
    dispatch({ type: 'RELISTEN' });
    listen();
  };

  const speak = async (res) => {
    try {
      const tts = await synthesizeSpeech(token, res.spoken_text, ttsLanguageCode(res));
      if (!live()) return;
      if (tts?.audio_base64) {
        ownsAudioRef.current = true;
        dispatch({ type: 'AUDIO_PLAYING', playing: true });
        await playAudioBase64(tts.audio_base64, { waitUntilFinished: true });
        ownsAudioRef.current = false;
      }
    } catch (err) {
      console.warn('[VoiceOverlay] TTS playback failed:', err);
    }
    if (!live()) return;
    dispatch({ type: 'SPEAKING_DONE' });
    afterSpeaking(res);
  };

  const handleReply = (res) => {
    dispatch({ type: 'REPLY', res });
    if (res?.changed) dataChanged();
    if (res?.spoken_text) speak(res);
    else afterSpeaking(res);
  };

  sendRef.current = async (text, clientMsgId) => {
    dispatch({ type: 'SENDING', send: { text, clientMsgId } });
    try {
      const res = await sendAssistantMessage(token, {
        text,
        input: 'voice',
        client_msg_id: clientMsgId,
      });
      if (!live()) return;
      handleReply(res || {});
    } catch (err) {
      if (!live()) return;
      dispatch({ type: 'ERROR', kind: sendErrorKind(err), retry: 'resend' });
    }
  };

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearTimeout(exitTimerRef.current);
    if (onClosed) onClosed();
  }, [onClosed]);

  // Every way out (close, back, scrim, swipe, auto): drop audio, stop speech, animate out.
  const dismiss = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    recorderRef.current.cancel();
    if (ownsAudioRef.current) stopAudio();
    dispatch({ type: 'DISMISS' });
    exitTimerRef.current = setTimeout(finish, EXIT_FALLBACK_MS);
  }, [finish]);

  // Summon: a light tick, start listening right away, pick up the profile language.
  useEffect(() => {
    hapticTick('summon');
    listen();
    if (queryClient.getQueryData(queryKeys.profile()) === undefined && token) {
      Promise.resolve()
        .then(() => fetchProfile(token))
        .then((profile) => {
          if (live() && profile?.language) dispatch({ type: 'LANG', lang: profile.language });
        })
        .catch(() => {});
    }
    return () => {
      mountedRef.current = false;
      clearTimeout(exitTimerRef.current);
      if (ownsAudioRef.current) stopAudio();
    };
  }, []);

  // A tick for a successful result or an error (once per state reached).
  useEffect(() => {
    if (state.phase === PHASES.error) hapticTick('error');
    else if (state.phase === PHASES.result && overlayVisual(state).reaction === 'celebrate') {
      hapticTick('success');
    }
  }, [state.phase, state.reply]);

  // Leave on its own a moment after the result, unless touched or waiting for an answer.
  useEffect(() => {
    if (state.phase !== PHASES.result || state.pinned || state.answering || hasPending(state)) {
      return undefined;
    }
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [state.phase, state.pinned, state.answering, state.reply, dismiss]);

  const retry = () => {
    const { error, lastSend } = stateRef.current;
    if (error?.retry === 'resend' && lastSend) {
      dispatch({ type: 'RETRY', resend: true });
      sendRef.current(lastSend.text, lastSend.clientMsgId);
    } else {
      dispatch({ type: 'RETRY' });
      listen();
    }
  };

  const answer = async (value, index = null) => {
    const pending = stateRef.current.reply?.pending;
    if (!pending?.id) return;
    answeredRef.current.add(pending.id);
    recorderRef.current.cancel();
    if (ownsAudioRef.current) stopAudio();
    dispatch({ type: 'SENDING' });
    try {
      const res = await answerPending(token, pending.id, value, index);
      if (!live()) return;
      handleReply(res || {});
    } catch (err) {
      if (!live()) return;
      dispatch({ type: 'ERROR', kind: sendErrorKind(err), retry: 'listen' });
    }
  };

  const undo = async () => {
    try {
      await undoTransaction(token);
      if (!live()) return;
      dispatch({ type: 'UNDONE' });
      dataChanged();
    } catch (_e) {
      if (live()) dispatch({ type: 'UNDO_FAILED' });
    }
  };

  return (
    <VoiceOverlayView
      state={state}
      level={level}
      reduceMotion={reduceMotion}
      onClose={dismiss}
      onExited={finish}
      onRetry={retry}
      onOpenSettings={() => Linking.openSettings?.()}
      onUndo={undo}
      onAnswer={answer}
      onSelectCandidate={(cand, idx) =>
        answer(typeof cand === 'string' ? cand : cand?.id || cand?.name || 'choose', idx)
      }
      onTalkAgain={() => {
        dispatch({ type: 'RETRY' });
        listen();
      }}
      onPin={() => dispatch({ type: 'PIN' })}
    />
  );
}

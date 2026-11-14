import React, { useEffect } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  cancelAnimation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import Pappu from '../ui/Pappu';
import IconButton from '../ui/IconButton';
import Button from '../ui/Button';
import AmountText, { formatAmount } from '../ui/AmountText';
import ConfirmationCard from '../ui/ConfirmationCard';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { t, isMalayalamText } from '../../i18n/strings';
import {
  PHASES,
  transactionRows,
  budgetAlertOf,
  hasPending,
  overlayVisual,
} from './overlayMachine';

const MASCOT_SIZE = 132;
const HALO_SIZE = MASCOT_SIZE + 44;
// Springy, tactile entrance: settles in about 350ms with a small overshoot.
const SUMMON_SPRING = { damping: 12, stiffness: 190, mass: 0.9 };
const EXIT_MS = 180;
const DISMISS_DRAG = 110;

// Malayalam text uses Noto Sans Malayalam with taller lines (no clipped conjuncts);
// everything else keeps Nunito. Picked per text, so a Malayalam transcript renders
// right even in an English session.
const bodyFont = (text) => (isMalayalamText(text) ? typography.malayalam_body : null);
const captionFont = (text) => (isMalayalamText(text) ? typography.malayalam_caption : null);
// Button labels stay in Baloo Chettan 2 (it has Malayalam glyphs) with the Malayalam line height.
const labelFont = (lang) => (lang === 'ml' ? { lineHeight: typography.malayalam_h2.lineHeight } : null);

function replyText(reply) {
  return reply?.display_text || reply?.reply_text || reply?.spoken_text || '';
}

/** Ring around the coin: live mic level while listening, orbiting dots while thinking. */
function Halo({ kind, level, reduceMotion }) {
  const breath = useSharedValue(0);
  const spin = useSharedValue(0);
  const fallbackLevel = useSharedValue(0);
  const liveLevel = level || fallbackLevel;

  useEffect(() => {
    if (reduceMotion || kind === 'none') return undefined;
    if (kind === 'level') {
      // Gentle breathing under the live level, so the ring is alive even in silence
      // (and on platforms without meter readings).
      breath.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
    } else if (kind === 'dots') {
      spin.value = withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1, false);
    }
    return () => {
      cancelAnimation(breath);
      cancelAnimation(spin);
      breath.value = 0;
      spin.value = 0;
    };
  }, [kind, reduceMotion]);

  const ringStyle = useAnimatedStyle(
    () =>
      reduceMotion
        ? { transform: [{ scale: 1 }], opacity: 0.7 }
        : {
            transform: [{ scale: 1 + liveLevel.value * 0.32 + breath.value * 0.05 }],
            opacity: 0.45 + liveLevel.value * 0.45,
          },
    [reduceMotion]
  );
  const dotsStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  if (kind === 'none') return null;
  const suffix = reduceMotion ? '-static' : '';
  if (kind === 'dots') {
    return (
      <Animated.View
        testID={`voice-overlay-halo-dots${suffix}`}
        pointerEvents="none"
        style={[styles.halo, dotsStyle]}
      >
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.orbitDot,
              { transform: [{ rotate: `${i * 120}deg` }, { translateY: -HALO_SIZE / 2 + 6 }] },
            ]}
          />
        ))}
      </Animated.View>
    );
  }
  return (
    <Animated.View
      testID={`voice-overlay-halo-level${suffix}`}
      pointerEvents="none"
      style={[styles.halo, styles.ring, ringStyle]}
    />
  );
}

function TransactionCard({ state, lang, onUndo }) {
  const rows = transactionRows(state.reply);
  const alert = budgetAlertOf(state.reply);
  if (!rows.length && !alert) return null;
  const titles = { add: 'overlay.added', edit: 'overlay.changed', delete: 'overlay.deleted' };
  const alertText = !alert
    ? null
    : alert.alert === 'over'
    ? t('overlay.budgetOver', lang, {
        cat: alert.category,
        spent: `₹${formatAmount(alert.spent)}`,
        budget: `₹${formatAmount(alert.budget)}`,
      })
    : t('overlay.budgetNear', lang, { cat: alert.category, pct: alert.percent });

  return (
    <View testID="voice-overlay-result-card" style={styles.card}>
      {rows.map((row, i) => (
        <View key={i} style={styles.txnRow}>
          <View style={styles.txnText}>
            <Text style={[styles.cardLabel, captionFont(t(titles[row.action], lang))]}>
              {t(titles[row.action], lang)}
            </Text>
            <Text style={[styles.cardBody, bodyFont([row.category, row.person].join(' '))]}>
              {[row.category, row.person].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <AmountText amount={row.amount} type={row.type} size="md" />
        </View>
      ))}

      {alert ? (
        <View testID="voice-overlay-budget-alert" style={styles.alertRow}>
          <Feather name="alert-triangle" size={16} color={colors.warning} />
          <Text style={[styles.cardBody, styles.alertText, bodyFont(alertText)]}>{alertText}</Text>
        </View>
      ) : null}

      {rows.length ? (
        state.undone ? (
          <Text testID="voice-overlay-undone" style={[styles.cardBody, bodyFont(t('overlay.undone', lang))]}>
            {t('overlay.undone', lang)}
          </Text>
        ) : (
          <>
            {state.undoFailed ? (
              <Text style={[styles.cardBody, styles.errorText, bodyFont(t('overlay.undoFailed', lang))]}>
                {t('overlay.undoFailed', lang)}
              </Text>
            ) : null}
            <Button
              testID="voice-overlay-undo"
              title={t('overlay.undo', lang)}
              variant="secondary"
              size="dialog"
              textStyle={labelFont(lang)}
              onPress={onUndo}
            />
          </>
        )
      ) : null}
    </View>
  );
}

function PendingCard({ pending, lang, onAnswer, onSelectCandidate }) {
  const kind = pending.kind || pending.action_type;
  const candidates = pending.candidates || [];
  if (kind === 'disambiguate' || kind === 'disambiguation' || candidates.length > 1) {
    return (
      <View testID="voice-overlay-pending">
        <ConfirmationCard
          prompt={pending.question || pending.summary || ''}
          type="disambiguation"
          candidates={candidates}
          onSelect={onSelectCandidate}
          secondaryAction
          secondaryLabel={t('overlay.no', lang)}
          onSecondaryAction={() => onAnswer('no')}
        />
      </View>
    );
  }
  const contact = kind === 'contact_confirm';
  return (
    <View testID="voice-overlay-pending" style={[styles.card, styles.buttonRow]}>
      <Button
        testID="voice-overlay-no"
        title={t('overlay.no', lang)}
        variant="secondary"
        size="dialog"
        textStyle={labelFont(lang)}
        style={styles.flexButton}
        onPress={() => onAnswer(contact ? 'no' : 'cancel')}
      />
      <Button
        testID="voice-overlay-yes"
        title={t('overlay.yes', lang)}
        variant="primary"
        size="dialog"
        textStyle={labelFont(lang)}
        style={styles.flexButton}
        onPress={() => onAnswer(contact ? 'yes' : 'confirm', contact ? 0 : null)}
      />
    </View>
  );
}

function ErrorCard({ error, lang, onRetry, onOpenSettings }) {
  return (
    <View testID={`voice-overlay-error-${error.kind}`} style={styles.card}>
      <Text style={[styles.cardBody, bodyFont(t(`overlay.error.${error.kind}`, lang))]}>
        {t(`overlay.error.${error.kind}`, lang)}
      </Text>
      <View style={styles.buttonRow}>
        {error.kind === 'permission' && onOpenSettings ? (
          <Button
            testID="voice-overlay-settings"
            title={t('overlay.settings', lang)}
            variant="secondary"
            size="dialog"
            textStyle={labelFont(lang)}
            style={styles.flexButton}
            onPress={onOpenSettings}
          />
        ) : null}
        <Button
          testID="voice-overlay-retry"
          title={t('overlay.retry', lang)}
          variant="primary"
          size="dialog"
          textStyle={labelFont(lang)}
          style={styles.flexButton}
          onPress={onRetry}
        />
      </View>
    </View>
  );
}

/**
 * Presentational voice overlay: a transparent modal over the current screen with a
 * cream scrim and Pappu in the lower half. Everything it shows comes from `state`
 * (overlayMachine), so the styleguide can render any state without the backend.
 * Animations are Reanimated worklets on the UI thread.
 */
export default function VoiceOverlayView({
  state,
  level = null,
  reduceMotion = false,
  onClose,
  onExited,
  onRetry,
  onOpenSettings,
  onUndo,
  onAnswer,
  onSelectCandidate,
  onTalkAgain,
  onPin,
  testID = 'voice-overlay',
}) {
  const visual = overlayVisual(state);
  const { phase, lang, reply, error } = state;

  const scrim = useSharedValue(0);
  const enter = useSharedValue(0);
  const dragY = useSharedValue(0);
  const talk = useSharedValue(0);
  const pop = useSharedValue(1);
  const shakeX = useSharedValue(0);

  // Summon: scrim fades in, Pappu rises and scales in with a springy overshoot.
  useEffect(() => {
    scrim.value = withTiming(1, { duration: reduceMotion ? 150 : 220 });
    enter.value = reduceMotion ? withTiming(1, { duration: 150 }) : withSpring(1, SUMMON_SPRING);
    return () => {
      [scrim, enter, dragY, talk, pop, shakeX].forEach((v) => cancelAnimation(v));
    };
  }, []);

  // Dismiss: a quick ease-in shrink, then onExited.
  useEffect(() => {
    if (phase !== PHASES.dismissing) return;
    const exited = () => onExited && onExited();
    scrim.value = withTiming(0, { duration: EXIT_MS });
    enter.value = withTiming(0, { duration: EXIT_MS, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) runOnJS(exited)();
    });
  }, [phase]);

  // Talking bounce while the reply audio plays.
  useEffect(() => {
    if (state.audioPlaying && !reduceMotion) {
      talk.value = withRepeat(
        withSequence(withTiming(-6, { duration: 150 }), withTiming(0, { duration: 150 })),
        -1,
        false
      );
    } else {
      cancelAnimation(talk);
      talk.value = withTiming(0, { duration: 120 });
    }
  }, [state.audioPlaying, reduceMotion]);

  // One-off reactions: a celebratory bounce on success, a gentle shake on error.
  useEffect(() => {
    if (reduceMotion || (phase !== PHASES.result && phase !== PHASES.error)) return;
    if (visual.reaction === 'celebrate') {
      pop.value = withSequence(withSpring(1.12, { damping: 6, stiffness: 320 }), withSpring(1));
    } else if (visual.reaction === 'shake') {
      shakeX.value = withSequence(
        withTiming(-9, { duration: 50 }),
        withRepeat(withTiming(9, { duration: 90 }), 4, true),
        withTiming(0, { duration: 50 })
      );
    }
  }, [phase, visual.reaction, reduceMotion]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const mascotStyle = useAnimatedStyle(
    () =>
      reduceMotion
        ? { opacity: enter.value, transform: [{ translateY: dragY.value }] }
        : {
            opacity: Math.min(1, enter.value * 2),
            transform: [
              { translateY: (1 - enter.value) * 160 + dragY.value + talk.value },
              { translateX: shakeX.value },
              { scale: (0.6 + 0.4 * enter.value) * pop.value },
            ],
          },
    [reduceMotion]
  );
  const stackStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: dragY.value }],
  }));

  // Swipe down on Pappu dismisses; a short drag springs back.
  const close = () => onClose && onClose();
  const swipe = Gesture.Pan()
    .withTestId('voice-overlay-swipe')
    .activeOffsetY(12)
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DRAG || e.velocityY > 900) {
        runOnJS(close)();
      } else {
        dragY.value = withSpring(0);
      }
    });

  const showStatus = phase === PHASES.summon || phase === PHASES.listening || phase === PHASES.thinking;
  const statusText =
    phase === PHASES.thinking ? t('overlay.thinking', lang) : t('overlay.listening', lang);
  const text = replyText(reply);
  const showReply = Boolean(reply) && (phase === PHASES.speaking || phase === PHASES.result || state.answering);
  const pending = hasPending(state) ? reply.pending : null;
  const clarify = phase === PHASES.result && String(reply?.mood || '') === 'confused' && !pending;

  return (
    <Modal
      testID={testID}
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          <Pressable
            testID="voice-overlay-scrim"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('overlay.close', lang)}
          >
            {/* A soft blur is cheap on iOS; Android gets the tinted scrim only. */}
            {Platform.OS === 'ios' ? (
              <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
            ) : null}
            <View style={[StyleSheet.absoluteFill, styles.scrim]} />
          </Pressable>
        </Animated.View>

        {/* Native safe area view: no provider needed, measures inside the modal window. */}
        <SafeAreaView pointerEvents="box-none" style={styles.content}>
          <View style={styles.topBar} pointerEvents="box-none">
            <IconButton
              testID="voice-overlay-close"
              variant="outline"
              onPress={onClose}
              accessibilityLabel={t('overlay.close', lang)}
              icon={<Feather name="x" size={20} color={colors.ink} />}
            />
          </View>

          <Animated.View style={[styles.stackWrap, stackStyle]} pointerEvents="box-none">
            {/* Any touch on the cards pins the overlay (no auto dismiss). */}
            <View testID="voice-overlay-stack" onTouchStart={onPin}>
            <ScrollView
              style={styles.stack}
              contentContainerStyle={styles.stackContent}
              keyboardShouldPersistTaps="handled"
            >
              {state.transcript ? (
                <Text
                  testID="voice-overlay-transcript"
                  style={[styles.transcript, bodyFont(state.transcript)]}
                >
                  “{state.transcript}”
                </Text>
              ) : null}

              {showReply && text ? (
                <View testID="voice-overlay-reply" style={styles.bubble}>
                  <Text style={[styles.bubbleText, bodyFont(text)]}>{text}</Text>
                  <View style={styles.bubbleTail} />
                </View>
              ) : null}

              {showReply ? <TransactionCard state={state} lang={lang} onUndo={onUndo} /> : null}

              {showReply && pending ? (
                <PendingCard
                  pending={pending}
                  lang={lang}
                  onAnswer={onAnswer}
                  onSelectCandidate={onSelectCandidate}
                />
              ) : null}

              {clarify && onTalkAgain ? (
                <Button
                  testID="voice-overlay-talk-again"
                  title={t('overlay.talkAgain', lang)}
                  variant="secondary"
                  size="dialog"
                  textStyle={labelFont(lang)}
                  onPress={onTalkAgain}
                />
              ) : null}

              {phase === PHASES.error && error ? (
                <ErrorCard
                  error={error}
                  lang={lang}
                  onRetry={onRetry}
                  onOpenSettings={onOpenSettings}
                />
              ) : null}
            </ScrollView>
            </View>
          </Animated.View>

          <GestureDetector gesture={swipe}>
            <Animated.View testID="voice-overlay-mascot-area" style={[styles.mascotArea, mascotStyle]}>
              <Halo kind={visual.halo} level={level} reduceMotion={reduceMotion} />
              {/* mood accepts every pose (state only takes listening/thinking/speaking). */}
              <Pappu
                mood={visual.pose}
                size={MASCOT_SIZE}
                autoSleepy={false}
                blinkInListening
                testID="voice-overlay-mascot"
              />
            </Animated.View>
          </GestureDetector>

          {showStatus ? (
            <Text testID="voice-overlay-status" style={[styles.status, captionFont(statusText)]}>
              {statusText}
            </Text>
          ) : (
            <View style={styles.statusSpacer} />
          )}
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    backgroundColor: 'rgba(255, 248, 231, 0.88)',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  stackWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  stack: {
    flexGrow: 0,
  },
  stackContent: {
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  transcript: {
    ...typography.body_main,
    color: colors.ink_muted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bubbleText: {
    ...typography.body_main,
    color: colors.ink,
  },
  bubbleTail: {
    position: 'absolute',
    bottom: -9,
    alignSelf: 'center',
    width: 16,
    height: 16,
    backgroundColor: colors.surface,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.border,
    transform: [{ rotate: '45deg' }],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  txnText: {
    flex: 1,
    gap: 2,
  },
  cardLabel: {
    ...typography.caption_bold,
    color: colors.ink_muted,
  },
  cardBody: {
    ...typography.body_main,
    color: colors.ink,
    flexShrink: 1,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  alertText: {
    flex: 1,
  },
  errorText: {
    color: colors.expense,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flexButton: {
    flex: 1,
  },
  mascotArea: {
    alignItems: 'center',
    justifyContent: 'center',
    height: HALO_SIZE + spacing.md,
  },
  halo: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderWidth: 4,
    borderColor: colors.gold,
    backgroundColor: 'rgba(255, 200, 61, 0.14)',
  },
  orbitDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.gold_edge,
  },
  status: {
    ...typography.caption_bold,
    color: colors.ink_muted,
    textAlign: 'center',
    minHeight: 24,
  },
  statusSpacer: {
    height: 24,
  },
});

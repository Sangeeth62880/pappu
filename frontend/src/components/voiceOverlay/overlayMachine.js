/**
 * Voice overlay state machine (pure, no React).
 *
 *   summon -> listening -> thinking -> speaking -> result -> dismissing
 *                  ^                                 |
 *                  +---- one re-listen while a confirmation is pending
 *   any step -> error -> (Retry) listening, or thinking when the send is repeated
 */
export const PHASES = {
  summon: 'summon',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  result: 'result',
  error: 'error',
  dismissing: 'dismissing',
};

export const ERROR_KINDS = ['permission', 'empty', 'stt', 'network', 'processing', 'server'];

// Auto dismiss this long after the reply has finished speaking.
export const AUTO_DISMISS_MS = 2500;

export function initialOverlayState(lang = 'en') {
  return {
    phase: PHASES.summon,
    lang,
    transcript: '',
    reply: null,
    audioPlaying: false,
    error: null,
    lastSend: null,
    answering: false,
    relistensLeft: 1,
    pinned: false,
    undone: false,
    undoFailed: false,
  };
}

function replyLang(res, fallback) {
  const code = String(res?.language_code || res?.language || '').toLowerCase();
  if (code.startsWith('ml') || code === 'malayalam') return 'ml';
  if (code.startsWith('en')) return 'en';
  return fallback;
}

export function overlayReducer(state, action) {
  switch (action.type) {
    case 'LANG':
      return state.reply ? state : { ...state, lang: action.lang };
    case 'RECORDING_STARTED':
      return { ...state, phase: PHASES.listening, error: null };
    case 'RECORDING_STOPPED':
      return state.phase === PHASES.listening ? { ...state, phase: PHASES.thinking } : state;
    case 'TRANSCRIPT':
      return { ...state, phase: PHASES.thinking, transcript: action.text, error: null };
    case 'SENDING':
      return {
        ...state,
        phase: PHASES.thinking,
        error: null,
        lastSend: action.send || state.lastSend,
      };
    case 'REPLY': {
      const res = action.res || {};
      return {
        ...state,
        phase: res.spoken_text ? PHASES.speaking : PHASES.result,
        reply: res,
        lang: replyLang(res, state.lang),
        audioPlaying: false,
        error: null,
        answering: false,
        undone: false,
        undoFailed: false,
      };
    }
    case 'AUDIO_PLAYING':
      return { ...state, audioPlaying: action.playing };
    case 'SPEAKING_DONE':
      return state.phase === PHASES.speaking
        ? { ...state, phase: PHASES.result, audioPlaying: false }
        : state;
    case 'RELISTEN':
      return { ...state, answering: true, relistensLeft: state.relistensLeft - 1 };
    case 'ERROR':
      return {
        ...state,
        phase: PHASES.error,
        audioPlaying: false,
        answering: false,
        error: {
          kind: ERROR_KINDS.includes(action.kind) ? action.kind : 'server',
          // A failed send is repeated with the same client_msg_id (no duplicate rows).
          retry: action.retry || 'listen',
        },
      };
    case 'RETRY':
      return { ...state, error: null, phase: action.resend ? PHASES.thinking : PHASES.summon };
    case 'PIN':
      return state.pinned ? state : { ...state, pinned: true };
    case 'UNDONE':
      return { ...state, undone: true, undoFailed: false };
    case 'UNDO_FAILED':
      return { ...state, undoFailed: true };
    case 'DISMISS':
      return { ...state, phase: PHASES.dismissing, audioPlaying: false };
    default:
      return state;
  }
}

/** Results that changed a transaction, shown as compact rows with an Undo. */
export function transactionRows(reply) {
  return (reply?.results || [])
    .filter((r) => r && r.ok && ['add', 'edit', 'delete'].includes(r.action) && r.data)
    .slice(0, 3)
    .map((r) => ({
      action: r.action,
      amount: r.data.amount,
      type: r.data.type === 'income' ? 'income' : 'expense',
      category: r.data.category_name || null,
      person: r.data.contact_name || null,
      budgetAlert: r.data.budget_alert || null,
    }));
}

/** The budget alert to warn about: an "over" one first. */
export function budgetAlertOf(reply) {
  const alerts = transactionRows(reply).map((row) => row.budgetAlert).filter(Boolean);
  return alerts.find((a) => a.alert === 'over') || alerts[0] || null;
}

export function hasPending(state) {
  return Boolean(state.reply?.pending?.id);
}

/**
 * What Pappu looks like for a state: pose (an existing Pappu pose), halo kind and
 * one-off reactions. Moods come from the reply (composer derive_mood).
 */
export function overlayVisual(state) {
  const { phase, reply, error } = state;
  if (phase === PHASES.summon || phase === PHASES.listening) {
    return { pose: 'listening', halo: 'level', reaction: null };
  }
  if (phase === PHASES.thinking) return { pose: 'thinking', halo: 'dots', reaction: null };
  if (phase === PHASES.speaking) return { pose: 'speaking', halo: 'none', reaction: null };
  if (phase === PHASES.error || error) return { pose: 'concerned', halo: 'none', reaction: 'shake' };
  if (!reply) return { pose: 'idle', halo: 'none', reaction: null };
  if (state.undone) return { pose: 'idle', halo: 'none', reaction: null };

  const mood = String(reply.mood || 'neutral').toLowerCase();
  const results = reply.results || [];
  const failed = results.some((r) => r && r.ok === false);
  if (
    hasPending(state) ||
    budgetAlertOf(reply) ||
    failed ||
    mood === 'concerned' ||
    mood === 'worried'
  ) {
    return { pose: 'concerned', halo: 'none', reaction: null };
  }
  if (mood === 'confused') return { pose: 'confused', halo: 'none', reaction: null };
  if (mood === 'excited') return { pose: 'excited', halo: 'none', reaction: 'celebrate' };
  if (mood === 'happy' || reply.changed || results.length > 0) {
    return { pose: 'happy', halo: 'none', reaction: 'celebrate' };
  }
  return { pose: 'idle', halo: 'none', reaction: null };
}

/** dBFS (about -60 quiet to -10 loud) to a 0..1 halo level. */
export function normalizeLevel(db) {
  if (typeof db !== 'number' || Number.isNaN(db)) return 0;
  return Math.min(1, Math.max(0, (db + 60) / 50));
}

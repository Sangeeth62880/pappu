import { overlayReducer, initialOverlayState } from './overlayMachine';

/**
 * Canned overlay states for the styleguide (and tests): every state, built through the
 * real reducer so they can't drift from it. No backend needed.
 */
const COPY = {
  en: {
    transcript: 'Spent 250 on lunch',
    added: 'Added ₹250 to Food.',
    budget: 'Added ₹600 to Food. Heads up: your Food budget of ₹5,000 is used up this month, ₹5,200 spent.',
    query: 'Spent ₹1,840 this week, ₹320 less than last week.',
    confirm: 'Delete Food ₹20 on 7 Nov?',
    clarify: 'How much did you spend?',
  },
  ml: {
    transcript: 'ഉച്ചയ്ക്ക് ഊണിന് 250 രൂപ',
    added: 'ഭക്ഷണം വിഭാഗത്തിൽ ₹250 ചേർത്തു.',
    budget: 'ഭക്ഷണം വിഭാഗത്തിൽ ₹600 ചേർത്തു. ശ്രദ്ധിക്കൂ: ഈ മാസത്തെ ഭക്ഷണം ബജറ്റ് ₹5,000 തീർന്നു, ആകെ ₹5,200 ചെലവായി.',
    query: 'ഈ ആഴ്ച ₹1,840 ചെലവായി, കഴിഞ്ഞ ആഴ്ചയേക്കാൾ ₹320 കുറവ്.',
    confirm: 'നവംബർ 7ലെ ഭക്ഷണം ₹20 ഒഴിവാക്കട്ടെ?',
    clarify: 'എത്ര രൂപ ചെലവായി?',
  },
};

const addResult = (amount, budgetAlert = null) => ({
  ok: true,
  action: 'add',
  data: { amount, type: 'expense', category_name: 'Food', budget_alert: budgetAlert },
});

function build(lang, actions) {
  return actions.reduce(overlayReducer, initialOverlayState(lang));
}

function reply(lang, extra) {
  return { language: lang, spoken_text: '', results: [], pending: null, changed: false, ...extra };
}

export const PREVIEW_STATES = [
  'summon',
  'listening',
  'thinking',
  'speaking',
  'result',
  'budget',
  'query',
  'confirm',
  'clarify',
  'error.permission',
  'error.empty',
  'error.stt',
  'error.network',
  'error.processing',
  'error.server',
];

/** The overlay state for a preview name and language ('en' | 'ml'). */
export function previewState(name, lang = 'en') {
  const c = COPY[lang] || COPY.en;
  const heard = [{ type: 'RECORDING_STARTED' }, { type: 'TRANSCRIPT', text: c.transcript }];
  const resultOf = (res) => [...heard, { type: 'REPLY', res: reply(lang, res) }];

  switch (name) {
    case 'summon':
      return initialOverlayState(lang);
    case 'listening':
      return build(lang, [{ type: 'RECORDING_STARTED' }]);
    case 'thinking':
      return build(lang, heard);
    case 'speaking':
      return build(lang, [
        ...heard,
        { type: 'REPLY', res: reply(lang, { display_text: c.added, spoken_text: c.added, mood: 'happy', results: [addResult(250)], changed: true }) },
        { type: 'AUDIO_PLAYING', playing: true },
      ]);
    case 'result':
      return build(lang, resultOf({ display_text: c.added, mood: 'happy', results: [addResult(250)], changed: true }));
    case 'budget':
      return build(
        lang,
        resultOf({
          display_text: c.budget,
          mood: 'concerned',
          results: [addResult(600, { alert: 'over', category: 'Food', spent: 5200, budget: 5000, percent: 104 })],
          changed: true,
        })
      );
    case 'query':
      return build(lang, resultOf({ display_text: c.query, mood: 'neutral', results: [{ ok: true, action: 'query', data: {} }] }));
    case 'confirm':
      return build(lang, [
        ...resultOf({
          display_text: c.confirm,
          mood: 'concerned',
          pending: { id: 'preview', kind: 'confirm', question: c.confirm },
        }),
        { type: 'RELISTEN' },
      ]);
    case 'clarify':
      return build(lang, resultOf({ display_text: c.clarify, mood: 'confused' }));
    default:
      if (name.startsWith('error.')) {
        const kind = name.slice('error.'.length);
        return build(lang, [...heard, { type: 'ERROR', kind, retry: kind === 'network' ? 'resend' : 'listen' }]);
      }
      return initialOverlayState(lang);
  }
}

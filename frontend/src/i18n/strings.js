/**
 * App strings in English (en) and Malayalam (ml). t(key, lang, vars) falls back to
 * English for a missing translation and to the key itself for an unknown key.
 * Placeholders look like {name}. Started for the voice overlay; other screens can move
 * their strings here over time.
 */
export const STRINGS = {
  'overlay.listening': { en: 'Listening…' },
  'overlay.thinking': { en: 'One sec…' },
  'overlay.close': { en: 'Close Pappu' },
  'overlay.retry': { en: 'Try again' },
  'overlay.talkAgain': { en: 'Talk again' },
  'overlay.settings': { en: 'Open settings' },
  'overlay.undo': { en: 'Undo' },
  'overlay.undone': { en: 'Undone.' },
  'overlay.undoFailed': { en: "Couldn't undo. Try again." },
  'overlay.yes': { en: 'Yes' },
  'overlay.no': { en: 'No' },
  'overlay.added': { en: 'Added' },
  'overlay.changed': { en: 'Changed' },
  'overlay.deleted': { en: 'Deleted' },
  'overlay.budgetOver': { en: 'Over your {cat} budget: {spent} of {budget}' },
  'overlay.budgetNear': { en: '{pct}% of your {cat} budget used' },
  'overlay.error.permission': { en: 'Pappu needs the microphone to hear you.' },
  'overlay.error.empty': { en: "I didn't hear anything." },
  'overlay.error.stt': { en: "Sorry, I couldn't catch that." },
  'overlay.error.network': { en: "Can't reach Pappu. Check your connection." },
  'overlay.error.processing': { en: 'Pappu is still working on that.' },
  'overlay.error.server': { en: 'Something went wrong.' },
};

export function t(key, lang = 'en', vars = {}) {
  const entry = STRINGS[key];
  const raw = entry ? entry[lang] || entry.en : key;
  return raw.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? '').toString());
}

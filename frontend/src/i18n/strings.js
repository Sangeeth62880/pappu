/**
 * App strings in English (en) and Malayalam (ml). t(key, lang, vars) falls back to
 * English for a missing translation and to the key itself for an unknown key.
 * Placeholders look like {name}. Started for the voice overlay; other screens can move
 * their strings here over time.
 */
export const STRINGS = {
  'overlay.listening': { en: 'Listening…', ml: 'കേൾക്കുന്നു…' },
  'overlay.thinking': { en: 'One sec…', ml: 'ഒരു നിമിഷം…' },
  'overlay.close': { en: 'Close Pappu', ml: 'പപ്പുവിനെ അടയ്ക്കുക' },
  'overlay.retry': { en: 'Try again', ml: 'വീണ്ടും' },
  'overlay.talkAgain': { en: 'Talk again', ml: 'വീണ്ടും പറയൂ' },
  'overlay.settings': { en: 'Open settings', ml: 'സെറ്റിംഗ്സ്' },
  'overlay.undo': { en: 'Undo', ml: 'അൺഡു' },
  'overlay.undone': { en: 'Undone.', ml: 'റദ്ദാക്കി.' },
  'overlay.undoFailed': { en: "Couldn't undo. Try again.", ml: 'റദ്ദാക്കാനായില്ല. വീണ്ടും ശ്രമിക്കൂ.' },
  'overlay.yes': { en: 'Yes', ml: 'അതെ' },
  'overlay.no': { en: 'No', ml: 'വേണ്ട' },
  'overlay.added': { en: 'Added', ml: 'ചേർത്തു' },
  'overlay.changed': { en: 'Changed', ml: 'മാറ്റി' },
  'overlay.deleted': { en: 'Deleted', ml: 'ഒഴിവാക്കി' },
  'overlay.budgetOver': { en: 'Over your {cat} budget: {spent} of {budget}', ml: 'ഈ മാസത്തെ {cat} ബജറ്റ് {budget} തീർന്നു, ആകെ {spent} ചെലവായി' },
  'overlay.budgetNear': { en: '{pct}% of your {cat} budget used', ml: '{cat} ബജറ്റിന്റെ {pct} ശതമാനം ചെലവായി' },
  'overlay.error.permission': { en: 'Pappu needs the microphone to hear you.', ml: 'കേൾക്കാൻ പപ്പുവിന് മൈക്രോഫോൺ അനുമതി വേണം.' },
  'overlay.error.empty': { en: "I didn't hear anything.", ml: 'ഒന്നും കേട്ടില്ല.' },
  'overlay.error.stt': { en: "Sorry, I couldn't catch that.", ml: 'ക്ഷമിക്കണം, മനസ്സിലായില്ല.' },
  'overlay.error.network': { en: "Can't reach Pappu. Check your connection.", ml: 'പപ്പുവിനെ കിട്ടുന്നില്ല. ഇന്റർനെറ്റ് കണക്ഷൻ നോക്കൂ.' },
  'overlay.error.processing': { en: 'Pappu is still working on that.', ml: 'പപ്പു ഇപ്പോഴും അത് ചെയ്തുകൊണ്ടിരിക്കുകയാണ്.' },
  'overlay.error.server': { en: 'Something went wrong.', ml: 'എന്തോ പിശക് പറ്റി.' },
};

export function t(key, lang = 'en', vars = {}) {
  const entry = STRINGS[key];
  const raw = entry ? entry[lang] || entry.en : key;
  return raw.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? '').toString());
}

const MALAYALAM_SCRIPT = /[\u0D00-\u0D7F]/;

/** Whether text contains Malayalam script (it then needs the Malayalam font and line height). */
export function isMalayalamText(text) {
  return MALAYALAM_SCRIPT.test(String(text || ''));
}


/**
 * Bulbul v3 TTS language code for an assistant reply.
 *
 * Accepts an AssistantResponse or chat message (uses its language_code, then its
 * language) or a plain code string. Malayalam replies speak as 'ml-IN', all else 'en-IN'.
 *
 * @param {object|string|null|undefined} source
 * @returns {'ml-IN'|'en-IN'}
 */
export function ttsLanguageCode(source) {
  const raw =
    source && typeof source === 'object' ? source.language_code || source.language : source;
  const code = String(raw || '').trim().toLowerCase();
  return code === 'ml-in' || code === 'ml' || code === 'malayalam' ? 'ml-IN' : 'en-IN';
}

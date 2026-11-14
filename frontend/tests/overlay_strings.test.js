import { STRINGS, t, isMalayalamText } from '../src/i18n/strings';

const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort();
const overlayKeys = Object.keys(STRINGS).filter((k) => k.startsWith('overlay.'));

describe('overlay strings', () => {
  test.each(overlayKeys)('%s has English and Malayalam with the same placeholders', (key) => {
    const { en, ml } = STRINGS[key];
    expect(en).toBeTruthy();
    expect(ml).toBeTruthy();
    expect(isMalayalamText(ml)).toBe(true);
    expect(placeholders(ml)).toEqual(placeholders(en));
  });

  test('every error kind the overlay can show has a string', () => {
    ['permission', 'empty', 'stt', 'network', 'processing', 'server'].forEach((kind) =>
      expect(STRINGS[`overlay.error.${kind}`]).toBeDefined()
    );
  });

  test('t fills placeholders and falls back to English, then the key', () => {
    expect(t('overlay.budgetNear', 'ml', { cat: 'Food', pct: 85 })).toBe('Food ബജറ്റിന്റെ 85 ശതമാനം ചെലവായി');
    expect(t('overlay.yes', 'ta')).toBe('Yes');
    expect(t('overlay.unknown', 'ml')).toBe('overlay.unknown');
  });

  test('isMalayalamText spots Malayalam script, also when mixed', () => {
    expect(isMalayalamText('ചായ 20 രൂപ')).toBe(true);
    expect(isMalayalamText('chaya 20 ചായ')).toBe(true);
    expect(isMalayalamText('chaya 20')).toBe(false);
    expect(isMalayalamText(null)).toBe(false);
  });
});

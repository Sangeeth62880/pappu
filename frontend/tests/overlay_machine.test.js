import {
  overlayReducer,
  initialOverlayState,
  overlayVisual,
  transactionRows,
  budgetAlertOf,
  normalizeLevel,
  PHASES,
} from '../src/components/voiceOverlay/overlayMachine';

const run = (actions, start = initialOverlayState('en')) => actions.reduce(overlayReducer, start);

const added = {
  spoken_text: 'Added 20 rupees to food.',
  display_text: 'Added ₹20 to Food.',
  language: 'en',
  mood: 'happy',
  changed: true,
  results: [{ ok: true, action: 'add', data: { amount: 20, type: 'expense', category_name: 'Food' } }],
};

describe('overlay state machine', () => {
  test('summon -> listening -> thinking -> speaking -> result -> dismissing', () => {
    const phases = [];
    let state = initialOverlayState('en');
    phases.push(state.phase);
    for (const action of [
      { type: 'RECORDING_STARTED' },
      { type: 'RECORDING_STOPPED' },
      { type: 'TRANSCRIPT', text: 'chaya 20' },
      { type: 'REPLY', res: added },
      { type: 'SPEAKING_DONE' },
      { type: 'DISMISS' },
    ]) {
      state = overlayReducer(state, action);
      phases.push(state.phase);
    }
    expect(phases).toEqual([
      PHASES.summon,
      PHASES.listening,
      PHASES.thinking,
      PHASES.thinking,
      PHASES.speaking,
      PHASES.result,
      PHASES.dismissing,
    ]);
    expect(state.transcript).toBe('chaya 20');
  });

  test('a reply with nothing to speak goes straight to the result', () => {
    expect(run([{ type: 'REPLY', res: { ...added, spoken_text: '' } }]).phase).toBe(PHASES.result);
  });

  test('the reply language replaces the profile language', () => {
    const state = run([{ type: 'REPLY', res: { ...added, language: 'ml' } }]);
    expect(state.lang).toBe('ml');
    expect(overlayReducer(state, { type: 'LANG', lang: 'en' }).lang).toBe('ml');
  });

  test('errors keep how to retry: resend a failed send, otherwise listen', () => {
    const sendFailed = run([
      { type: 'SENDING', send: { text: 'chaya 20', clientMsgId: 'id-1' } },
      { type: 'ERROR', kind: 'network', retry: 'resend' },
    ]);
    expect(sendFailed.error).toEqual({ kind: 'network', retry: 'resend' });
    expect(sendFailed.lastSend).toEqual({ text: 'chaya 20', clientMsgId: 'id-1' });
    expect(overlayReducer(sendFailed, { type: 'RETRY', resend: true }).phase).toBe(PHASES.thinking);

    const unknown = run([{ type: 'ERROR', kind: 'weird' }]);
    expect(unknown.error).toEqual({ kind: 'server', retry: 'listen' });
    expect(overlayReducer(unknown, { type: 'RETRY' }).phase).toBe(PHASES.summon);
  });

  test('one re-listen for a confirmation', () => {
    const state = run([{ type: 'RELISTEN' }]);
    expect(state.answering).toBe(true);
    expect(state.relistensLeft).toBe(0);
  });
});

describe('overlay visuals map every state to an existing Pappu pose', () => {
  const result = (res, extra = {}) => ({ ...run([{ type: 'REPLY', res }, { type: 'SPEAKING_DONE' }]), ...extra });

  test.each([
    ['summon', initialOverlayState(), 'listening', 'level', null],
    ['listening', run([{ type: 'RECORDING_STARTED' }]), 'listening', 'level', null],
    ['thinking', run([{ type: 'TRANSCRIPT', text: 'x' }]), 'thinking', 'dots', null],
    ['speaking', run([{ type: 'REPLY', res: added }]), 'speaking', 'none', null],
    ['error', run([{ type: 'ERROR', kind: 'stt' }]), 'concerned', 'none', 'shake'],
  ])('%s', (_name, state, pose, halo, reaction) => {
    expect(overlayVisual(state)).toEqual({ pose, halo, reaction });
  });

  test.each([
    ['expense added (happy)', added, 'happy', 'celebrate'],
    ['income added (excited)', { ...added, mood: 'excited' }, 'excited', 'celebrate'],
    ['query answered (neutral)', { ...added, mood: 'neutral', changed: false, results: [{ ok: true, action: 'query', data: {} }] }, 'happy', 'celebrate'],
    ['clarify question (confused)', { ...added, mood: 'confused', changed: false, results: [] }, 'confused', null],
    ['pending confirmation', { ...added, mood: 'concerned', pending: { id: 'p' } }, 'concerned', null],
    ['failed action', { ...added, mood: 'neutral', changed: false, results: [{ ok: false, action: 'delete' }] }, 'concerned', null],
    ['nothing to do (neutral)', { ...added, mood: 'neutral', changed: false, results: [] }, 'idle', null],
  ])('%s', (_name, res, pose, reaction) => {
    expect(overlayVisual(result(res))).toMatchObject({ pose, reaction });
  });

  test('a budget alert shows concerned even when the mood is happy', () => {
    const res = {
      ...added,
      results: [{ ...added.results[0], data: { ...added.results[0].data, budget_alert: { alert: 'near', category: 'Food', percent: 85 } } }],
    };
    expect(overlayVisual(result(res)).pose).toBe('concerned');
    expect(budgetAlertOf(res)).toEqual({ alert: 'near', category: 'Food', percent: 85 });
  });

  test('after undo Pappu goes back to idle', () => {
    expect(overlayVisual(result(added, { undone: true })).pose).toBe('idle');
  });
});

describe('helpers', () => {
  test('transaction rows keep amount, type, category and person', () => {
    expect(
      transactionRows({
        results: [
          { ok: true, action: 'add', data: { amount: 500, type: 'expense', category_name: 'People', contact_name: 'Pooja' } },
          { ok: true, action: 'query', data: {} },
          { ok: false, action: 'add', data: { amount: 1 } },
        ],
      })
    ).toEqual([
      { action: 'add', amount: 500, type: 'expense', category: 'People', person: 'Pooja', budgetAlert: null },
    ]);
  });

  test('mic levels map from dBFS to 0..1', () => {
    expect(normalizeLevel(-80)).toBe(0);
    expect(normalizeLevel(-35)).toBeCloseTo(0.5);
    expect(normalizeLevel(0)).toBe(1);
    expect(normalizeLevel(undefined)).toBe(0);
  });
});

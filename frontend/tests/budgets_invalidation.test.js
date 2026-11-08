/**
 * The budgets query is invalidated on every transaction change: assistant replies that
 * changed data (typed, voice, confirmed pending answers), the undo pill, the HomeScreen
 * mutation handler (toast undo, sheets), and the shared invalidateOnTransactionChange helper.
 */

import React from 'react';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react-native';

import ConversationLog from '../src/components/ConversationLog';
import HomeScreen from '../src/screens/HomeScreen';
import * as client from '../src/api/client';
import * as supabaseApi from '../src/api/supabase';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../src/data/queryClient';
import { queryKeys, invalidateOnTransactionChange } from '../src/data/queryKeys';

jest.mock('../src/api/client');
jest.mock('../src/api/supabase');
jest.mock('expo-secure-store');

const TOKEN = 'mock_jwt_token_invalidation';

const budgetCalls = (spy) =>
  spy.mock.calls.filter(([arg]) => JSON.stringify(arg?.queryKey) === JSON.stringify(queryKeys.budgets())).length;
const budgetsInvalidated = (spy) => budgetCalls(spy) > 0;

const changedReply = {
  display_text: 'Added ₹200 to Food. Heads up: Food is at 82% of its ₹5,000 budget this month.',
  spoken_text: 'Added ₹200 to Food. Heads up: Food is at 82% of its ₹5,000 budget this month.',
  results: [{ ok: true, action: 'add', data: { amount: 200, category_name: 'Food' } }],
  pending: null,
  changed: true,
};

describe('budgets invalidation', () => {
  jest.setTimeout(15000);
  let spy;

  beforeEach(() => {
    jest.clearAllMocks();
    spy = jest.spyOn(queryClient, 'invalidateQueries');
    client.fetchChatHistory.mockResolvedValue({ messages: [] });
    client.fetchActivePending.mockResolvedValue(null);
    client.synthesizeSpeech.mockResolvedValue({ audio_base64: 'bW9jaw==' });
    client.fetchBudgets.mockResolvedValue({ month: '2026-11', budgets: [], categories: [] });
  });

  afterEach(() => {
    spy.mockRestore();
    cleanup();
  });

  test('an assistant reply that changed data invalidates budgets', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce(changedReply);
    const { findByTestId, findByText } = await render(<ConversationLog token={TOKEN} />);

    fireEvent.changeText(await findByTestId('conversation-input'), 'lunch 200');
    fireEvent.press(await findByTestId('conversation-send-button'));
    expect(await findByText(changedReply.display_text)).toBeTruthy();

    await waitFor(() => expect(budgetsInvalidated(spy)).toBe(true));
  });

  test('the undo pill invalidates budgets', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      ...changedReply,
      results: [{ kind: 'added', heard_amount: 200, amount: 200, category: 'Food' }],
    });
    client.undoTransaction.mockResolvedValueOnce({ status: 'undone' });
    const { findByTestId } = await render(<ConversationLog token={TOKEN} assistantV2={true} />);

    fireEvent.changeText(await findByTestId('conversation-input'), 'lunch 200');
    fireEvent.press(await findByTestId('conversation-send-button'));
    await waitFor(() => expect(budgetsInvalidated(spy)).toBe(true));

    spy.mockClear();
    fireEvent.press(await findByTestId('undo-button'));
    await waitFor(() => expect(client.undoTransaction).toHaveBeenCalledWith(TOKEN));
    await waitFor(() => expect(budgetsInvalidated(spy)).toBe(true));
  });

  test('HomeScreen invalidates budgets when the assistant changes data', async () => {
    supabaseApi.getSession.mockResolvedValue(null);
    supabaseApi.supabase = {
      auth: { onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })) },
    };
    SecureStore.getItemAsync.mockResolvedValue('true');
    client.fetchSummary.mockResolvedValue({ balance: 0, total_income: 0, total_expense: 0, category_breakdown: [], transaction_count: 0 });
    client.fetchTransactions.mockResolvedValue([]);
    client.sendAssistantMessage.mockResolvedValueOnce(changedReply);

    const { findByTestId, findByText } = await render(
      <HomeScreen initialSession={{ access_token: TOKEN, user: { email: 'test@pappu.dev' } }} />
    );
    fireEvent.press(await findByTestId('tab-assistant'));
    fireEvent.changeText(await findByTestId('conversation-input'), 'lunch 200');
    fireEvent.press(await findByTestId('conversation-send-button'));
    expect(await findByText(changedReply.display_text, {}, { timeout: 4000 })).toBeTruthy();

    // Once from ConversationLog and once from HomeScreen's handleTransactionMutated, which
    // also serves the toast undo, voice sheet and the History/People/Dashboard sheets.
    await waitFor(() => expect(budgetCalls(spy)).toBeGreaterThanOrEqual(2));
  });

  test('invalidateOnTransactionChange (History, People and Dashboard edits/deletes) includes budgets', async () => {
    await invalidateOnTransactionChange(queryClient, { contactId: 'c1' });
    expect(budgetsInvalidated(spy)).toBe(true);
  });
});

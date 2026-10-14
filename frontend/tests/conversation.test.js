import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ConversationLog from '../src/components/ConversationLog';
import * as client from '../src/api/client';

jest.mock('../src/api/client');

describe('ConversationLog Component', () => {
  const mockToken = 'mock_jwt_token';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('submitting a high-confidence add command executes and triggers onTransactionMutated', async () => {
    const mockOnMutated = jest.fn();

    client.sendAssistantMessage.mockResolvedValueOnce({
      display_text: 'Added Food transaction for ₹500.',
      spoken_text: 'Added Food transaction for ₹500.',
      results: [{ kind: 'added', amount: 500 }],
      pending: null,
      changed: true,
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} onTransactionMutated={mockOnMutated} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'I spent 500 on food today');

    const sendBtn = await findByTestId('conversation-send-button');
    fireEvent.press(sendBtn);

    expect(await findByText('I spent 500 on food today')).toBeTruthy();
    expect(await findByText('Added Food transaction for ₹500.')).toBeTruthy();

    await waitFor(() => {
      expect(client.sendAssistantMessage).toHaveBeenCalledWith(
        mockToken,
        expect.objectContaining({ text: 'I spent 500 on food today' })
      );
      expect(mockOnMutated).toHaveBeenCalledTimes(1);
    });
  });

  test('submitting a delete command requiring confirmation blocks dashboard update until confirmed', async () => {
    const mockOnMutated = jest.fn();
    const txnId = '123e4567-e89b-12d3-a456-426614174000';

    client.sendAssistantMessage.mockResolvedValueOnce({
      display_text: `Are you sure you want to delete transaction ${txnId}?`,
      spoken_text: `Are you sure you want to delete transaction ${txnId}?`,
      results: [],
      pending: {
        id: 'pend_del',
        action_type: 'delete',
        summary: `Are you sure you want to delete transaction ${txnId}?`,
        target_transaction: { id: txnId, amount: 350, category_name: 'Food' },
      },
      changed: false,
    });

    client.answerPending.mockResolvedValueOnce({
      display_text: 'Successfully executed delete.',
      spoken_text: 'Successfully executed delete.',
      results: [{ kind: 'deleted', transaction_id: txnId }],
      pending: null,
      changed: true,
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} onTransactionMutated={mockOnMutated} />
    );

    // 1. Submit delete text
    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Delete the food expense from today');
    const sendBtn = await findByTestId('conversation-send-button');
    fireEvent.press(sendBtn);

    // 2. Prompt appears in log
    expect(await findByText(`Are you sure you want to delete transaction ${txnId}?`)).toBeTruthy();

    // CRITICAL ASSERTION: onTransactionMutated has NOT been called yet
    expect(mockOnMutated).not.toHaveBeenCalled();

    // 3. User clicks Confirm button
    const confirmButton = await findByText('✓ Confirm delete');
    fireEvent.press(confirmButton);

    // 4. Action executes and THEN onTransactionMutated is called
    expect(await findByText('Successfully executed delete.')).toBeTruthy();
    await waitFor(() => {
      expect(client.answerPending).toHaveBeenCalledWith(
        mockToken,
        'pend_del',
        'confirm',
        null
      );
      expect(mockOnMutated).toHaveBeenCalledTimes(1);
    });
  });

  test('submitting a command with multiple matches shows disambiguation candidates', async () => {
    const mockOnMutated = jest.fn();
    const cand1 = { id: 'c1', amount: 100, category_name: 'Food', txn_date: '2026-08-30' };
    const cand2 = { id: 'c2', amount: 200, category_name: 'Food', txn_date: '2026-08-30' };

    client.sendAssistantMessage.mockResolvedValueOnce({
      display_text: 'Multiple transactions match. Please select which one:',
      spoken_text: 'Multiple transactions match. Please select which one:',
      results: [],
      pending: {
        id: 'pend_dis',
        action_type: 'disambiguate',
        summary: 'Multiple transactions match. Please select which one:',
        candidates: [cand1, cand2],
      },
      changed: false,
    });

    const { findByTestId, findByText, getByText } = await render(
      <ConversationLog token={mockToken} onTransactionMutated={mockOnMutated} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Delete food expense');
    const sendBtn = await findByTestId('conversation-send-button');
    fireEvent.press(sendBtn);

    expect(await findByText('Multiple transactions match. Please select which one:')).toBeTruthy();
    expect(getByText(/₹100/)).toBeTruthy();
    expect(getByText(/₹200/)).toBeTruthy();
    expect(mockOnMutated).not.toHaveBeenCalled();
  });
});

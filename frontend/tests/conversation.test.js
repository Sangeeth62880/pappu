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

    client.parseIntent.mockResolvedValueOnce({
      intent: {
        action: 'add',
        language: 'en',
        fields: { amount: 500, category: 'Food' },
        matched_transactions: [],
        confidence: 'high',
        requires_confirmation: false,
        missing_fields: [],
      },
    });

    client.routeIntent.mockResolvedValueOnce({
      decision: 'EXECUTE',
      action: 'add',
      confidence: 'high',
      execution_result: {
        status: 'created',
        transaction: { id: 'txn-1', amount: 500, category_name: 'Food' },
      },
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
      expect(client.parseIntent).toHaveBeenCalledWith(mockToken, 'I spent 500 on food today');
      expect(client.routeIntent).toHaveBeenCalled();
      expect(mockOnMutated).toHaveBeenCalledTimes(1);
    });
  });

  test('submitting a delete command requiring confirmation blocks dashboard update until confirmed', async () => {
    const mockOnMutated = jest.fn();
    const txnId = '123e4567-e89b-12d3-a456-426614174000';

    client.parseIntent.mockResolvedValueOnce({
      intent: {
        action: 'delete',
        language: 'en',
        fields: { category: 'Food', date: '2026-08-31' },
        matched_transactions: [txnId],
        confidence: 'high',
        requires_confirmation: true,
        missing_fields: [],
      },
    });

    client.routeIntent.mockResolvedValueOnce({
      decision: 'ASK_CONFIRMATION',
      action: 'delete',
      confidence: 'high',
      matched_transactions: [txnId],
      confirmation_prompt: `Are you sure you want to delete transaction ${txnId}?`,
      target_transaction: { id: txnId, amount: 350, category_name: 'Food' },
    });

    client.confirmAction.mockResolvedValueOnce({
      status: 'executed',
      action: 'delete',
      transaction: { id: txnId },
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

    // CRITICAL ASSERTION: onTransactionMutated has NOT been called yet!
    expect(mockOnMutated).not.toHaveBeenCalled();

    // 3. User clicks Confirm button
    const confirmButton = await findByText(`✓ Confirm delete`);
    fireEvent.press(confirmButton);

    // 4. Action executes and THEN onTransactionMutated is called
    expect(await findByText('Successfully executed delete.')).toBeTruthy();
    await waitFor(() => {
      expect(client.confirmAction).toHaveBeenCalledWith(
        mockToken,
        txnId,
        'delete',
        expect.objectContaining({ category: 'Food' })
      );
      expect(mockOnMutated).toHaveBeenCalledTimes(1);
    });
  });

  test('submitting a command with multiple matches shows disambiguation candidates', async () => {
    const mockOnMutated = jest.fn();
    const cand1 = { id: 'c1', amount: 100, category_name: 'Food', txn_date: '2026-08-30' };
    const cand2 = { id: 'c2', amount: 200, category_name: 'Food', txn_date: '2026-08-30' };

    client.parseIntent.mockResolvedValueOnce({
      intent: {
        action: 'delete',
        language: 'en',
        fields: { category: 'Food' },
        matched_transactions: ['c1', 'c2'],
        confidence: 'high',
        requires_confirmation: false,
        missing_fields: [],
      },
    });

    client.routeIntent.mockResolvedValueOnce({
      decision: 'ASK_DISAMBIGUATION',
      action: 'delete',
      confidence: 'high',
      matched_transactions: ['c1', 'c2'],
      disambiguation_prompt: 'Multiple transactions match. Please select which one:',
      candidates: [cand1, cand2],
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

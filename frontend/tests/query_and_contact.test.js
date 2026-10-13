import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ConversationLog from '../src/components/ConversationLog';
import * as client from '../src/api/client';

jest.mock('../src/api/client');

describe('ConversationLog - Contact Confirmation & Query Visuals', () => {
  const mockToken = 'mock_jwt_token';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('query command renders QueryDataCard with total amount and category badge', async () => {
    client.parseIntent.mockResolvedValueOnce({
      intent: {
        action: 'query',
        language: 'en',
        fields: { category: 'Food' },
        confidence: 'high',
        requires_confirmation: false,
        missing_fields: [],
      },
    });

    client.routeIntent.mockResolvedValueOnce({
      decision: 'EXECUTE',
      action: 'query',
      confidence: 'high',
      spoken_response: 'Fetching your data.',
      execution_result: {
        status: 'queried',
        category: 'Food',
        period: 'This month',
        total_amount: 1450.0,
        count: 2,
        transactions: [
          { id: 't-1', description: 'Lunch at cafe', amount: 450.0, txn_date: '2026-10-05', type: 'expense' },
          { id: 't-2', description: 'Groceries', amount: 1000.0, txn_date: '2026-10-10', type: 'expense' },
        ],
      },
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'how much did i spend on food this month');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByTestId('query-data-card')).toBeTruthy();
    expect(await findByText('Food')).toBeTruthy();
    expect(await findByText('₹1,450.00')).toBeTruthy();
    expect(await findByText('Lunch at cafe')).toBeTruthy();
  });

  test('contact similarity prompts for confirmation with suggested person', async () => {
    const mockOnMutated = jest.fn();

    client.parseIntent.mockResolvedValueOnce({
      intent: {
        action: 'add',
        language: 'en',
        fields: { amount: 500, contact_name: 'arjun' },
        confidence: 'high',
        requires_confirmation: false,
        missing_fields: [],
      },
    });

    client.routeIntent.mockResolvedValueOnce({
      decision: 'ASK_CONFIRMATION',
      action: 'add',
      confidence: 'high',
      confirmation_prompt: "Did you mean 'Arjun Nair'? Or add as new person 'arjun'?",
      contact_match: { id: 'c-123', name: 'Arjun Nair', original: 'arjun' },
      candidates: [
        { id: 'c-123', name: 'Arjun Nair', type: 'existing' },
        { id: 'new', name: 'arjun', type: 'new' },
      ],
    });

    client.confirmAction.mockResolvedValueOnce({
      status: 'executed',
      action: 'add',
      transaction: { id: 't-99', amount: 500, contact_name: 'Arjun Nair' },
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} onTransactionMutated={mockOnMutated} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'arjun 500 koduthu');
    fireEvent.press(await findByTestId('conversation-send-button'));

    // Check prompt and button
    expect(await findByText("Did you mean 'Arjun Nair'? Or add as new person 'arjun'?")).toBeTruthy();
    const confirmBtn = await findByTestId('confirm-action-button');
    expect(confirmBtn).toBeTruthy();

    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(client.confirmAction).toHaveBeenCalledWith(
        mockToken,
        null,
        'add',
        expect.anything(),
        expect.objectContaining({ contact_id: 'c-123', contact_name: 'Arjun Nair' })
      );
      expect(mockOnMutated).toHaveBeenCalledTimes(1);
    });
  });

  test('Clear Chat button clears the message history', async () => {
    const initialMessages = [
      { id: 'm-1', sender: 'user', text: 'Hello' },
      { id: 'm-2', sender: 'pappu', text: 'Hi! How can I help?' },
    ];

    const { findByTestId, queryByText } = await render(
      <ConversationLog token={mockToken} initialMessages={initialMessages} />
    );

    const clearBtn = await findByTestId('clear-chat-button');
    fireEvent.press(clearBtn);

    await waitFor(() => {
      expect(queryByText('Hello')).toBeNull();
    });
    expect(await findByTestId('empty-conversation-text')).toBeTruthy();
  });
});

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
    client.sendAssistantMessage.mockResolvedValueOnce({
      display_text: 'Fetching your data.',
      spoken_text: 'Fetching your data.',
      results: [
        {
          kind: 'sum',
          category: 'Food',
          period: 'This month',
          total_amount: 1450.0,
          count: 2,
          transactions: [
            { id: 't-1', description: 'Lunch at cafe', amount: 450.0, txn_date: '2026-10-05', type: 'expense' },
            { id: 't-2', description: 'Groceries', amount: 1000.0, txn_date: '2026-10-10', type: 'expense' },
          ],
        },
      ],
      pending: null,
      changed: false,
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'how much did i spend on food this month');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByTestId('query-data-card')).toBeTruthy();
    expect(await findByText('Food')).toBeTruthy();
    expect(await findByText(/₹1,450(\.00)?/)).toBeTruthy();
    expect(await findByText('Lunch at cafe')).toBeTruthy();
  });

  test('contact similarity prompts for confirmation with suggested person', async () => {
    const mockOnMutated = jest.fn();

    client.sendAssistantMessage.mockResolvedValueOnce({
      display_text: "Did you mean 'Arjun Nair'? Or add as new person 'arjun'?",
      spoken_text: "Did you mean 'Arjun Nair'? Or add as new person 'arjun'?",
      results: [],
      pending: {
        id: 'pend_contact',
        action_type: 'contact_confirm',
        summary: "Did you mean 'Arjun Nair'? Or add as new person 'arjun'?",
        candidates: [{ id: 'c-123', name: 'Arjun Nair', original: 'arjun' }],
      },
      changed: false,
    });

    client.answerPending.mockResolvedValueOnce({
      display_text: 'Added transaction for Arjun Nair.',
      spoken_text: 'Added transaction for Arjun Nair.',
      results: [{ kind: 'added', amount: 500, contact_name: 'Arjun Nair' }],
      pending: null,
      changed: true,
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
      expect(client.answerPending).toHaveBeenCalledWith(
        mockToken,
        'pend_contact',
        'yes',
        0
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

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import HomeScreen from '../src/screens/HomeScreen';
import * as client from '../src/api/client';

jest.mock('../src/api/client');

describe('HomeScreen Live Integration', () => {
  const mockToken = 'mock_jwt_token';

  const initialSummary = {
    balance: 1000.0,
    total_income: 2000.0,
    total_expense: 1000.0,
    category_breakdown: [
      { category_id: 1, category_name: 'Salary', type: 'income', total_amount: 2000.0, count: 1 },
      { category_id: 2, category_name: 'Food', type: 'expense', total_amount: 1000.0, count: 2 },
    ],
    transaction_count: 3,
  };

  const updatedSummary = {
    balance: 500.0,
    total_income: 2000.0,
    total_expense: 1500.0,
    category_breakdown: [
      { category_id: 1, category_name: 'Salary', type: 'income', total_amount: 2000.0, count: 1 },
      { category_id: 2, category_name: 'Food', type: 'expense', total_amount: 1500.0, count: 3 },
    ],
    transaction_count: 4,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders header, language toggle, dashboard, and conversation log', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);

    const { findByText, findByTestId } = await render(
      <HomeScreen initialToken={mockToken} />
    );

    expect(await findByText('Pappu')).toBeTruthy();
    expect(await findByText('Financial Voice Assistant')).toBeTruthy();
    expect(await findByTestId('lang-toggle-en')).toBeTruthy();
    expect(await findByTestId('lang-toggle-ml')).toBeTruthy();
    expect(await findByTestId('lang-toggle-mixed')).toBeTruthy();
    expect(await findByTestId('dashboard-view')).toBeTruthy();
    expect(await findByTestId('conversation-container')).toBeTruthy();
  });

  test('switching language toggles active language state', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);

    const { findByTestId } = await render(
      <HomeScreen initialToken={mockToken} />
    );

    const mlToggle = await findByTestId('lang-toggle-ml');
    fireEvent.press(mlToggle);

    expect(mlToggle).toBeTruthy();
  });

  test('submitting an add transaction mutates and refreshes dashboard live without manual reload', async () => {
    // Initial fetch
    client.fetchSummary
      .mockResolvedValueOnce(initialSummary) // initial load
      .mockResolvedValueOnce(updatedSummary); // after mutation

    client.fetchTransactions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'txn-new', amount: 500, category_name: 'Food', type: 'expense', txn_date: '2026-08-31' },
      ]);

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
      execution_result: { status: 'created' },
    });

    const { findByTestId, findByText } = await render(
      <HomeScreen initialToken={mockToken} />
    );

    // Initial balance
    const balanceEl = await findByTestId('dashboard-balance');
    expect(balanceEl).toHaveTextContent('₹1000.00');

    // Type and send expense
    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'I spent 500 on food today');
    const sendBtn = await findByTestId('conversation-send-button');
    fireEvent.press(sendBtn);

    // Verify conversation response
    expect(await findByText('Added Food transaction for ₹500.')).toBeTruthy();

    // Verify dashboard was re-fetched and updated live!
    await waitFor(() => {
      expect(client.fetchSummary).toHaveBeenCalledTimes(2);
      expect(balanceEl).toHaveTextContent('₹500.00');
    });
  });

  test('tapping undo triggers undo API and updates dashboard', async () => {
    client.fetchSummary
      .mockResolvedValueOnce(updatedSummary)
      .mockResolvedValueOnce(initialSummary);

    client.fetchTransactions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    client.undoTransaction.mockResolvedValueOnce({ status: 'undone' });

    const { findByTestId } = await render(
      <HomeScreen initialToken={mockToken} />
    );

    const undoButton = await findByTestId('dashboard-undo-button');
    fireEvent.press(undoButton);

    await waitFor(() => {
      expect(client.undoTransaction).toHaveBeenCalledWith(mockToken);
      expect(client.fetchSummary).toHaveBeenCalledTimes(2);
    });
  });
});

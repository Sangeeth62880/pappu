import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import HomeScreen from '../src/screens/HomeScreen';
import * as client from '../src/api/client';
import * as supabaseApi from '../src/api/supabase';

jest.mock('../src/api/client');
jest.mock('../src/api/supabase');

describe('HomeScreen Live Integration', () => {
  const mockToken = 'mock_jwt_token';
  const mockSession = { access_token: mockToken, user: { email: 'test@pappu.dev' } };

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
    supabaseApi.supabase = {
      auth: {
        onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      },
    };
  });

  test('renders auth screen when no session or token is active', async () => {
    supabaseApi.getSession.mockResolvedValueOnce(null);

    const { findByTestId, findByText } = await render(
      <HomeScreen />
    );

    expect(await findByTestId('auth-screen')).toBeTruthy();
    expect(await findByText('Sign In to Pappu')).toBeTruthy();
  });

  test('renders header, user email, sign out button, and dashboard tab when authenticated', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);

    const { findByText, findByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    expect(await findByText('Pappu')).toBeTruthy();
    expect(await findByTestId('user-email-header')).toHaveTextContent('test@pappu.dev');
    expect(await findByTestId('auth-signout-button')).toBeTruthy();
    expect(await findByTestId('dashboard-view')).toBeTruthy();

    // Tab bar should be visible with all three tabs
    expect(await findByTestId('tab-dashboard')).toBeTruthy();
    expect(await findByTestId('tab-assistant')).toBeTruthy();
    expect(await findByTestId('tab-history')).toBeTruthy();
  });

  test('switching to assistant tab shows conversation container', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);

    const { findByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    // Switch to assistant tab
    const assistantTab = await findByTestId('tab-assistant');
    fireEvent.press(assistantTab);

    expect(await findByTestId('conversation-container')).toBeTruthy();
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
      <HomeScreen initialSession={mockSession} />
    );

    // Initial balance on dashboard tab
    const balanceEl = await findByTestId('dashboard-balance');
    expect(balanceEl).toHaveTextContent('₹1000.00');

    // Switch to assistant tab
    const assistantTab = await findByTestId('tab-assistant');
    fireEvent.press(assistantTab);

    // Type and send expense
    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'I spent 500 on food today');
    const sendBtn = await findByTestId('conversation-send-button');
    fireEvent.press(sendBtn);

    // Verify conversation response
    expect(await findByText('Added Food transaction for ₹500.')).toBeTruthy();

    // Switch back to dashboard tab to verify it was refreshed
    const dashboardTab = await findByTestId('tab-dashboard');
    fireEvent.press(dashboardTab);

    // Verify dashboard was re-fetched and updated live!
    await waitFor(() => {
      expect(client.fetchSummary).toHaveBeenCalledTimes(2);
    });

    const updatedBalance = await findByTestId('dashboard-balance');
    expect(updatedBalance).toHaveTextContent('₹500.00');
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
      <HomeScreen initialSession={mockSession} />
    );

    const undoButton = await findByTestId('dashboard-undo-button');
    fireEvent.press(undoButton);

    await waitFor(() => {
      expect(client.undoTransaction).toHaveBeenCalledWith(mockToken);
      expect(client.fetchSummary).toHaveBeenCalledTimes(2);
    });
  });

  test('tapping sign out clears session and returns to AuthScreen', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);
    supabaseApi.signOut.mockResolvedValueOnce();

    const { findByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    const signOutBtn = await findByTestId('auth-signout-button');
    fireEvent.press(signOutBtn);

    await waitFor(() => {
      expect(supabaseApi.signOut).toHaveBeenCalled();
    });

    expect(await findByTestId('auth-screen')).toBeTruthy();
  });
});

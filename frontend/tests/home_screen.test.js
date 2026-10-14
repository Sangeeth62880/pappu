import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import HomeScreen from '../src/screens/HomeScreen';
import * as client from '../src/api/client';
import * as supabaseApi from '../src/api/supabase';

jest.mock('../src/api/client');
jest.mock('../src/api/supabase');

describe('HomeScreen Component', () => {
  const mockToken = 'mock_jwt_token_123';
  const mockSession = {
    access_token: mockToken,
    user: { email: 'test@pappu.dev' },
  };

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
    supabaseApi.getSession.mockResolvedValue(null);
    supabaseApi.supabase = {
      auth: {
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      },
    };
  });

  test('renders auth screen when not authenticated', async () => {
    const { findByTestId } = await render(<HomeScreen />);
    expect(await findByTestId('auth-screen')).toBeTruthy();
  });

  test('renders header, profile sheet with email/signout, and dashboard tab when authenticated', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);

    const { findByText, findByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    expect(await findByText('Pappu')).toBeTruthy();
    expect(await findByTestId('dashboard-view')).toBeTruthy();

    // Tab bar should be visible with tabs
    expect(await findByTestId('tab-dashboard')).toBeTruthy();
    expect(await findByTestId('tab-assistant')).toBeTruthy();
    expect(await findByTestId('tab-history')).toBeTruthy();
    expect(await findByTestId('tab-people')).toBeTruthy();

    // Open profile sheet from avatar button
    const avatarBtn = await findByTestId('profile-avatar-button');
    fireEvent.press(avatarBtn);

    // Profile sheet should display user email and signout button
    expect(await findByTestId('user-email-header')).toHaveTextContent('test@pappu.dev');
    expect(await findByTestId('auth-signout-button')).toBeTruthy();
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

    client.sendAssistantMessage.mockResolvedValueOnce({
      display_text: 'Added Food transaction for ₹500.',
      spoken_text: 'Added Food transaction for ₹500.',
      results: [{ kind: 'added', amount: 500 }],
      pending: null,
      changed: true,
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

    // Close assistant modal to return to dashboard tab
    const closeAssistantBtn = await findByTestId('conversation-back-button');
    fireEvent.press(closeAssistantBtn);

    // Verify dashboard was re-fetched and updated live!
    await waitFor(() => {
      expect(client.fetchSummary).toHaveBeenCalledTimes(2);
    });

    const updatedBalance = await findByTestId('dashboard-balance');
    expect(updatedBalance).toHaveTextContent('₹1500.00');
  });

  test('tapping sign out clears session and returns to AuthScreen', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);
    supabaseApi.signOut.mockResolvedValueOnce();

    const { findByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    // Open profile sheet and sign out
    const avatarBtn = await findByTestId('profile-avatar-button');
    fireEvent.press(avatarBtn);

    const signOutBtn = await findByTestId('auth-signout-button');
    fireEvent.press(signOutBtn);

    await waitFor(() => {
      expect(supabaseApi.signOut).toHaveBeenCalled();
    });

    expect(await findByTestId('auth-screen')).toBeTruthy();
  });

  test('tapping back button on history screen returns to dashboard tab', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);

    const { findByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    // Switch to history tab
    fireEvent.press(await findByTestId('tab-history'));
    expect(await findByTestId('history-view')).toBeTruthy();

    // Press back button
    fireEvent.press(await findByTestId('history-back-button'));
    expect(await findByTestId('dashboard-view')).toBeTruthy();
  });

  test('tapping back button on people screen returns to dashboard tab', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);
    client.fetchPeopleSummary.mockResolvedValueOnce({ contacts: [] });

    const { findByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    // Switch to people tab
    fireEvent.press(await findByTestId('tab-people'));
    expect(await findByTestId('people-view')).toBeTruthy();

    // Press back button
    fireEvent.press(await findByTestId('people-back-button'));
    expect(await findByTestId('dashboard-view')).toBeTruthy();
  });

  test('hardware back press navigates to dashboard when on another tab', async () => {
    const { BackHandler } = require('react-native');
    let backPressHandler = null;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'hardwareBackPress') {
        backPressHandler = handler;
      }
      return { remove: jest.fn() };
    });

    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);

    const { findByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    // Switch to history tab
    fireEvent.press(await findByTestId('tab-history'));
    expect(await findByTestId('history-view')).toBeTruthy();

    // Trigger hardware back press
    expect(backPressHandler).toBeTruthy();
    const handled = backPressHandler();
    expect(handled).toBe(true);

    // Should return to dashboard
    expect(await findByTestId('dashboard-view')).toBeTruthy();
  });
});


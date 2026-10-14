import React from 'react';
import { render, fireEvent, waitFor, act, cleanup } from '@testing-library/react-native';
import HomeScreen from '../src/screens/HomeScreen';
import * as client from '../src/api/client';
import * as supabaseApi from '../src/api/supabase';
import * as SecureStore from 'expo-secure-store';
import CoinButton, { TOOLTIP_PERSIST_KEY } from '../src/components/ui/CoinButton';

jest.mock('../src/api/client');
jest.mock('../src/api/supabase');
jest.mock('expo-secure-store');

describe('HomeScreen Component & Navigation Shell', () => {
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
    SecureStore.getItemAsync.mockResolvedValue('true'); // Default tooltip seen
  });

  afterEach(async () => {
    cleanup();
  });

  test('renders auth screen when not authenticated', async () => {
    const { findByTestId } = await render(<HomeScreen />);
    expect(await findByTestId('auth-screen')).toBeTruthy();
  });

  test('renders header, dashboard tab, custom tab bar, and Me screen when authenticated', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);

    const { findByText, findByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    expect(await findByText('Pappu')).toBeTruthy();
    expect(await findByTestId('dashboard-view')).toBeTruthy();

    // 5-Slot Tab Bar visible with Stitch tokens
    expect(await findByTestId('tab-dashboard')).toBeTruthy();
    expect(await findByTestId('tab-assistant')).toBeTruthy();
    expect(await findByTestId('tab-history')).toBeTruthy();
    expect(await findByTestId('tab-people')).toBeTruthy();
    expect(await findByTestId('tab-me')).toBeTruthy();

    // Switch to Me tab per Stitch navigation structure
    const meTab = await findByTestId('tab-me');
    fireEvent.press(meTab);

    // Profile screen displays user email and signout button
    expect(await findByTestId('user-email-header')).toHaveTextContent('test@pappu.dev');
    expect(await findByTestId('auth-signout-button')).toBeTruthy();
  });

  test('switching to assistant tab opens modal with conversation container and closes with back button', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);

    const { findByTestId, queryByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    // Tap center coin button to open Assistant modal
    const coinBtn = await findByTestId('tab-assistant');
    fireEvent.press(coinBtn);

    expect(await findByTestId('conversation-container')).toBeTruthy();

    // Close assistant modal
    const closeBtn = await findByTestId('conversation-back-button');
    fireEvent.press(closeBtn);

    // Returns to dashboard view
    expect(await findByTestId('dashboard-view')).toBeTruthy();
  });

  test('submitting an add transaction mutates and refreshes dashboard live without manual reload', async () => {
    client.fetchSummary
      .mockResolvedValueOnce(initialSummary)
      .mockResolvedValueOnce(updatedSummary);

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

    // Switch to assistant modal
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

  test('tapping sign out on Me screen confirms via dialog and returns to AuthScreen', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);
    supabaseApi.signOut.mockResolvedValueOnce();

    const { findByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    // Open Me tab and trigger sign out
    const meTab = await findByTestId('tab-me');
    fireEvent.press(meTab);

    const signOutBtn = await findByTestId('auth-signout-button');
    fireEvent.press(signOutBtn);

    // Confirm in dialog
    const confirmBtn = await findByTestId('dialog-signout-confirm');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(supabaseApi.signOut).toHaveBeenCalled();
    });

    expect(await findByTestId('auth-screen')).toBeTruthy();
  });

  test('tab switching between Home, History, People, and Me operates cleanly', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);
    client.fetchPeopleSummary.mockResolvedValueOnce({ contacts: [] });

    const { findByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    // Switch to History
    fireEvent.press(await findByTestId('tab-history'));
    expect(await findByTestId('history-view')).toBeTruthy();

    // Switch to People
    fireEvent.press(await findByTestId('tab-people'));
    expect(await findByTestId('people-view')).toBeTruthy();

    // Switch to Me
    fireEvent.press(await findByTestId('tab-me'));
    expect(await findByTestId('me-screen')).toBeTruthy();

    // Switch back to Home
    fireEvent.press(await findByTestId('tab-dashboard'));
    expect(await findByTestId('dashboard-view')).toBeTruthy();
  });

  test('tapping back button on history screen returns to dashboard tab', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);

    const { findByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    fireEvent.press(await findByTestId('tab-history'));
    expect(await findByTestId('history-view')).toBeTruthy();

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

    fireEvent.press(await findByTestId('tab-people'));
    expect(await findByTestId('people-view')).toBeTruthy();

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

    fireEvent.press(await findByTestId('tab-history'));
    expect(await findByTestId('history-view')).toBeTruthy();

    expect(backPressHandler).toBeTruthy();
    const handled = backPressHandler();
    expect(handled).toBe(true);

    expect(await findByTestId('dashboard-view')).toBeTruthy();
  });

  test('first launch tooltip "Tap me to talk." renders once and persists on dismissal', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);
    SecureStore.getItemAsync.mockResolvedValueOnce(null); // First launch: not seen

    const { findByTestId, queryByTestId } = await render(
      <HomeScreen initialSession={mockSession} initialTooltipVisible={true} />
    );

    // Tooltip should be visible
    expect(await findByTestId('coin-tooltip')).toBeTruthy();

    // Tap tooltip to dismiss
    fireEvent.press(await findByTestId('coin-tooltip'));

    // Should be dismissed
    await waitFor(() => {
      expect(queryByTestId('coin-tooltip')).toBeNull();
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOOLTIP_PERSIST_KEY, 'true');
  });

  test('coin press and release under 300ms is treated as a tap to open assistant', async () => {
    client.fetchSummary.mockResolvedValueOnce(initialSummary);
    client.fetchTransactions.mockResolvedValueOnce([]);

    const { findByTestId } = await render(
      <HomeScreen initialSession={mockSession} />
    );

    const coinBtn = await findByTestId('tab-assistant');

    // Press in and release immediately (<300ms)
    fireEvent(coinBtn, 'pressIn');
    fireEvent(coinBtn, 'pressOut');

    // Assistant modal opens
    expect(await findByTestId('conversation-container')).toBeTruthy();

    // Close assistant modal and wait for dashboard to return
    fireEvent.press(await findByTestId('conversation-back-button'));
    expect(await findByTestId('dashboard-view')).toBeTruthy();
  });
});


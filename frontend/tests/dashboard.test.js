import React from 'react';
import { render, waitFor, screen, fireEvent } from '@testing-library/react-native';
import Dashboard from '../src/components/Dashboard';
import * as client from '../src/api/client';

jest.mock('../src/api/client');

describe('Dashboard Component (Analytics-first Redesign)', () => {
  const mockSummary = {
    period: 'week',
    total_spent: 4500.5,
    total_income: 10000.0,
    net: 5499.5,
    previous_period_spent: 3000.0,
    spent_delta_percentage: 50.0,
    daily_buckets: [
      { date: '2026-10-12', label: 'Mon', amount: 500.0 },
      { date: '2026-10-13', label: 'Tue', amount: 1500.0 },
      { date: '2026-10-14', label: 'Wed', amount: 2500.5 },
    ],
    categories: [
      { category: 'Food', amount: 2500.5, percentage: 56 },
      { category: 'Transport', amount: 2000.0, percentage: 44 },
    ],
    people: {
      total_owed_to_user: 1200.0,
      total_user_owes: 400.0,
      top_contacts: [
        { id: 'c1', name: 'Rahul', net_balance: 1200.0 },
        { id: 'c2', name: 'Anjali', net_balance: -400.0 },
      ],
    },
    // Backwards compatibility fields
    balance: 4500.5,
    total_income: 10000.0,
    total_expense: 5499.5,
    category_breakdown: [
      { category_id: 1, category_name: 'Food', type: 'expense', total_amount: 2500.5, count: 2 },
      { category_id: 2, category_name: 'Transport', type: 'expense', total_amount: 2000.0, count: 1 },
    ],
    transaction_count: 3,
  };

  const mockTransactions = [
    { id: 'txn-1', type: 'expense', amount: 450.0, category_name: 'Food', description: 'lunch', txn_date: '2026-10-14' },
    { id: 'txn-2', type: 'income', amount: 10000.0, category_name: 'Salary', description: 'monthly salary', txn_date: '2026-10-14' },
    { id: 'txn-3', type: 'expense', amount: 200.0, category_name: 'Transport', description: 'bus', txn_date: '2026-10-13' },
    { id: 'txn-4', type: 'expense', amount: 150.0, category_name: 'Food', description: 'coffee', txn_date: '2026-10-13' },
    { id: 'txn-5', type: 'expense', amount: 120.0, category_name: 'Food', description: 'tea', txn_date: '2026-10-12' },
    { id: 'txn-6', type: 'expense', amount: 80.0, category_name: 'Other', description: 'misc', txn_date: '2026-10-11' }, // 6th item (should be capped at 5)
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders hero card with period spend, delta chip, and secondary figures', async () => {
    const { getByTestId, queryByTestId } = await render(
      <Dashboard initialSummary={mockSummary} initialTransactions={mockTransactions} />
    );

    expect(getByTestId('dashboard-balance')).toHaveTextContent(/₹4,?500(\.50)?/);
    expect(getByTestId('dashboard-income')).toHaveTextContent(/\+₹10,?000(\.00)?/);
    expect(getByTestId('dashboard-expense')).toHaveTextContent(/\+₹5,?499(\.50)?/);

    // Floating undo should NOT be present on the dashboard per spec
    expect(queryByTestId('dashboard-undo-button')).toBeNull();
  });

  test('period toggle refetches data with selected period and re-renders', async () => {
    client.fetchSummary.mockResolvedValue(mockSummary);
    client.fetchTransactions.mockResolvedValue(mockTransactions);

    const { getByTestId } = await render(<Dashboard token="test_token" />);

    await waitFor(() => {
      expect(client.fetchSummary).toHaveBeenCalledWith('test_token', 'week');
    });

    // Toggle to Month
    fireEvent.press(getByTestId('segment-month'));

    await waitFor(() => {
      expect(client.fetchSummary).toHaveBeenCalledWith('test_token', 'month');
    });
  });

  test('recent activity displays at most 5 rows and See all navigates to History', async () => {
    const onNavigateToHistoryMock = jest.fn();
    const { getByTestId, queryByTestId, getByText } = await render(
      <Dashboard
        initialSummary={mockSummary}
        initialTransactions={mockTransactions}
        onNavigateToHistory={onNavigateToHistoryMock}
      />
    );

    // Items 1 through 5 exist
    expect(getByTestId('txn-item-txn-1')).toBeTruthy();
    expect(getByTestId('txn-item-txn-2')).toBeTruthy();
    expect(getByTestId('txn-item-txn-3')).toBeTruthy();
    expect(getByTestId('txn-item-txn-4')).toBeTruthy();
    expect(getByTestId('txn-item-txn-5')).toBeTruthy();
    // 6th item should not be rendered in recent list
    expect(queryByTestId('txn-item-txn-6')).toBeNull();

    // Tapping See all navigates to History
    fireEvent.press(getByText('See all'));
    expect(onNavigateToHistoryMock).toHaveBeenCalledTimes(1);
  });

  test('people card displays contact rows and navigates to contact detail', async () => {
    const onNavigateToPeopleMock = jest.fn();
    const { getByText } = await render(
      <Dashboard
        initialSummary={mockSummary}
        initialTransactions={mockTransactions}
        onNavigateToPeople={onNavigateToPeopleMock}
      />
    );

    expect(getByText('Rahul')).toBeTruthy();
    expect(getByText('Anjali')).toBeTruthy();

    fireEvent.press(getByText('Rahul'));
    expect(onNavigateToPeopleMock).toHaveBeenCalledWith('c1');
  });

  test('category click calls onNavigateToHistory with category and period filter', async () => {
    const onNavigateToHistoryMock = jest.fn();
    const { getByText } = await render(
      <Dashboard
        initialSummary={mockSummary}
        initialTransactions={mockTransactions}
        onNavigateToHistory={onNavigateToHistoryMock}
      />
    );

    fireEvent.press(getByText('Food'));
    expect(onNavigateToHistoryMock).toHaveBeenCalledWith({
      category: 'Food',
      period: 'week',
    });
  });

  test('renders empty states when no transactions or categories exist', async () => {
    const emptySummary = {
      period: 'week',
      total_spent: 0,
      total_income: 0,
      net: 0,
      categories: [],
      daily_buckets: [],
      people: { total_owed_to_user: 0, total_user_owes: 0, top_contacts: [] },
      balance: 0,
      total_expense: 0,
      category_breakdown: [],
      transaction_count: 0,
    };

    const { getByTestId } = await render(
      <Dashboard initialSummary={emptySummary} initialTransactions={[]} />
    );

    expect(getByTestId('dashboard-balance')).toHaveTextContent(/₹0(\.00)?/);
    expect(getByTestId('empty-categories-text')).toHaveTextContent(/No (categories recorded yet|spending logged yet this week)/);
    expect(getByTestId('empty-transactions-text')).toHaveTextContent('No recent transactions.');
  });
});

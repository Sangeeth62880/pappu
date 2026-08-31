import React from 'react';
import { render, waitFor, screen } from '@testing-library/react-native';
import Dashboard from '../src/components/Dashboard';
import * as client from '../src/api/client';

jest.mock('../src/api/client');

describe('Dashboard Component', () => {
  const mockSummary = {
    balance: 4500.5,
    total_income: 10000.0,
    total_expense: 5499.5,
    category_breakdown: [
      { category_id: 1, category_name: 'Salary', type: 'income', total_amount: 10000.0, count: 1 },
      { category_id: 2, category_name: 'Food', type: 'expense', total_amount: 3200.0, count: 4 },
      { category_id: 3, category_name: 'Transport', type: 'expense', total_amount: 2299.5, count: 2 },
    ],
    transaction_count: 7,
  };

  const mockTransactions = [
    {
      id: 'txn-1',
      type: 'expense',
      amount: 450.0,
      category_name: 'Food',
      description: 'lunch',
      txn_date: '2026-08-31',
    },
    {
      id: 'txn-2',
      type: 'income',
      amount: 10000.0,
      category_name: 'Salary',
      description: 'monthly salary',
      txn_date: '2026-08-30',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders initial summary and transaction totals correctly without fetching', async () => {
    const { getByTestId, getByText } = await render(
      <Dashboard
        initialSummary={mockSummary}
        initialTransactions={mockTransactions}
      />
    );

    expect(getByTestId('dashboard-balance')).toHaveTextContent('₹4500.50');
    expect(getByTestId('dashboard-income')).toHaveTextContent('+₹10000.00');
    expect(getByTestId('dashboard-expense')).toHaveTextContent('-₹5499.50');

    // Category breakdown items
    expect(getByTestId('category-item-1')).toHaveTextContent(/Salary/);
    expect(getByTestId('category-item-1')).toHaveTextContent(/10000\.00/);
    expect(getByTestId('category-item-2')).toHaveTextContent(/Food/);
    expect(getByTestId('category-item-2')).toHaveTextContent(/3200\.00/);

    // Recent transactions
    expect(getByTestId('txn-item-txn-1')).toHaveTextContent(/Food/);
    expect(getByTestId('txn-item-txn-1')).toHaveTextContent(/450\.00/);
    expect(getByTestId('txn-item-txn-1')).toHaveTextContent(/lunch/);

    expect(getByTestId('txn-item-txn-2')).toHaveTextContent(/Salary/);
    expect(getByTestId('txn-item-txn-2')).toHaveTextContent(/10000\.00/);
  });

  test('fetches summary and transaction data when token is supplied', async () => {
    client.fetchSummary.mockResolvedValueOnce(mockSummary);
    client.fetchTransactions.mockResolvedValueOnce(mockTransactions);

    const { findByTestId } = await render(<Dashboard token="test_token" />);

    await waitFor(() => {
      expect(client.fetchSummary).toHaveBeenCalledWith('test_token');
      expect(client.fetchTransactions).toHaveBeenCalledWith('test_token', { limit: 10 });
    });

    const balanceEl = await findByTestId('dashboard-balance');
    expect(balanceEl).toHaveTextContent('₹4500.50');
  });

  test('renders empty state messages when no transactions or categories exist', async () => {
    const emptySummary = {
      balance: 0,
      total_income: 0,
      total_expense: 0,
      category_breakdown: [],
      transaction_count: 0,
    };

    const { getByTestId } = await render(
      <Dashboard
        initialSummary={emptySummary}
        initialTransactions={[]}
      />
    );

    expect(getByTestId('dashboard-balance')).toHaveTextContent('₹0.00');
    expect(getByTestId('empty-categories-text')).toHaveTextContent('No categories recorded yet.');
    expect(getByTestId('empty-transactions-text')).toHaveTextContent('No recent transactions.');
  });
});

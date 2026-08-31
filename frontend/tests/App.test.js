import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../App';
import * as client from '../src/api/client';

jest.mock('../src/api/client');

describe('App root screen rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    client.fetchSummary.mockResolvedValue({
      balance: 0,
      total_income: 0,
      total_expense: 0,
      category_breakdown: [],
      transaction_count: 0,
    });
    client.fetchTransactions.mockResolvedValue([]);
  });

  it('renders without throwing error and displays app name and subtitle', async () => {
    const { findByText } = await render(<App />);
    expect(await findByText('Pappu')).toBeTruthy();
    expect(await findByText('Financial Voice Assistant')).toBeTruthy();
  });
});

import React from 'react';
import { render, fireEvent, waitFor, screen, cleanup, act } from '@testing-library/react-native';
import HistoryScreen, { parseISTDate, formatISTDateGroup, isWithinPeriod } from '../src/components/HistoryScreen';
import * as client from '../src/api/client';
import { invalidateOnTransactionChange } from '../src/data/queryKeys';

jest.mock('../src/api/client');
jest.mock('../src/data/queryKeys', () => ({
  ...jest.requireActual('../src/data/queryKeys'),
  invalidateOnTransactionChange: jest.fn(() => Promise.resolve()),
}));

describe('HistoryScreen and Stitch History Specification', () => {
  const mockToken = 'mock_jwt_token_456';

  const mockTxnExpense = {
    id: 'txn-1',
    type: 'expense',
    amount: 250,
    category_name: 'Food',
    description: 'Lunch',
    txn_date: '2026-10-14',
    created_at: '2026-10-14T07:45:00Z', // 1:15 PM IST
  };

  const mockTxnIncome = {
    id: 'txn-2',
    type: 'income',
    amount: 15000,
    category_name: 'Salary',
    description: 'Monthly Salary',
    txn_date: '2026-10-14',
    created_at: '2026-10-14T03:30:00Z', // 9:00 AM IST
  };

  const mockTxnPeopleReceived = {
    id: 'txn-3',
    type: 'income',
    amount: 300,
    category_name: 'People',
    contact_id: 'contact-rahul',
    contact_name: 'Rahul',
    description: 'UPI Settlement',
    txn_date: '2026-10-14',
    created_at: '2026-10-14T18:00:00Z', // 23:30 IST on Oct 14!
  };

  const mockTxnLateNightNextDay = {
    id: 'txn-4',
    type: 'expense',
    amount: 80,
    category_name: 'Transport',
    description: 'Late Night Auto',
    txn_date: '2026-10-15',
    created_at: '2026-10-14T19:00:00Z', // 00:30 IST on Oct 15!
  };

  const getInitialTransactions = () => [
    { ...mockTxnExpense },
    { ...mockTxnIncome },
    { ...mockTxnPeopleReceived },
    { ...mockTxnLateNightNextDay },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    client.fetchTransactions.mockImplementation(() => Promise.resolve(getInitialTransactions()));
  });

  // ── 1. IST Grouping at 23:30 ──
  describe('IST Date Grouping at 23:30 IST', () => {
    test('correctly groups timestamp at 23:30 IST into the current day', () => {
      // 18:00 UTC = 23:30 IST (+5:30)
      const parsed2330 = parseISTDate('2026-10-14T18:00:00Z');
      expect(parsed2330.dateKey).toBe('2026-10-14');
      expect(parsed2330.date).toBe(14);
      expect(parsed2330.month).toBe(9); // Oct (0-indexed)

      // Reference date as 2026-10-14 12:00 UTC (17:30 IST)
      const refDate = new Date('2026-10-14T12:00:00Z');
      const label = formatISTDateGroup('2026-10-14T18:00:00Z', refDate);
      expect(label).toBe('Today, 14 Oct');
    });

    test('correctly places timestamp after midnight IST (19:00 UTC = 00:30 IST) into the next day', () => {
      // 19:00 UTC = 00:30 IST on Oct 15
      const parsed0030 = parseISTDate('2026-10-14T19:00:00Z');
      expect(parsed0030.dateKey).toBe('2026-10-15');
      expect(parsed0030.date).toBe(15);
      expect(parsed0030.month).toBe(9); // Oct
    });
  });

  // ── 2. Filters (All, Expenses, Income, People) ──
  describe('Filter Chips', () => {
    test('renders filter chips and filters correctly', async () => {
      await render(<HistoryScreen token={mockToken} />);

      await waitFor(() => {
        expect(screen.getByText('Lunch')).toBeTruthy();
        expect(screen.getByText('Monthly Salary')).toBeTruthy();
      });

      // Filter by Expenses
      fireEvent.press(screen.getByTestId('history-filter-expense'));
      await waitFor(() => {
        expect(screen.getByText('Lunch')).toBeTruthy();
        expect(screen.getByText('Late Night Auto')).toBeTruthy();
        expect(screen.queryByText('Monthly Salary')).toBeNull();
      });

      // Filter by Income
      fireEvent.press(screen.getByTestId('history-filter-income'));
      await waitFor(() => {
        expect(screen.getByText('Monthly Salary')).toBeTruthy();
        expect(screen.getByText('Rahul')).toBeTruthy();
        expect(screen.queryByText('Lunch')).toBeNull();
      });

      // Filter by People
      fireEvent.press(screen.getByTestId('history-filter-people'));
      await waitFor(() => {
        expect(screen.getByText('Rahul')).toBeTruthy();
        expect(screen.queryByText('Monthly Salary')).toBeNull();
        expect(screen.queryByText('Lunch')).toBeNull();
      });

      // Reset to All
      fireEvent.press(screen.getByTestId('history-filter-all'));
      await waitFor(() => {
        expect(screen.getByText('Lunch')).toBeTruthy();
        expect(screen.getByText('Monthly Salary')).toBeTruthy();
        expect(screen.getByText('Rahul')).toBeTruthy();
      });
    });
  });

  // ── 3. Income Label (Prompt 4 Fix & No Arrow Glyphs) ──
  describe('Row Subtitle and Typography', () => {
    test('displays Income for income and Received for person income without arrow glyphs', async () => {
      await render(<HistoryScreen token={mockToken} />);

      await waitFor(() => {
        expect(screen.getByText('Monthly Salary')).toBeTruthy();
      });

      // Income texts exist (filter chip + row subtitle)
      const incomeTexts = screen.getAllByText('Income');
      expect(incomeTexts.length).toBeGreaterThanOrEqual(2);

      // Person received row subtitle is "Received"
      expect(screen.getByText('Received')).toBeTruthy();

      // Food expense subtitle is "Food" (or "Expense")
      expect(screen.getByText('Food')).toBeTruthy();

      // Tabular amounts with signs
      expect(screen.getAllByText('+₹15,000').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('−₹250').length).toBeGreaterThanOrEqual(1);

      // Ensure no arrow glyphs like north_east or south_east exist
      expect(screen.queryByText('north_east')).toBeNull();
      expect(screen.queryByText('south_east')).toBeNull();
      expect(screen.queryByText('north-east')).toBeNull();
      expect(screen.queryByText('south-east')).toBeNull();
    });
  });

  // ── 4. Swipe Delete Confirmation Dialog ──
  describe('Swipe to Delete and Confirmation Dialog', () => {
    test('reveals delete action and opening confirmation dialog displays Pappu concerned pose', async () => {
      await render(<HistoryScreen token={mockToken} />);

      await waitFor(() => {
        expect(screen.getByTestId('history-delete-btn-txn-1')).toBeTruthy();
      });

      // Trigger delete action via delete button
      fireEvent.press(screen.getByTestId('history-delete-btn-txn-1'));

      // Delete confirmation dialog is visible
      await waitFor(() => {
        expect(screen.getByTestId('history-delete-dialog-card')).toBeTruthy();
        expect(screen.getByText('Delete this transaction?')).toBeTruthy();
        expect(screen.getByTestId('history-delete-dialog-mascot')).toBeTruthy();
        expect(screen.getByText('Keep it')).toBeTruthy();
        expect(screen.getByText('Delete')).toBeTruthy();
      });

      // Cancel keeps the transaction
      fireEvent.press(screen.getByText('Keep it'));
      await waitFor(() => {
        expect(screen.queryByTestId('history-delete-dialog-card')).toBeNull();
        expect(screen.getByText('Lunch')).toBeTruthy();
      });
    });
  });

  // ── 5. Edit Save ──
  describe('Edit Transaction Sheet Flow', () => {
    test('tapping row opens edit sheet with prefilled fields and saving updates transaction', async () => {
      const onShowToastMock = jest.fn();
      client.updateTransaction.mockResolvedValueOnce({
        ...mockTxnExpense,
        amount: 320,
        description: 'Special Lunch',
      });

      await render(
        <HistoryScreen token={mockToken} onShowToast={onShowToastMock} />
      );

      await waitFor(() => {
        expect(screen.getByText('Lunch')).toBeTruthy();
      });

      // Tap row to open edit sheet
      fireEvent.press(screen.getByTestId('history-txn-txn-1'));

      await waitFor(() => {
        expect(screen.getByTestId('transaction-edit-sheet')).toBeTruthy();
        expect(screen.getByTestId('edit-txn-amount-input').props.value).toBe('250');
        expect(screen.getByTestId('edit-txn-desc-input').props.value).toBe('Lunch');
      });

      // Change amount and description
      const amountInput = await screen.findByTestId('edit-txn-amount-input');
      fireEvent.changeText(amountInput, '320');
      const descInput = await screen.findByTestId('edit-txn-desc-input');
      fireEvent.changeText(descInput, 'Special Lunch');

      // Press Save
      const saveBtn = await screen.findByTestId('edit-txn-save-button');
      fireEvent.press(saveBtn);

      await waitFor(() => {
        expect(client.updateTransaction).toHaveBeenCalledWith(
          mockToken,
          'txn-1',
          expect.objectContaining({
            amount: 320,
            description: 'Special Lunch',
            category_name: 'Food',
          })
        );
        expect(onShowToastMock).toHaveBeenCalledWith('Transaction updated');
        expect(screen.getByText('Special Lunch')).toBeTruthy();
      });
    });
  });

  // ── 6. Confirm Delete Flow ──
  describe('Confirm Delete Flow', () => {
    test('confirming delete calls deleteTransaction and removes row', async () => {
      const onShowToastMock = jest.fn();
      client.deleteTransaction.mockResolvedValueOnce({ status: 'deleted' });

      await render(
        <HistoryScreen token={mockToken} onShowToast={onShowToastMock} />
      );

      await waitFor(() => {
        expect(screen.getByText('Lunch')).toBeTruthy();
      });

      // Open delete dialog
      fireEvent.press(screen.getByTestId('history-delete-btn-txn-1'));

      await waitFor(() => {
        expect(screen.getByText('Delete this transaction?')).toBeTruthy();
      });

      // Confirm Delete
      fireEvent.press(screen.getByTestId('history-delete-dialog-confirm'));

      await waitFor(() => {
        expect(client.deleteTransaction).toHaveBeenCalledWith(mockToken, 'txn-1');
        expect(screen.queryByText('Lunch')).toBeNull();
        expect(onShowToastMock).toHaveBeenCalledWith('Transaction deleted');
        expect(screen.queryByTestId('history-delete-dialog')).toBeNull();
      });
    });
  });

  // ── 7. Optimistic Update with Rollback on Failure ──
  describe('Optimistic Updates with Rollback', () => {
    test('rolls back row restoration on delete failure', async () => {
      const onShowToastMock = jest.fn();
      client.deleteTransaction.mockRejectedValueOnce(new Error('Network connection lost'));

      await render(
        <HistoryScreen token={mockToken} onShowToast={onShowToastMock} />
      );

      await waitFor(() => {
        expect(screen.getByText('Lunch')).toBeTruthy();
      });

      // Trigger delete dialog
      fireEvent.press(screen.getByTestId('history-delete-btn-txn-1'));

      await waitFor(() => {
        expect(screen.getByText('Delete this transaction?')).toBeTruthy();
      });

      // Confirm delete
      fireEvent.press(screen.getByTestId('history-delete-dialog-confirm'));

      // Row was optimistically removed, but on rejection it is RESTORED!
      await waitFor(() => {
        expect(screen.getByText('Lunch')).toBeTruthy();
        expect(onShowToastMock).toHaveBeenCalledWith('Failed to delete: Network connection lost');
      });
    });

    test('rolls back edit changes on update failure', async () => {
      const onShowToastMock = jest.fn();
      client.updateTransaction.mockRejectedValueOnce(new Error('Server unavailable'));

      await render(
        <HistoryScreen token={mockToken} onShowToast={onShowToastMock} />
      );

      await waitFor(() => {
        expect(screen.getByText('Lunch')).toBeTruthy();
      });

      // Open edit sheet
      fireEvent.press(screen.getByTestId('history-txn-txn-1'));

      await waitFor(() => {
        expect(screen.getByTestId('edit-txn-amount-input')).toBeTruthy();
      });

      // Change amount
      const amountInput = await screen.findByTestId('edit-txn-amount-input');
      fireEvent.changeText(amountInput, '999');
      const saveBtn = await screen.findByTestId('edit-txn-save-button');
      fireEvent.press(saveBtn);

      await waitFor(() => {
        expect(onShowToastMock).toHaveBeenCalledWith('Failed to update: Server unavailable');
        // Remains original 250 amount
        expect(screen.getAllByText('−₹250').length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ── 8. Filter Handoff from Home ──
  describe('Filter Handoff from Home', () => {
    test('accepts initial category and period filter from Home and renders clearable filter pill', async () => {
      await render(
        <HistoryScreen
          token={mockToken}
          initialFilter={{ category: 'Food', period: 'month' }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Lunch')).toBeTruthy();
        expect(screen.queryByText('Late Night Auto')).toBeNull();
        expect(screen.getByTestId('history-active-category-pill')).toBeTruthy();
        expect(screen.getByText('Food ✕')).toBeTruthy();
      });

      // Clearing category pill reveals other transactions
      fireEvent.press(screen.getByTestId('history-active-category-pill'));

      await waitFor(() => {
        expect(screen.queryByTestId('history-active-category-pill')).toBeNull();
      });
    });
  });

  // ── 9. Empty State with Sleepy Mascot ──
  describe('Empty State', () => {
    test('renders sleepy mascot and empty state when 0 transactions exist', async () => {
      client.fetchTransactions.mockImplementationOnce(() => Promise.resolve([]));

      await render(<HistoryScreen token={mockToken} />);

      await waitFor(() => {
        expect(screen.getByTestId('history-empty-state')).toBeTruthy();
        expect(screen.getByText('Nothing here yet')).toBeTruthy();
        expect(screen.getByText('Tap the coin or hold to record an expense.')).toBeTruthy();
      });
    });
  });

  // ── 10. Search ──
  describe('Search functionality', () => {
    test('filters transactions when typing in search input', async () => {
      await render(
        <HistoryScreen token={mockToken} initialSearchOpen={true} />
      );

      await waitFor(() => {
        expect(screen.getByTestId('history-search-input')).toBeTruthy();
      });

      fireEvent.changeText(screen.getByTestId('history-search-input'), 'Auto');

      await waitFor(() => {
        expect(screen.getByText('Late Night Auto')).toBeTruthy();
        expect(screen.queryByText('Lunch')).toBeNull();
      });
    });
  });
});

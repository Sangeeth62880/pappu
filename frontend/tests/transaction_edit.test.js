import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import TransactionEditSheet from '../src/components/ui/TransactionEditSheet';
import * as client from '../src/api/client';

jest.mock('../src/api/client');

describe('TransactionEditSheet Component', () => {
  const mockToken = 'mock_jwt_token_123';
  const mockTxn = {
    id: 'txn-123',
    type: 'expense',
    amount: 450,
    category_name: 'Food',
    description: 'Dinner at cafe',
    txn_date: '2026-08-30',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('pre-fills transaction fields when visible', async () => {
    await render(
      <TransactionEditSheet
        visible={true}
        onClose={jest.fn()}
        transaction={mockTxn}
        token={mockToken}
      />
    );

    expect(screen.getByTestId('edit-txn-amount-input').props.value).toBe('450');
    expect(screen.getByTestId('edit-txn-desc-input').props.value).toBe('Dinner at cafe');
    expect(screen.getByTestId('edit-txn-date-input').props.value).toBe('2026-08-30');
    expect(screen.getByText('Food')).toBeTruthy();
  });

  test('submitting edit calls updateTransaction with modified fields', async () => {
    const onSavedMock = jest.fn();
    const onCloseMock = jest.fn();

    client.updateTransaction.mockResolvedValueOnce({
      ...mockTxn,
      amount: 600,
      description: 'Dinner with friends',
    });

    await render(
      <TransactionEditSheet
        visible={true}
        onClose={onCloseMock}
        transaction={mockTxn}
        token={mockToken}
        onSaved={onSavedMock}
      />
    );

    // Change amount
    const amountInput = await screen.findByTestId('edit-txn-amount-input');
    fireEvent.changeText(amountInput, '600');

    // Change description
    const descInput = await screen.findByTestId('edit-txn-desc-input');
    fireEvent.changeText(descInput, 'Dinner with friends');

    // Save
    const saveBtn = await screen.findByTestId('edit-txn-save-button');
    fireEvent.press(saveBtn);

    await waitFor(() => {
      expect(client.updateTransaction).toHaveBeenCalledWith(
        mockToken,
        'txn-123',
        expect.objectContaining({
          amount: 600,
          description: 'Dinner with friends',
          category_name: 'Food',
        })
      );
      expect(onSavedMock).toHaveBeenCalledTimes(1);
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  test('delete flow shows confirmation prompt and triggers deleteTransaction on confirm', async () => {
    const onDeletedMock = jest.fn();
    const onCloseMock = jest.fn();

    client.deleteTransaction.mockResolvedValueOnce({ status: 'deleted', id: 'txn-123' });

    await render(
      <TransactionEditSheet
        visible={true}
        onClose={onCloseMock}
        transaction={mockTxn}
        token={mockToken}
        onDeleted={onDeletedMock}
      />
    );

    // 1. Initial Delete button
    const deleteBtn = await screen.findByTestId('edit-txn-delete-button');
    fireEvent.press(deleteBtn);

    // 2. Stitch confirmation dialog appears
    expect(await screen.findByText('Delete this transaction?')).toBeTruthy();
    expect(await screen.findByText('Keep it')).toBeTruthy();

    // 3. Confirm Delete
    const confirmBtn = await screen.findByTestId('edit-txn-delete-dialog-confirm');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(client.deleteTransaction).toHaveBeenCalledWith(mockToken, 'txn-123');
      expect(onDeletedMock).toHaveBeenCalledWith('txn-123');
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });
});

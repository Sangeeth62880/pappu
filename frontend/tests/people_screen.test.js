global.IS_REACT_ACT_ENVIRONMENT = true;
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import { Share } from 'react-native';
import PeopleScreen, { formatFriendCount, formatTransactionCount } from '../src/components/PeopleScreen';
import * as client from '../src/api/client';
import { queryClient } from '../src/data/queryClient';

jest.mock('../src/api/client');
jest.mock('../src/data/queryClient', () => ({
  queryClient: {
    invalidateQueries: jest.fn().mockResolvedValue(),
  },
}));

describe('PeopleScreen Component', () => {
  const mockToken = 'mock_jwt_token';

  const mockPeopleData = {
    contacts: [
      {
        contact_id: 'contact-uuid-1',
        contact_name: 'Rahul',
        total_sent: 1500.0,
        total_received: 500.0,
        net_balance: 1000.0,
        status: 'owes_you',
        display_text: 'Rahul owes you ₹1000.00',
        transaction_count: 2,
      },
      {
        contact_id: 'contact-uuid-2',
        contact_name: 'Sarah',
        total_sent: 200.0,
        total_received: 500.0,
        net_balance: -300.0,
        status: 'you_owe',
        display_text: 'You owe Sarah ₹300.00',
        transaction_count: 1,
      },
    ],
    total_owed_to_user: 1000.0,
    total_user_owes: 300.0,
  };

  const mockContactDetail = {
    contact_id: 'contact-uuid-1',
    contact_name: 'Rahul',
    total_sent: 1500.0,
    total_received: 500.0,
    net_balance: 1000.0,
    status: 'owes_you',
    display_text: 'Rahul owes you ₹1000.00',
    transactions: [
      {
        id: 'txn-1',
        user_id: 'user-1',
        type: 'expense',
        amount: 1500.0,
        category_id: 8,
        category_name: 'People',
        contact_id: 'contact-uuid-1',
        contact_name: 'Rahul',
        description: 'sent to Rahul',
        txn_date: '2026-08-30',
      },
      {
        id: 'txn-2',
        user_id: 'user-1',
        type: 'income',
        amount: 500.0,
        category_id: 8,
        category_name: 'People',
        contact_id: 'contact-uuid-1',
        contact_name: 'Rahul',
        description: 'Rahul paid back',
        txn_date: '2026-08-31',
      },
    ],
  };

  const mockZeroBalanceContactDetail = {
    contact_id: 'contact-uuid-3',
    contact_name: 'Pooja',
    total_sent: 500.0,
    total_received: 500.0,
    net_balance: 0.0,
    status: 'settled',
    display_text: 'Settled up with Pooja',
    transactions: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client.fetchPeopleSummary.mockResolvedValue(mockPeopleData);
    client.fetchContactDetail.mockResolvedValue(mockContactDetail);
    jest.spyOn(Share, 'share').mockImplementation(() => Promise.resolve({ action: 'sharedAction' }));
  });

  afterEach(() => {
    cleanup();
    Share.share.mockRestore?.();
  });

  test('plurals: formatFriendCount and formatTransactionCount handle singular and plural', () => {
    expect(formatFriendCount(0)).toBe('0 friends');
    expect(formatFriendCount(1)).toBe('1 friend');
    expect(formatFriendCount(2)).toBe('2 friends');
    expect(formatFriendCount(7)).toBe('7 friends');

    expect(formatTransactionCount(0)).toBe('0 transactions');
    expect(formatTransactionCount(1)).toBe('1 transaction');
    expect(formatTransactionCount(2)).toBe('2 transactions');
    expect(formatTransactionCount(5)).toBe('5 transactions');
  });

  test('renders people list with header gold plus, tiles with correct friend plurals, net balance, and contact rows', async () => {
    await render(<PeopleScreen token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByTestId('people-view')).toBeTruthy();
      expect(screen.getByTestId('header-add-person-button')).toBeTruthy();
      expect(screen.getByTestId('owed-to-you-amount')).toBeTruthy();
      expect(screen.getByTestId('you-owe-amount')).toBeTruthy();
      expect(screen.getByTestId('owed-to-you-friends-count').props.children).toBe('1 friend');
      expect(screen.getByTestId('you-owe-friends-count').props.children).toBe('1 friend');
      expect(screen.getByTestId('net-balance-amount')).toBeTruthy();
      expect(screen.getByText('Rahul')).toBeTruthy();
      expect(screen.getByText('Sarah')).toBeTruthy();
      expect(screen.getByText('2 transactions')).toBeTruthy();
      expect(screen.getByText('1 transaction')).toBeTruthy();
    });
  });

  test('add person sheet validates empty name with inline error', async () => {
    await render(<PeopleScreen token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByTestId('header-add-person-button')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('header-add-person-button'));

    await waitFor(() => {
      expect(screen.getByTestId('add-person-sheet')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('add-person-save-button'));
    await waitFor(() => {
      expect(screen.getByTestId('add-person-error-banner')).toBeTruthy();
      expect(screen.getByText('Contact name is required')).toBeTruthy();
    });
  });

  test('add person sheet creates person on valid input, invalidates queries, and closes sheet', async () => {
    client.createContact.mockResolvedValueOnce({
      id: 'contact-uuid-new',
      name: 'Priya',
      phone: '+919876543210',
      upi_id: 'priya@okaxis',
    });

    const mockToast = jest.fn();

    await render(<PeopleScreen token={mockToken} onShowToast={mockToast} />);

    await waitFor(() => {
      expect(screen.getByTestId('header-add-person-button')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('header-add-person-button'));

    await waitFor(() => {
      expect(screen.getByTestId('add-person-name-input')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByTestId('add-person-name-input'), 'Priya');

    await waitFor(() => {
      expect(screen.getByTestId('add-person-name-input').props.value).toBe('Priya');
    });

    fireEvent.press(screen.getByTestId('add-person-save-button'));

    await waitFor(() => {
      expect(client.createContact).toHaveBeenCalledWith(mockToken, {
        name: 'Priya',
        phone: null,
        upi_id: null,
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith('Contact added');
      expect(screen.queryByTestId('add-person-sheet')).toBeNull();
    });
  });


  test('add person sheet displays server error inline for 409 duplicate name rejection', async () => {
    const duplicateError = new Error('A contact with this name already exists');
    duplicateError.status = 409;
    duplicateError.data = { detail: 'A contact with this name already exists' };
    client.createContact.mockRejectedValueOnce(duplicateError);

    await render(<PeopleScreen token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByTestId('header-add-person-button')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('header-add-person-button'));

    await waitFor(() => {
      expect(screen.getByTestId('add-person-name-input')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByTestId('add-person-name-input'), 'Rahul');
    await waitFor(() => {
      expect(screen.getByTestId('add-person-name-input').props.value).toBe('Rahul');
    });

    fireEvent.press(screen.getByTestId('add-person-save-button'));

    await waitFor(() => {
      expect(screen.getByTestId('add-person-error-banner')).toBeTruthy();
      expect(screen.getByText('A contact with this name already exists')).toBeTruthy();
    });
  });

  test('tapping contact opens person detail view with large balance, caption, back button, and transaction list', async () => {
    client.fetchPeopleSummary.mockResolvedValueOnce(mockPeopleData);
    client.fetchContactDetail.mockResolvedValueOnce(mockContactDetail);

    await render(<PeopleScreen token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByTestId('contact-card-contact-uuid-1')).toBeTruthy();
    });

    // Tap Rahul's contact card
    fireEvent.press(screen.getByTestId('contact-card-contact-uuid-1'));

    await waitFor(() => {
      expect(screen.getByTestId('contact-detail-view')).toBeTruthy();
      expect(screen.getByText('Rahul')).toBeTruthy();
      expect(screen.getByTestId('person-detail-caption').props.children).toBe('Rahul owes you');
      expect(screen.getByTestId('person-detail-balance')).toBeTruthy();
      expect(screen.getByTestId('contact-txn-txn-1')).toBeTruthy();
      expect(screen.getByTestId('contact-txn-txn-2')).toBeTruthy();
      expect(screen.getByTestId('remind-person-button')).toBeTruthy();
      expect(screen.getByTestId('pappu-mascot-concerned')).toBeTruthy();
    });

    // Tap back button
    fireEvent.press(screen.getByTestId('back-to-people-button'));

    await waitFor(() => {
      expect(screen.getByTestId('people-view')).toBeTruthy();
    });
  });

  test('detail view: caption correctly says "You owe Sarah" when balance is negative', async () => {
    client.fetchPeopleSummary.mockResolvedValueOnce(mockPeopleData);
    client.fetchContactDetail.mockResolvedValueOnce({
      contact_id: 'contact-uuid-2',
      contact_name: 'Sarah',
      total_sent: 200.0,
      total_received: 500.0,
      net_balance: -300.0,
      status: 'you_owe',
      display_text: 'You owe Sarah ₹300.00',
      transactions: [],
    });

    await render(<PeopleScreen token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByTestId('contact-card-contact-uuid-2')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('contact-card-contact-uuid-2'));

    await waitFor(() => {
      expect(screen.getByTestId('contact-detail-view')).toBeTruthy();
      expect(screen.getByTestId('person-detail-caption').props.children).toBe('You owe Sarah');
      expect(screen.getByTestId('person-detail-balance').props.children.join('')).toContain('−₹300');
    });
  });

  test('remind button opens Share sheet with text from remind endpoint, and is hidden at zero balance', async () => {
    // 1. Non-zero balance: Remind button is present and triggers Share
    client.fetchPeopleSummary.mockResolvedValueOnce(mockPeopleData);
    client.fetchContactDetail.mockResolvedValueOnce(mockContactDetail);
    client.fetchContactRemindText.mockResolvedValueOnce({
      remind_text: 'Hi Rahul, gentle reminder about the pending ₹1,000 from our recent split. You can settle via UPI when you get a chance.',
      text: 'Hi Rahul, gentle reminder about the pending ₹1,000 from our recent split. You can settle via UPI when you get a chance.',
      contact_name: 'Rahul',
      amount: 1000.0,
    });

    await render(<PeopleScreen token={mockToken} initialContactId="contact-uuid-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('remind-person-button')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('remind-person-button'));

    await waitFor(() => {
      expect(client.fetchContactRemindText).toHaveBeenCalledWith(mockToken, 'contact-uuid-1');
      expect(Share.share).toHaveBeenCalledWith({
        message: 'Hi Rahul, gentle reminder about the pending ₹1,000 from our recent split. You can settle via UPI when you get a chance.',
      });
    });

    // 2. Zero balance: Remind button is completely hidden
    client.fetchContactDetail.mockResolvedValueOnce(mockZeroBalanceContactDetail);

    await render(<PeopleScreen token={mockToken} initialContactId="contact-uuid-3" />);

    await waitFor(() => {
      expect(screen.getByTestId('contact-detail-view')).toBeTruthy();
      expect(screen.queryByTestId('remind-person-button')).toBeNull();
      expect(screen.queryByTestId('pappu-mascot-concerned')).toBeNull();
    });
  });

  test('renders token-derived empty state when no contacts exist with working add person action', async () => {
    client.fetchPeopleSummary.mockResolvedValueOnce({
      contacts: [],
      total_owed_to_user: 0.0,
      total_user_owes: 0.0,
    });

    await render(<PeopleScreen token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByTestId('people-empty')).toBeTruthy();
      expect(screen.getByText('No contacts yet')).toBeTruthy();
      expect(screen.getByText('Add person')).toBeTruthy();
    });

    // Tap action button on empty state
    fireEvent.press(screen.getByText('Add person'));

    await waitFor(() => {
      expect(screen.getByTestId('add-person-sheet')).toBeTruthy();
    });
  });

  test('tapping a transaction in detail view opens TransactionEditSheet', async () => {
    client.fetchPeopleSummary.mockResolvedValueOnce(mockPeopleData);
    client.fetchContactDetail.mockResolvedValueOnce(mockContactDetail);

    await render(<PeopleScreen token={mockToken} initialContactId="contact-uuid-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('contact-txn-txn-1')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('contact-txn-txn-1'));

    await waitFor(() => {
      expect(screen.getByTestId('transaction-edit-sheet')).toBeTruthy();
    });
  });
});

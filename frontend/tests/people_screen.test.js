import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import PeopleScreen from '../src/components/PeopleScreen';
import * as client from '../src/api/client';

jest.mock('../src/api/client');

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
        transaction_count: 2,
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders people summary with aggregate balances and contact list', async () => {
    client.fetchPeopleSummary.mockResolvedValueOnce(mockPeopleData);

    const { getByText, getByTestId } = await render(
      <PeopleScreen token={mockToken} />
    );

    await waitFor(() => {
      expect(getByTestId('people-view')).toBeTruthy();
      expect(getByText('₹1000.00')).toBeTruthy(); // total owed to user
      expect(getByText('₹300.00')).toBeTruthy(); // total user owes
      expect(getByText('Rahul')).toBeTruthy();
      expect(getByText('Sarah')).toBeTruthy();
      expect(getByText('+₹1000.00')).toBeTruthy();
      expect(getByText('-₹300.00')).toBeTruthy();
    });
  });

  test('tapping a contact card opens the detail view and back button returns', async () => {
    client.fetchPeopleSummary.mockResolvedValueOnce(mockPeopleData);
    client.fetchContactDetail.mockResolvedValueOnce(mockContactDetail);

    const { getByTestId, getByText } = await render(
      <PeopleScreen token={mockToken} />
    );

    await waitFor(() => {
      expect(getByTestId('contact-card-contact-uuid-1')).toBeTruthy();
    });

    const rahulCard = getByTestId('contact-card-contact-uuid-1');
    fireEvent.press(rahulCard);

    await waitFor(() => {
      expect(getByTestId('contact-detail-view')).toBeTruthy();
      expect(getByText('Rahul owes you ₹1000.00')).toBeTruthy();
      expect(getByText('History with Rahul (2)')).toBeTruthy();
      expect(getByTestId('contact-txn-txn-1')).toBeTruthy();
      expect(getByTestId('contact-txn-txn-2')).toBeTruthy();
    });

    // Click back button
    const backBtn = getByTestId('back-to-people-button');
    fireEvent.press(backBtn);

    await waitFor(() => {
      expect(getByTestId('people-view')).toBeTruthy();
    });
  });

  test('renders empty state when no contacts exist', async () => {
    client.fetchPeopleSummary.mockResolvedValueOnce({
      contacts: [],
      total_owed_to_user: 0.0,
      total_user_owes: 0.0,
    });

    const { getByText } = await render(
      <PeopleScreen token={mockToken} />
    );

    await waitFor(() => {
      expect(getByText('No person-to-person records yet')).toBeTruthy();
    });
  });

});


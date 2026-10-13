import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import HomeScreen from '../src/screens/HomeScreen';
import VoiceListeningSheet from '../src/components/ui/VoiceListeningSheet';
import * as client from '../src/api/client';
import * as supabaseApi from '../src/api/supabase';

jest.mock('../src/api/client');
jest.mock('../src/api/supabase');

describe('Fix 6: Mic Accessible from Every Screen', () => {
  const mockToken = 'mock_jwt_token';
  const mockSession = { access_token: mockToken, user: { email: 'user@example.com' } };

  beforeEach(() => {
    jest.clearAllMocks();
    supabaseApi.getSession.mockResolvedValue(mockSession);
    supabaseApi.supabase = {
      auth: {
        onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      },
    };
    client.fetchSummary.mockResolvedValue({ total_expense: 0, total_income: 0, balance: 0 });
    client.fetchTransactions.mockResolvedValue([]);
    client.fetchPeopleSummary.mockResolvedValue({ total_owed: 0, total_owe: 0, people: [] });
    client.fetchChatHistory.mockResolvedValue({ messages: [], total: 0 });
    client.saveChatMessage.mockResolvedValue({ id: '1' });
  });

  test('header mic button is visible on Home tab and opens VoiceListeningSheet', async () => {
    const { findByTestId, queryByTestId } = await render(
      <HomeScreen initialToken={mockToken} initialSession={mockSession} />
    );

    // Header mic button should exist on Home
    const headerMic = await findByTestId('header-mic-button');
    expect(headerMic).toBeTruthy();

    // Sheet initially not visible
    expect(queryByTestId('voice-listening-sheet')).toBeNull();

    // Press header mic
    fireEvent.press(headerMic);

    // Sheet opens
    expect(await findByTestId('voice-listening-sheet')).toBeTruthy();
  });

  test('header mic button is hidden on Assistant tab to preserve single mic', async () => {
    const { findByText, queryByTestId, findByTestId } = await render(
      <HomeScreen initialToken={mockToken} initialSession={mockSession} />
    );

    // Switch to Assistant tab
    const assistantTab = await findByText('Assistant');
    fireEvent.press(assistantTab);

    // Header mic button is hidden on Assistant tab
    await waitFor(() => {
      expect(queryByTestId('header-mic-button')).toBeNull();
    });

    // Assistant tab's own mic button is present
    expect(await findByTestId('mic-button')).toBeTruthy();
  });

  test('VoiceListeningSheet processes input, displays result, and triggers live update', async () => {
    const mockOnMutated = jest.fn();

    client.parseIntent.mockResolvedValueOnce({
      intent: {
        action: 'add',
        language: 'en',
        fields: { amount: 350, category: 'Food' },
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
      spoken_response: 'Added Food for ₹350.',
    });

    const { findByTestId, findByText } = await render(
      <VoiceListeningSheet
        visible={true}
        onClose={jest.fn()}
        token={mockToken}
        onTransactionMutated={mockOnMutated}
      />
    );

    // Type text in fallback input inside sheet
    const input = await findByTestId('voice-fallback-input');
    fireEvent.changeText(input, 'Dinner 350');

    const sendBtn = await findByTestId('voice-fallback-send');
    fireEvent.press(sendBtn);

    // Result displayed
    expect(await findByText('Added Food for ₹350.')).toBeTruthy();

    // Live update triggered
    await waitFor(() => {
      expect(mockOnMutated).toHaveBeenCalledTimes(1);
    });
  });

  test('VoiceListeningSheet close button dismisses sheet', async () => {
    const mockOnClose = jest.fn();

    const { findByTestId } = await render(
      <VoiceListeningSheet
        visible={true}
        onClose={mockOnClose}
        token={mockToken}
      />
    );

    const closeBtn = await findByTestId('voice-sheet-close-button');
    fireEvent.press(closeBtn);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

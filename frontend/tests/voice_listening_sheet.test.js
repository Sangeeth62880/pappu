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

  test('voice input is accessible from Home tab via center coin button', async () => {
    const { findByTestId } = await render(
      <HomeScreen initialToken={mockToken} initialSession={mockSession} />
    );

    // Center coin tab button exists on Home
    const coinBtn = await findByTestId('tab-assistant');
    expect(coinBtn).toBeTruthy();

    // Tap opens assistant modal
    fireEvent.press(coinBtn);
    expect(await findByTestId('conversation-container')).toBeTruthy();
  });

  test('Assistant modal has its own mic button for voice input', async () => {
    const { findByTestId } = await render(
      <HomeScreen initialToken={mockToken} initialSession={mockSession} />
    );

    // Open Assistant modal
    const coinBtn = await findByTestId('tab-assistant');
    fireEvent.press(coinBtn);

    // Assistant modal's own mic button is present
    expect(await findByTestId('mic-button')).toBeTruthy();
  });

  test('VoiceListeningSheet processes input, displays result, and triggers live update', async () => {
    const mockOnMutated = jest.fn();

    client.sendAssistantMessage.mockResolvedValueOnce({
      display_text: 'Added Food for ₹350.',
      spoken_text: 'Added Food for ₹350.',
      results: [{ kind: 'added', amount: 350 }],
      pending: null,
      changed: true,
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

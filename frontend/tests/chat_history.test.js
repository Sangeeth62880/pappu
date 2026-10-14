import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ConversationLog from '../src/components/ConversationLog';
import HomeScreen from '../src/screens/HomeScreen';
import * as client from '../src/api/client';

jest.mock('../src/api/client');

describe('Persistent Chat History', () => {
  const mockToken = 'mock_jwt_token';

  beforeEach(() => {
    jest.clearAllMocks();
    client.fetchChatHistory.mockResolvedValue({
      messages: [],
      total: 0,
    });
    client.saveChatMessage.mockResolvedValue({
      id: 'msg-1',
      role: 'user',
      text: 'hello',
    });
    client.clearChatHistory.mockResolvedValue({
      status: 'cleared',
      deleted_count: 0,
    });
  });

  test('loads persistent chat history on mount and displays historical messages', async () => {
    client.fetchChatHistory.mockResolvedValueOnce({
      messages: [
        {
          id: '1',
          user_id: 'user-uuid',
          role: 'user',
          text: 'Spent 300 on groceries',
          payload: null,
          created_at: '2026-10-13T10:00:00Z',
        },
        {
          id: '2',
          user_id: 'user-uuid',
          role: 'assistant',
          text: 'Added Groceries transaction for ₹300.',
          payload: { isAddSuccess: true },
          created_at: '2026-10-13T10:00:05Z',
        },
      ],
      total: 2,
    });

    const { findByText } = await render(
      <ConversationLog token={mockToken} />
    );

    expect(await findByText('Spent 300 on groceries')).toBeTruthy();
    expect(await findByText('Added Groceries transaction for ₹300.')).toBeTruthy();
    expect(client.fetchChatHistory).toHaveBeenCalledWith(mockToken, { limit: 50, offset: 0 });
  });

  test('renders historical confirmation cards as resolved', async () => {
    client.fetchChatHistory.mockResolvedValueOnce({
      messages: [
        {
          id: '3',
          user_id: 'user-uuid',
          role: 'assistant',
          text: 'Are you sure you want to delete transaction txn-old?',
          payload: {
            pending: {
              id: 'pend-old',
              action_type: 'delete',
              summary: 'Are you sure you want to delete transaction txn-old?',
            },
          },
          created_at: '2026-10-13T09:00:00Z',
        },
      ],
      total: 1,
    });

    const { findByText } = await render(
      <ConversationLog token={mockToken} />
    );

    expect(await findByText('Are you sure you want to delete transaction txn-old?')).toBeTruthy();
    // Historical confirmation button shows Resolved instead of actionable confirm
    expect(await findByText('Resolved')).toBeTruthy();
  });

  test('persists user message and assistant reply to backend', async () => {
    client.fetchChatHistory.mockResolvedValueOnce({ messages: [], total: 0 });
    client.sendAssistantMessage.mockResolvedValueOnce({
      display_text: 'Added Food transaction for ₹120.',
      spoken_text: 'Added Food transaction for ₹120.',
      results: [{ kind: 'added', amount: 120 }],
      pending: null,
      changed: true,
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Tea and snacks 120');
    const sendBtn = await findByTestId('conversation-send-button');
    fireEvent.press(sendBtn);

    expect(await findByText('Tea and snacks 120')).toBeTruthy();
    expect(await findByText('Added Food transaction for ₹120.')).toBeTruthy();

    await waitFor(() => {
      // User message persisted
      expect(client.saveChatMessage).toHaveBeenCalledWith(
        mockToken,
        expect.objectContaining({ role: 'user', text: 'Tea and snacks 120' })
      );
      // Assistant response persisted
      expect(client.saveChatMessage).toHaveBeenCalledWith(
        mockToken,
        expect.objectContaining({ role: 'assistant', text: 'Added Food transaction for ₹120.' })
      );
    });
  });

  test('clearing chat calls clearChatHistory API and resets conversation', async () => {
    client.fetchChatHistory.mockResolvedValueOnce({
      messages: [
        {
          id: '1',
          user_id: 'user-uuid',
          role: 'user',
          text: 'Hello Pappu',
          payload: null,
          created_at: '2026-10-13T10:00:00Z',
        },
      ],
      total: 1,
    });

    const { findByTestId, findByText, queryByText } = await render(
      <ConversationLog token={mockToken} />
    );

    expect(await findByText('Hello Pappu')).toBeTruthy();

    const clearBtn = await findByTestId('clear-chat-button');
    fireEvent.press(clearBtn);

    await waitFor(() => {
      expect(client.clearChatHistory).toHaveBeenCalledWith(mockToken);
      expect(queryByText('Hello Pappu')).toBeNull();
    });
  });
});

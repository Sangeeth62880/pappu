import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import ConversationLog from '../src/components/ConversationLog';
import VoiceListeningSheet from '../src/components/ui/VoiceListeningSheet';
import * as client from '../src/api/client';

jest.mock('../src/api/client');

describe('Assistant V2 UI and Endpoints', () => {
  const mockToken = 'mock_jwt_token';

  beforeEach(() => {
    jest.clearAllMocks();
    client.fetchChatHistory.mockResolvedValue({ messages: [] });
    client.fetchActivePending.mockResolvedValue(null);
    client.synthesizeSpeech.mockResolvedValue({ audio_base64: 'bW9jaw==' });
  });

  test('no client side keyword list remains in ConversationLog source', () => {
    const filePath = path.join(__dirname, '../src/components/ConversationLog.js');
    const content = fs.readFileSync(filePath, 'utf8');

    // Prove that hardcoded confirmation keywords list does not exist
    expect(content.includes('aam')).toBe(false);
    expect(content.includes("['yes', 'confirm'")).toBe(false);
    expect(content.includes('pendingConfirmation')).toBe(false);
  });

  test('submitting a message routes through sendAssistantMessage with client_msg_id', async () => {
    const mockOnMutated = jest.fn();

    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Added lunch for 250 rupees.',
      display_text: 'Added Lunch expense for ₹250.',
      results: [{ kind: 'added', amount: 250, category: 'Food', heard_amount: 250 }],
      pending: null,
      changed: true,
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} assistantV2={true} onTransactionMutated={mockOnMutated} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Spent 250 on lunch today');

    const sendBtn = await findByTestId('conversation-send-button');
    fireEvent.press(sendBtn);

    expect(await findByText('Spent 250 on lunch today')).toBeTruthy();
    expect(await findByText('Added Lunch expense for ₹250.')).toBeTruthy();

    await waitFor(() => {
      expect(client.sendAssistantMessage).toHaveBeenCalledWith(
        mockToken,
        expect.objectContaining({
          text: 'Spent 250 on lunch today',
          input: 'typed',
          client_msg_id: expect.any(String),
        })
      );
      expect(mockOnMutated).toHaveBeenCalledTimes(1);
    });
  });

  test('renders delete confirmation card with red action and cancel secondary', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Are you sure you want to delete the food expense for 500 rupees?',
      display_text: 'Are you sure you want to delete this expense?',
      results: [],
      pending: {
        id: 'pend-del-1',
        action_type: 'delete',
        summary: 'Are you sure you want to delete transaction of ₹500?',
        target_transaction: {
          id: 'txn-500',
          amount: 500,
          category_name: 'Food',
          txn_date: 'Today',
        },
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
      changed: false,
    });

    client.answerPending.mockResolvedValueOnce({
      spoken_text: 'Deleted transaction.',
      display_text: 'Deleted transaction for ₹500.',
      results: [],
      pending: null,
      changed: true,
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} assistantV2={true} onTransactionMutated={jest.fn()} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Delete food expense');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByText('Are you sure you want to delete transaction of ₹500?')).toBeTruthy();
    expect(await findByText('✓ Confirm delete')).toBeTruthy();
    expect(await findByText('Cancel')).toBeTruthy();

    // Confirm button calls answer endpoint directly with confirm
    const confirmBtn = await findByText('✓ Confirm delete');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(client.answerPending).toHaveBeenCalledWith(
        mockToken,
        'pend-del-1',
        'confirm',
        null
      );
    });
  });

  test('renders delete confirmation card with kind confirm and candidate transaction', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Delete Food ₹150 on Oct 14?',
      reply_text: 'Delete Food ₹150 on Oct 14?',
      results: [],
      pending: {
        id: 'pend-v2-del',
        kind: 'confirm',
        question: 'Delete Food ₹150 on Oct 14?',
        candidates: [
          {
            id: 'txn-150',
            amount: 150,
            category_name: 'Food',
            txn_date: '14 Oct',
          },
        ],
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
      changed: false,
    });

    client.answerPending.mockResolvedValueOnce({
      spoken_text: 'Deleted transaction.',
      reply_text: 'Deleted transaction.',
      results: [],
      pending: null,
      changed: true,
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} assistantV2={true} onTransactionMutated={jest.fn()} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'delete food 150');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByText('Delete Food ₹150 on Oct 14?')).toBeTruthy();
    expect(await findByText('✓ Confirm delete')).toBeTruthy();
    expect(await findByText('Cancel')).toBeTruthy();

    const confirmBtn = await findByText('✓ Confirm delete');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(client.answerPending).toHaveBeenCalledWith(
        mockToken,
        'pend-v2-del',
        'confirm',
        null
      );
    });
  });

  test('disambiguation list renders at most 5 tappable candidate rows', async () => {
    const candidates = [
      { id: 'c1', amount: 100, category_name: 'Food', txn_date: 'Today' },
      { id: 'c2', amount: 200, category_name: 'Food', txn_date: 'Today' },
      { id: 'c3', amount: 300, category_name: 'Food', txn_date: 'Today' },
      { id: 'c4', amount: 400, category_name: 'Food', txn_date: 'Today' },
      { id: 'c5', amount: 500, category_name: 'Food', txn_date: 'Today' },
      { id: 'c6', amount: 600, category_name: 'Food', txn_date: 'Today' },
      { id: 'c7', amount: 700, category_name: 'Food', txn_date: 'Today' },
    ];

    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Which transaction did you mean?',
      display_text: 'Multiple matches found. Select one:',
      results: [],
      pending: {
        id: 'pend-disambig-1',
        action_type: 'disambiguate',
        summary: 'Which transaction did you mean?',
        candidates,
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
      changed: false,
    });

    client.answerPending.mockResolvedValueOnce({
      spoken_text: 'Selected transaction.',
      display_text: 'Selected transaction.',
      results: [],
      pending: null,
      changed: true,
    });

    const { findByTestId, findByText, queryByTestId } = await render(
      <ConversationLog token={mockToken} assistantV2={true} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Delete food');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByText('Which transaction did you mean?')).toBeTruthy();

    // Max 5 candidates rendered
    expect(await findByTestId('disambig-candidate-c1')).toBeTruthy();
    expect(await findByTestId('disambig-candidate-c5')).toBeTruthy();
    expect(queryByTestId('disambig-candidate-c6')).toBeNull();
    expect(queryByTestId('disambig-candidate-c7')).toBeNull();

    // Tapping a candidate calls answerPending with candidate id and index
    fireEvent.press(await findByTestId('disambig-candidate-c2'));

    await waitFor(() => {
      expect(client.answerPending).toHaveBeenCalledWith(
        mockToken,
        'pend-disambig-1',
        'c2',
        1
      );
    });
  });

  test('contact confirmation card renders with contact confirm actions', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Did you mean Arjun Nair?',
      display_text: 'Did you mean Arjun Nair?',
      results: [],
      pending: {
        id: 'pend-contact-1',
        action_type: 'contact_confirm',
        summary: 'Did you mean Arjun Nair?',
        candidates: [{ id: 'arjun-1', name: 'Arjun Nair' }],
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
      changed: false,
    });

    client.answerPending.mockResolvedValueOnce({
      spoken_text: 'Confirmed Arjun Nair.',
      display_text: 'Recorded transaction for Arjun Nair.',
      results: [],
      pending: null,
      changed: true,
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} assistantV2={true} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Sent 500 to Arjun');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByText('Did you mean Arjun Nair?')).toBeTruthy();
    expect(await findByText('✓ Yes, Arjun Nair')).toBeTruthy();
    expect(await findByText('No')).toBeTruthy();

    fireEvent.press(await findByText('✓ Yes, Arjun Nair'));

    await waitFor(() => {
      expect(client.answerPending).toHaveBeenCalledWith(
        mockToken,
        'pend-contact-1',
        'yes',
        0
      );
    });
  });

  test('typing free text while pending goes to sendAssistantMessage instead of client confirmation', async () => {
    client.sendAssistantMessage
      .mockResolvedValueOnce({
        spoken_text: 'Are you sure you want to delete this expense?',
        display_text: 'Confirm deletion?',
        results: [],
        pending: {
          id: 'pend-free-1',
          action_type: 'delete',
          summary: 'Confirm deletion?',
          expires_at: new Date(Date.now() + 60000).toISOString(),
        },
        changed: false,
      })
      .mockResolvedValueOnce({
        spoken_text: 'Deleted transaction.',
        display_text: 'Transaction deleted successfully.',
        results: [],
        pending: null,
        changed: true,
      });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} assistantV2={true} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Delete last expense');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByText('Confirm deletion?')).toBeTruthy();

    // User types "the first one" or "haan"
    fireEvent.changeText(input, 'the first one');
    fireEvent.press(await findByTestId('conversation-send-button'));

    await waitFor(() => {
      // Must go to sendAssistantMessage, not client side interception
      expect(client.sendAssistantMessage).toHaveBeenLastCalledWith(
        mockToken,
        expect.objectContaining({
          text: 'the first one',
          input: 'typed',
        })
      );
    });
  });

  test('add result cards show heard amount with working undo pill', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Added chai for 20 rupees.',
      display_text: 'Added Chai expense for ₹20.',
      results: [{ kind: 'added', heard_amount: 20, amount: 20, category: 'Food' }],
      pending: null,
      changed: true,
    });
    client.undoTransaction.mockResolvedValueOnce({ status: 'undone' });

    const mockOnMutated = jest.fn();
    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} assistantV2={true} onTransactionMutated={mockOnMutated} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Chai 20');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByText('Added Chai expense for ₹20.')).toBeTruthy();
    expect(await findByTestId('heard-amount-text')).toBeTruthy();
    expect(await findByText('Amount heard: ₹20')).toBeTruthy();

    // Undo button
    const undoBtn = await findByTestId('undo-button');
    fireEvent.press(undoBtn);

    await waitFor(() => {
      expect(client.undoTransaction).toHaveBeenCalledWith(mockToken);
      expect(mockOnMutated).toHaveBeenCalled();
    });
  });

  test('query result cards render balances rows and totals', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Here are your balances.',
      display_text: 'Your current balance details:',
      results: [
        {
          kind: 'balances',
          contacts: [
            { contact_name: 'Pooja', net_balance: 500 },
            { contact_name: 'Rahul', net_balance: -200 },
          ],
        },
      ],
      pending: null,
      changed: false,
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} assistantV2={true} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Who owes me money');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByText('Your current balance details:')).toBeTruthy();
    expect(await findByText('Pooja')).toBeTruthy();
    expect(await findByText('Rahul')).toBeTruthy();
  });

  test('resolved cards on reload render with resolved badge', async () => {
    // Chat history has an older pending item, but server active pending is null
    client.fetchChatHistory.mockResolvedValueOnce({
      messages: [
        {
          id: 'msg-old-1',
          role: 'assistant',
          text: 'Did you mean Pooja?',
          payload: {
            pending: {
              id: 'pend-old-1',
              action_type: 'delete',
              summary: 'Did you mean Pooja?',
            },
          },
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
    });
    client.fetchActivePending.mockResolvedValueOnce(null);

    const { findByTestId } = await render(<ConversationLog token={mockToken} assistantV2={true} />);

    expect(await findByTestId('resolved-badge')).toBeTruthy();
  });

  test('reopening app with active pending shows live card', async () => {
    client.fetchActivePending.mockResolvedValueOnce({
      id: 'pend-live-1',
      action_type: 'delete',
      summary: 'Delete restaurant bill of ₹800?',
      expires_at: new Date(Date.now() + 60000).toISOString(),
      target_transaction: { amount: 800, category_name: 'Food' },
    });

    const { findByTestId, findByText } = await render(<ConversationLog token={mockToken} assistantV2={true} />);

    expect(await findByTestId('live-pending-container')).toBeTruthy();
    expect(await findByText('Delete restaurant bill of ₹800?')).toBeTruthy();
  });

  test('retry on network failure reuses the exact same client_msg_id', async () => {
    client.sendAssistantMessage
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        spoken_text: 'Added food.',
        display_text: 'Added food.',
        results: [],
        pending: null,
        changed: true,
      });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} assistantV2={true} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Spent 100 on snacks');
    fireEvent.press(await findByTestId('conversation-send-button'));

    // Network error and retry button appear
    expect(await findByText('Error: Network error')).toBeTruthy();
    const retryBtn = await findByTestId('retry-button');

    const firstClientMsgId = client.sendAssistantMessage.mock.calls[0][1].client_msg_id;
    expect(firstClientMsgId).toBeTruthy();

    // Click retry
    fireEvent.press(retryBtn);

    await waitFor(() => {
      expect(client.sendAssistantMessage).toHaveBeenCalledTimes(2);
      const secondClientMsgId = client.sendAssistantMessage.mock.calls[1][1].client_msg_id;
      expect(secondClientMsgId).toBe(firstClientMsgId);
    });
  });

  test('TTS speaks spoken_text only', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Sent five hundred rupees to Pooja.',
      display_text: 'Sent ₹500 to **Pooja** on UPI.',
      results: [],
      pending: null,
      changed: true,
    });

    const { findByTestId } = await render(<ConversationLog token={mockToken} assistantV2={true} />);

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Sent 500 to Pooja');
    fireEvent.press(await findByTestId('conversation-send-button'));

    await waitFor(() => {
      expect(client.synthesizeSpeech).toHaveBeenCalledWith(
        mockToken,
        'Sent five hundred rupees to Pooja.',
        expect.any(String)
      );
    });
  });

  test('VoiceListeningSheet routes through sendAssistantMessage and updates chat history', async () => {
    const mockSetMessages = jest.fn();
    const mockOnMutated = jest.fn();

    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Added grocery for 300 rupees.',
      display_text: 'Added Grocery expense for ₹300.',
      results: [{ kind: 'added', amount: 300, category: 'Shopping' }],
      pending: null,
      changed: true,
    });

    const { findByTestId, findByText } = await render(
      <VoiceListeningSheet
        visible={true}
        onClose={jest.fn()}
        token={mockToken}
        onTransactionMutated={mockOnMutated}
        setMessages={mockSetMessages}
        assistantV2={true}
      />
    );

    const textInput = await findByTestId('voice-fallback-input');
    fireEvent.changeText(textInput, 'Spent 300 on grocery');
    fireEvent.press(await findByTestId('voice-fallback-send'));

    expect(await findByText('Added Grocery expense for ₹300.')).toBeTruthy();

    await waitFor(() => {
      expect(client.sendAssistantMessage).toHaveBeenCalledWith(
        mockToken,
        expect.objectContaining({
          text: 'Spent 300 on grocery',
          input: 'voice',
          client_msg_id: expect.any(String),
        })
      );
      expect(mockSetMessages).toHaveBeenCalled();
      expect(mockOnMutated).toHaveBeenCalledTimes(1);
      expect(client.synthesizeSpeech).toHaveBeenCalledWith(
        mockToken,
        'Added grocery for 300 rupees.',
        'en-IN'
      );
    });
  });
});

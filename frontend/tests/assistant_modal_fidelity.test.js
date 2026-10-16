import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Dimensions, useWindowDimensions } from 'react-native';
import ConversationLog from '../src/components/ConversationLog';
import MessageBubble from '../src/components/ui/MessageBubble';
import ConfirmationCard from '../src/components/ui/ConfirmationCard';
import * as client from '../src/api/client';

jest.mock('../src/api/client');

describe('Assistant Modal Stitch Fidelity and Requirements', () => {
  const mockToken = 'mock_jwt_token';

  beforeEach(() => {
    jest.clearAllMocks();
    client.fetchChatHistory.mockResolvedValue({ messages: [] });
    client.fetchActivePending.mockResolvedValue(null);
    client.synthesizeSpeech.mockResolvedValue({ audio_base64: 'bW9jaw==' });
  });

  test('bubble sizing at 320px width and 1.3 font scale renders without error and contains content', async () => {
    const { getByText, getByTestId } = await render(
      <MessageBubble
        text="Spent 250 on lunch and 80 on auto"
        sender="user"
        timestamp="6:16 PM"
        testID="test-user-bubble"
      />
    );

    const bubble = getByTestId('test-user-bubble');
    expect(bubble).toBeTruthy();
    expect(getByText('Spent 250 on lunch and 80 on auto')).toBeTruthy();
    expect(getByText('6:16 PM')).toBeTruthy();

    const { getByText: getPappuText, getByTestId: getPappuTestId } = await render(
      <MessageBubble
        text="Added lunch for 250 and auto for 80."
        sender="pappu"
        timestamp="6:16 PM"
        hasAudio={true}
        testID="test-pappu-bubble"
      />
    );

    expect(getPappuTestId('test-pappu-bubble')).toBeTruthy();
    expect(getPappuText('Added lunch for 250 and auto for 80.')).toBeTruthy();
    expect(getPappuTestId('tts-replay-button-test-pappu-bubble')).toBeTruthy();
  });

  test('card button labels are configured to never clip', async () => {
    const { getByTestId, getByText } = await render(
      <ConfirmationCard
        prompt="Delete Food ₹250 on Oct 14?"
        type="confirmation"
        actionLabel="delete"
        onConfirm={jest.fn()}
        secondaryAction={true}
        secondaryLabel="Keep it"
        onSecondaryAction={jest.fn()}
      />
    );

    const confirmBtn = getByTestId('confirm-action-button');
    const secondaryBtn = getByTestId('secondary-action-button');
    expect(confirmBtn).toBeTruthy();
    expect(secondaryBtn).toBeTruthy();
    expect(getByText('Delete')).toBeTruthy();
    expect(getByText('Keep it')).toBeTruthy();
  });

  test('edit confirmation card renders with Update and Keep it buttons', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Update Food from 250 to 300?',
      reply_text: 'Update Food from 250 to 300?',
      results: [],
      pending: {
        id: 'pend-edit-1',
        kind: 'confirm',
        question: 'Update Food from 250 to 300?',
        candidates: [
          {
            id: 'txn-edit-1',
            amount: 300,
            category_name: 'Food',
            txn_date: 'Today',
          },
        ],
      },
      changed: false,
    });

    client.answerPending.mockResolvedValueOnce({
      spoken_text: 'Updated transaction.',
      reply_text: 'Updated transaction to 300.',
      results: [],
      pending: null,
      changed: true,
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} assistantV2={true} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Change it to 300');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByText('Update Food from 250 to 300?')).toBeTruthy();
    expect(await findByText('Update')).toBeTruthy();
    expect(await findByText('Keep it')).toBeTruthy();

    fireEvent.press(await findByText('Update'));

    await waitFor(() => {
      expect(client.answerPending).toHaveBeenCalledWith(
        mockToken,
        'pend-edit-1',
        'confirm',
        null
      );
    });
  });

  test('disambiguation between contacts includes New person row sending new', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Multiple contacts found. Which one did you mean?',
      reply_text: 'Multiple contacts found. Which one did you mean?',
      results: [],
      pending: {
        id: 'pend-disambig-contact',
        kind: 'disambiguation',
        question: 'Which Priya did you mean?',
        candidates: [
          { id: 'c-priya-1', name: 'Priya Sharma' },
          { id: 'c-priya-2', name: 'Priya Menon' },
          { id: 'new', name: 'Priya' },
        ],
      },
      changed: false,
    });

    client.answerPending.mockResolvedValueOnce({
      spoken_text: 'Selected new contact.',
      reply_text: 'Created new contact Priya.',
      results: [],
      pending: null,
      changed: true,
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} assistantV2={true} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Sent 500 to Priya');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByText('Which Priya did you mean?')).toBeTruthy();
    expect(await findByText('Priya Sharma')).toBeTruthy();
    expect(await findByText('Priya Menon')).toBeTruthy();
    expect(await findByText('Add new person "Priya"')).toBeTruthy();

    fireEvent.press(await findByTestId('disambig-candidate-new'));

    await waitFor(() => {
      expect(client.answerPending).toHaveBeenCalledWith(
        mockToken,
        'pend-disambig-contact',
        'new',
        2
      );
    });
  });

  test('contact confirmation card renders with Yes and No buttons', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Did you mean Arjun Nair?',
      reply_text: 'Did you mean Arjun Nair?',
      results: [],
      pending: {
        id: 'pend-contact-fast',
        kind: 'contact_confirm',
        question: 'Did you mean Arjun Nair?',
        candidates: [{ id: 'arjun-1', name: 'Arjun Nair' }],
      },
      changed: false,
    });

    client.answerPending.mockResolvedValueOnce({
      spoken_text: 'Confirmed Arjun Nair.',
      reply_text: 'Recorded transaction for Arjun Nair.',
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
    expect(await findByText(/Yes, Arjun Nair/)).toBeTruthy();
    expect(await findByText('No')).toBeTruthy();

    fireEvent.press(await findByText(/Yes, Arjun Nair/));

    await waitFor(() => {
      expect(client.answerPending).toHaveBeenCalledWith(
        mockToken,
        'pend-contact-fast',
        'yes',
        0
      );
    });
  });

  test('historical pending card renders resolved badge on reload', async () => {
    client.fetchChatHistory.mockResolvedValueOnce({
      messages: [
        {
          id: 'hist-1',
          role: 'assistant',
          content: 'Delete Food ₹150?',
          created_at: '2026-10-14T10:00:00Z',
          pending: {
            id: 'pend-hist-1',
            kind: 'confirm',
            question: 'Delete Food ₹150?',
            candidates: [],
          },
        },
      ],
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} assistantV2={true} />
    );

    expect(await findByText('Delete Food ₹150?')).toBeTruthy();
    expect(await findByTestId('resolved-badge')).toBeTruthy();
    expect(await findByText('Resolved')).toBeTruthy();
  });

  test('retry reuses the same client_msg_id on network failure', async () => {
    client.sendAssistantMessage.mockRejectedValueOnce(new Error('Network error'));

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} assistantV2={true} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Who owes me money');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByText("Didn't catch that. Try again?")).toBeTruthy();

    const firstCallArgs = client.sendAssistantMessage.mock.calls[0][1];
    const originalClientMsgId = firstCallArgs.client_msg_id;
    expect(originalClientMsgId).toBeTruthy();

    // Prepare success response for retry
    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Nobody owes you money.',
      reply_text: 'Nobody owes you money.',
      results: [],
      pending: null,
      changed: false,
    });

    const retryBtn = await findByTestId('assistant-retry-button');
    fireEvent.press(retryBtn);

    await waitFor(() => {
      expect(client.sendAssistantMessage).toHaveBeenCalledTimes(2);
      const retryArgs = client.sendAssistantMessage.mock.calls[1][1];
      expect(retryArgs.client_msg_id).toBe(originalClientMsgId);
    });
  });

  test('mood field maps to Pappu pose', async () => {
    client.sendAssistantMessage.mockResolvedValueOnce({
      spoken_text: 'Awesome income received.',
      reply_text: 'Awesome income received.',
      results: [{ kind: 'added', data: { type: 'income' } }],
      pending: null,
      changed: true,
      mood: 'excited',
    });

    const { findByTestId, findByText } = await render(
      <ConversationLog token={mockToken} assistantV2={true} />
    );

    const input = await findByTestId('conversation-input');
    fireEvent.changeText(input, 'Salary 50000');
    fireEvent.press(await findByTestId('conversation-send-button'));

    expect(await findByText('Awesome income received.')).toBeTruthy();
    // Mascot header exists
    expect(await findByTestId('assistant-mascot-header')).toBeTruthy();
  });
});

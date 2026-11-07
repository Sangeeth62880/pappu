import {
  fetchSummary,
  fetchTransactions,
  sendAssistantMessage,
  answerPending,
  fetchActivePending,
  undoTransaction,
  transcribeAudio,
} from '../src/api/client';

describe('Frontend API Client', () => {
  const mockToken = 'mock_jwt_token';
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('fetchSummary sends GET request with bearer auth', async () => {
    const mockSummaryData = {
      balance: 1500,
      total_income: 3000,
      total_expense: 1500,
      category_breakdown: [],
      transaction_count: 5,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockSummaryData),
    });

    const result = await fetchSummary(mockToken);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/summary$/),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${mockToken}`,
        }),
      })
    );
    expect(result).toEqual(mockSummaryData);
  });

  test('fetchTransactions sends query parameters correctly', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue([]),
    });

    await fetchTransactions(mockToken, { category_id: 1, limit: 10 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/transactions\?category_id=1&limit=10$/),
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('sendAssistantMessage sends text and input in body', async () => {
    const mockResponse = {
      display_text: 'Added 500 for Food',
      spoken_text: 'Added 500 for Food',
      results: [{ kind: 'added', amount: 500 }],
      pending: null,
      changed: true,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await sendAssistantMessage(mockToken, {
      text: 'I spent 500 on food today',
      input: 'typed',
      client_msg_id: 'c1',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/assistant\/message$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          text: 'I spent 500 on food today',
          input: 'typed',
          client_msg_id: 'c1',
        }),
      })
    );
    expect(result).toEqual(mockResponse);
  });

  describe('sendAssistantMessage on 409 still_processing', () => {
    const stillProcessing = () => ({
      ok: false,
      status: 409,
      json: jest.fn().mockResolvedValue({
        detail: 'Still processing this message. Retry shortly.',
        code: 'still_processing',
      }),
    });

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('polls with the same client_msg_id and returns the stored response', async () => {
      const stored = { reply_text: 'Added ₹500 for Food.', results: [], pending: null, changed: true };
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(stillProcessing())
        .mockResolvedValueOnce(stillProcessing())
        .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue(stored) });

      const pending = sendAssistantMessage(mockToken, { text: 'Spent 500 on food', client_msg_id: 'c-retry' });
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(2000);

      await expect(pending).resolves.toEqual(stored);
      expect(global.fetch).toHaveBeenCalledTimes(3);
      const bodies = global.fetch.mock.calls.map(([, config]) => JSON.parse(config.body));
      expect(bodies.every((b) => b.client_msg_id === 'c-retry')).toBe(true);
    });

    test('gives up after the poll budget and surfaces the 409', async () => {
      global.fetch = jest.fn().mockImplementation(async () => stillProcessing());

      const pending = sendAssistantMessage(mockToken, { text: 'Spent 500 on food', client_msg_id: 'c-slow' });
      const outcome = pending.catch((err) => err);
      await jest.advanceTimersByTimeAsync(2000 * 30);

      const err = await outcome;
      expect(err.status).toBe(409);
      expect(err.data.code).toBe('still_processing');
      expect(global.fetch).toHaveBeenCalledTimes(30);
    });

    test('other errors are not retried', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: jest.fn().mockResolvedValue({ detail: 'Some other conflict' }),
      });

      await expect(sendAssistantMessage(mockToken, { text: 'x', client_msg_id: 'c2' })).rejects.toThrow(
        'Some other conflict'
      );
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  test('answerPending sends answer and optional index', async () => {
    const mockResponse = {
      display_text: 'Deleted transaction',
      spoken_text: 'Deleted transaction',
      results: [{ kind: 'deleted', transaction_id: '123' }],
      pending: null,
      changed: true,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await answerPending(mockToken, 'pend_1', 'confirm', 0);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/assistant\/pending\/pend_1\/answer$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ answer: 'confirm', index: 0 }),
      })
    );
    expect(result.changed).toBe(true);
  });

  test('fetchActivePending sends GET request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ pending: null }),
    });

    const result = await fetchActivePending(mockToken);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/assistant\/pending$/),
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual({ pending: null });
  });

  test('undoTransaction sends undo request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ status: 'undone' }),
    });

    const result = await undoTransaction(mockToken);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/transactions\/undo$/),
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.status).toBe('undone');
  });

  test('throws formatted error on non-ok status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: jest.fn().mockResolvedValue({ detail: 'Resource not found' }),
    });

    await expect(fetchSummary(mockToken)).rejects.toThrow('Resource not found');
  });

  test('transcribeAudio sends audio payload to /stt/transcribe', async () => {
    const mockSTTResponse = {
      transcript: 'I spent 500 on groceries',
      language_code: 'en-IN',
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockSTTResponse),
    });

    const mockBlob = new Blob(['mock audio content'], { type: 'audio/wav' });
    const result = await transcribeAudio(mockToken, mockBlob, 'en-IN');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/stt\/transcribe$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${mockToken}`,
        }),
      })
    );
    expect(result).toEqual(mockSTTResponse);
  });
});

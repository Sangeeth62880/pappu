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

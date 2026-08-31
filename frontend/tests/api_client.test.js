import {
  fetchSummary,
  fetchTransactions,
  parseIntent,
  routeIntent,
  confirmAction,
  undoTransaction,
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
      'http://127.0.0.1:8000/summary',
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
      'http://127.0.0.1:8000/transactions?category_id=1&limit=10',
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('parseIntent sends text in body', async () => {
    const mockIntentResponse = {
      intent: {
        action: 'add',
        language: 'en',
        fields: { amount: 500, category: 'Food' },
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockIntentResponse),
    });

    const result = await parseIntent(mockToken, 'I spent 500 on food today');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/intent/parse',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'I spent 500 on food today' }),
      })
    );
    expect(result).toEqual(mockIntentResponse);
  });

  test('routeIntent sends intent object in body', async () => {
    const mockIntent = {
      action: 'add',
      language: 'en',
      fields: { amount: 500, category: 'Food' },
      matched_transactions: [],
      confidence: 'high',
      requires_confirmation: false,
      missing_fields: [],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ decision: 'EXECUTE' }),
    });

    const result = await routeIntent(mockToken, mockIntent);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/intent/route',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ intent: mockIntent }),
      })
    );
    expect(result.decision).toBe('EXECUTE');
  });

  test('confirmAction sends confirmation payload', async () => {
    const txnId = '123e4567-e89b-12d3-a456-426614174000';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ status: 'executed', action: 'delete' }),
    });

    const result = await confirmAction(mockToken, txnId, 'delete');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/intent/confirm',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          transaction_id: txnId,
          action: 'delete',
          fields: null,
        }),
      })
    );
    expect(result.status).toBe('executed');
  });

  test('undoTransaction sends undo request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ status: 'undone' }),
    });

    const result = await undoTransaction(mockToken);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/transactions/undo',
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
});

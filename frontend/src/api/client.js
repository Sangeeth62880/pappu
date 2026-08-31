/**
 * API client for interacting with the FastAPI backend.
 * Provides authenticated helper methods using the user's Supabase JWT.
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/**
 * Helper to execute HTTP requests with auth headers.
 */
async function request(endpoint, { method = 'GET', token, body, params } = {}) {
  let url = `${API_BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value);
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(url, config);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage = data?.detail || `API request failed with status ${response.status}`;
    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

/**
 * GET /summary - Fetches balance, totals, and category breakdown.
 */
export async function fetchSummary(token) {
  return request('/summary', { method: 'GET', token });
}

/**
 * GET /transactions - Fetches transaction history with optional filters.
 */
export async function fetchTransactions(token, filters = {}) {
  return request('/transactions', { method: 'GET', token, params: filters });
}

/**
 * POST /intent/parse - Converts plain text into a validated IntentObject.
 */
export async function parseIntent(token, text) {
  return request('/intent/parse', {
    method: 'POST',
    token,
    body: { text },
  });
}

/**
 * POST /intent/route - Routes IntentObject per 4-tier rules and executes or returns prompts.
 */
export async function routeIntent(token, intent) {
  return request('/intent/route', {
    method: 'POST',
    token,
    body: { intent },
  });
}

/**
 * POST /intent/confirm - Confirms and executes an edit or delete action.
 */
export async function confirmAction(token, transactionId, action, fields = null) {
  return request('/intent/confirm', {
    method: 'POST',
    token,
    body: {
      transaction_id: transactionId,
      action,
      fields,
    },
  });
}

/**
 * POST /transactions/undo - Reverses the most recent transaction for the authenticated user.
 */
export async function undoTransaction(token) {
  return request('/transactions/undo', {
    method: 'POST',
    token,
  });
}

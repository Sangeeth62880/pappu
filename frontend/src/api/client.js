/**
 * API client for interacting with the FastAPI backend.
 * Provides authenticated helper methods using the user's Supabase JWT.
 */

import { getApiBaseUrl } from '../config/api';

/**
 * Helper to execute HTTP requests with auth headers.
 */
async function request(endpoint, { method = 'GET', token, body, params } = {}) {
  const baseUrl = getApiBaseUrl();
  let url = `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;

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
    throw buildApiError(data, response.status, `API request failed with status ${response.status}`);
  }

  return data;
}

/**
 * Turns an error response into an Error. `detail` is a plain string on most routes; the
 * /bills routes send { message, code, detail }, so `error.code` is set for those.
 */
export function buildApiError(data, status, fallbackMessage) {
  const detail = data?.detail;
  const isStructured = detail && typeof detail === 'object' && !Array.isArray(detail);
  const message = isStructured
    ? detail.message
    : typeof detail === 'string'
      ? detail
      : null;
  const error = new Error(message || fallbackMessage);
  error.status = status;
  error.data = data;
  if (isStructured) {
    error.code = detail.code;
    error.detail = detail.detail;
  }
  return error;
}

/**
 * GET /summary - Fetches period analytics (week | month | year) or all-time summary.
 */
export async function fetchSummary(token, period = null) {
  const params = period ? { period } : {};
  return request('/summary', { method: 'GET', token, params });
}

/**
 * GET /summary/people - Fetches contacts list with net balances.
 */
export async function fetchPeopleSummary(token) {
  return request('/summary/people', { method: 'GET', token });
}

/**
 * GET /summary/people/{contact_id} - Fetches contact transaction history and net balance.
 */
export async function fetchContactDetail(token, contactId) {
  return request(`/summary/people/${contactId}`, { method: 'GET', token });
}

/**
 * POST /contacts - Creates a new contact with optional phone and upi_id.
 */
export async function createContact(token, { name, phone = null, upi_id = null }) {
  return request('/contacts', {
    method: 'POST',
    token,
    body: { name, phone, upi_id },
  });
}

/**
 * GET /contacts/{contact_id}/remind-text - Fetches personalized reminder text for sharing.
 */
export async function fetchContactRemindText(token, contactId) {
  return request(`/contacts/${contactId}/remind-text`, { method: 'GET', token });
}


/**
 * GET /transactions - Fetches transaction history with optional filters.
 */
export async function fetchTransactions(token, filters = {}) {
  return request('/transactions', { method: 'GET', token, params: filters });
}



/**
 * PATCH /transactions/{id} - Updates an existing transaction.
 */
export async function updateTransaction(token, id, payload) {
  return request(`/transactions/${id}`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

/**
 * DELETE /transactions/{id} - Deletes an existing transaction.
 */
export async function deleteTransaction(token, id) {
  return request(`/transactions/${id}`, {
    method: 'DELETE',
    token,
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

/**
 * POST /stt/transcribe - Transcribes speech audio using Sarvam Saaras v3.
 * Accepts binary Blob/File or { uri, name, type } object or raw URI string.
 */
export async function transcribeAudio(token, audioData, languageCode = null) {
  const baseUrl = getApiBaseUrl();
  let url = `${baseUrl.replace(/\/$/, '')}/stt/transcribe`;

  const formData = new FormData();
  if (audioData instanceof Blob || (typeof File !== 'undefined' && audioData instanceof File)) {
    formData.append('file', audioData, audioData.name || 'recording.wav');
  } else if (audioData && typeof audioData === 'object' && audioData.uri) {
    formData.append('file', {
      uri: audioData.uri,
      name: audioData.name || 'recording.m4a',
      type: audioData.type || 'audio/m4a',
    });
  } else if (typeof audioData === 'string') {
    formData.append('file', {
      uri: audioData,
      name: 'recording.m4a',
      type: 'audio/m4a',
    });
  } else {
    formData.append('file', audioData);
  }

  if (languageCode) {
    formData.append('language_code', languageCode);
  }

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // In React Native with Expo SDK 57, Expo's Winter fetch polyfill throws
  // "Unsupported FormDataPart implementation" when FormData contains { uri, name, type } parts.
  // Using XMLHttpRequest directly for native URI uploads bypasses Expo's Winter fetch
  // while streaming the file via React Native's RCTNetworking.
  const isJestMock = typeof jest !== 'undefined' || (global.fetch && global.fetch._isMockFunction);
  const isFileUri = audioData && (audioData.uri || typeof audioData === 'string');

  if (!isJestMock && isFileUri && typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      for (const [headerKey, headerValue] of Object.entries(headers)) {
        xhr.setRequestHeader(headerKey, headerValue);
      }
      xhr.onload = () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (_) {
          data = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          const errorMessage = data?.detail || `Speech transcription failed with status ${xhr.status}`;
          const error = new Error(errorMessage);
          error.status = xhr.status;
          error.data = data;
          reject(error);
        }
      };
      xhr.onerror = () => {
        reject(new Error('Network request failed'));
      };
      xhr.ontimeout = () => {
        reject(new Error('Request timed out'));
      };
      xhr.send(formData);
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage = data?.detail || `Speech transcription failed with status ${response.status}`;
    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

/**
 * POST /tts/synthesize - Synthesizes text into speech audio using Sarvam Bulbul v3.
 * Returns base64 encoded audio and metadata.
 */
export async function synthesizeSpeech(token, text, languageCode = 'en-IN', speaker = 'kavitha', pace = 1.0) {
  return request('/tts/synthesize', {
    method: 'POST',
    token,
    body: {
      text,
      target_language_code: languageCode,
      speaker,
      pace,
    },
  });
}

/**
 * GET /chat/history - Fetches paginated chat messages for the current user.
 */
export async function fetchChatHistory(token, { limit = 50, offset = 0 } = {}) {
  return request('/chat/history', {
    method: 'GET',
    token,
    params: { limit, offset },
  });
}

/**
 * POST /chat/message - Saves a new chat message to persistent backend storage.
 */
export async function saveChatMessage(token, { role, text, payload = null }) {
  return request('/chat/message', {
    method: 'POST',
    token,
    body: { role, text, payload },
  });
}

/**
 * DELETE /chat/history - Deletes all chat messages for the authenticated user.
 */
export async function clearChatHistory(token) {
  return request('/chat/history', {
    method: 'DELETE',
    token,
  });
}

/**
 * @typedef {'neutral' | 'happy' | 'excited' | 'concerned' | 'confused'} AssistantMood
 *
 * @typedef {Object} AssistantResponse
 * @property {string} reply_text - Display text formatted for user bubble
 * @property {string} spoken_text - Concise spoken text for TTS
 * @property {string} language - Response language code ('en', 'ml', 'mixed')
 * @property {Array<Object>} results - Executed action results
 * @property {Object|null} pending - Active pending item awaiting confirmation or disambiguation
 * @property {boolean} changed - Whether financial state changed
 * @property {AssistantMood} mood - Pappu mascot mood derived from result kinds
 */

// 409 still_processing: an earlier request with the same client_msg_id is still
// running on the server (slow cold start / Sarvam call). Poll for up to ~60s.
export const STILL_PROCESSING_RETRY_DELAY_MS = 2000;
export const STILL_PROCESSING_MAX_ATTEMPTS = 30;

export function isStillProcessingError(err) {
  return err?.status === 409 && err?.data?.code === 'still_processing';
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST /assistant/message - Unified message endpoint for Assistant v2.
 * On 409 still_processing it re-sends with the SAME client_msg_id until the
 * server returns the first request's stored response (no second execution).
 * @returns {Promise<AssistantResponse>}
 */
export async function sendAssistantMessage(token, { text, input = 'typed', client_msg_id = null }) {
  const normInput = input === 'voice' ? 'voice' : 'typed';
  const body = { text, input: normInput };
  if (client_msg_id) {
    body.client_msg_id = client_msg_id;
  }
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await request('/assistant/message', {
        method: 'POST',
        token,
        body,
      });
    } catch (err) {
      if (!isStillProcessingError(err) || attempt >= STILL_PROCESSING_MAX_ATTEMPTS) {
        throw err;
      }
      await wait(STILL_PROCESSING_RETRY_DELAY_MS);
    }
  }
}

/**
 * POST /assistant/pending/{id}/answer - Deterministically resolves an active pending item.
 * @returns {Promise<AssistantResponse>}
 */
export async function answerPending(token, pendingId, answer, index = null) {
  const body = { answer };
  if (index !== null && index !== undefined) {
    body.index = index;
  }
  return request(`/assistant/pending/${pendingId}/answer`, {
    method: 'POST',
    token,
    body,
  });
}

/**
 * GET /assistant/pending - Fetches the single active pending item for the user if any.
 */
export async function fetchActivePending(token) {
  return request('/assistant/pending', {
    method: 'GET',
    token,
  });
}

/**
 * GET /profile - Fetches read-only user profile (name, email, language).
 */
export async function fetchProfile(token) {
  return request('/profile', {
    method: 'GET',
    token,
  });
}

/**
 * GET /budgets - This month's spent vs budget per category budget.
 * Returns { month, budgets: [{ category, budget, spent, remaining, over_by, percent, state }], categories }.
 */
export async function fetchBudgets(token) {
  return request('/budgets', { method: 'GET', token });
}

/**
 * PUT /budgets/{category} - Creates or replaces a category's monthly budget.
 */
export async function setBudget(token, category, amount) {
  return request(`/budgets/${encodeURIComponent(category)}`, {
    method: 'PUT',
    token,
    body: { amount },
  });
}

/**
 * DELETE /budgets/{category} - Removes a category's monthly budget (204, 404 when none is set).
 */
export async function deleteBudget(token, category) {
  return request(`/budgets/${encodeURIComponent(category)}`, {
    method: 'DELETE',
    token,
  });
}

/**
 * PATCH /profile - Updates user preferences (language, voice_replies, upi_id; '' clears the UPI ID).
 */
export async function patchProfile(token, { language, voice_replies, upi_id } = {}) {
  const body = {};
  if (language !== undefined) body.language = language;
  if (voice_replies !== undefined) body.voice_replies = voice_replies;
  if (upi_id !== undefined) body.upi_id = upi_id;
  return request('/profile', {
    method: 'PATCH',
    token,
    body,
  });
}

// ── Bill split (PROJECT_SPEC.md §5b Bill Split) ──────────────────────────────────────────

/**
 * POST /bills - Uploads a bill photo and returns the draft bill read from it.
 * `image` is a Blob/File (web) or { uri, name, type } (native picker asset).
 */
export async function uploadBill(token, image) {
  const url = `${getApiBaseUrl().replace(/\/$/, '')}/bills`;
  const formData = new FormData();
  const isBlob = typeof Blob !== 'undefined' && image instanceof Blob;
  if (isBlob) {
    formData.append('file', image, image.name || 'bill.jpg');
  } else {
    formData.append('file', {
      uri: image.uri,
      name: image.name || 'bill.jpg',
      type: image.type || 'image/jpeg',
    });
  }
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const fallback = 'Could not read that bill.';

  // Same reason as transcribeAudio: Expo's fetch cannot send { uri } form parts, XHR can.
  const isJestMock = typeof jest !== 'undefined' || (global.fetch && global.fetch._isMockFunction);
  if (!isJestMock && !isBlob && typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
      xhr.onload = () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (_) {
          data = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(buildApiError(data, xhr.status, fallback));
      };
      xhr.onerror = () => reject(new Error('Network request failed'));
      xhr.ontimeout = () => reject(new Error('Request timed out'));
      xhr.send(formData);
    });
  }

  const response = await fetch(url, { method: 'POST', headers, body: formData });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw buildApiError(data, response.status, fallback);
  return data;
}

/** POST /bills/manual - A draft from typed items, for when a photo cannot be read. */
export async function createManualBill(token, bill) {
  return request('/bills/manual', { method: 'POST', token, body: bill });
}

/** GET /bills/{id} */
export async function fetchBill(token, billId) {
  return request(`/bills/${billId}`, { method: 'GET', token });
}

/** PATCH /bills/{id} - Review screen edits: merchant, bill_date, items, tax, service_charge, discount, total. */
export async function patchBill(token, billId, patch) {
  return request(`/bills/${billId}`, { method: 'PATCH', token, body: patch });
}

/** POST /bills/{id}/assign - "Who had what" as typed or spoken text. */
export async function assignBill(token, billId, text, input = 'text') {
  return request(`/bills/${billId}/assign`, { method: 'POST', token, body: { text, input } });
}

/** PUT /bills/{id}/items/{itemId}/people - Assign one item by tapping. [] clears it. */
export async function setBillItemPeople(token, billId, itemId, people) {
  return request(`/bills/${billId}/items/${itemId}/people`, { method: 'PUT', token, body: { people } });
}

/** POST /bills/{id}/people/resolve - Answer a close name match. */
export async function resolveBillPerson(token, billId, name, useExisting) {
  return request(`/bills/${billId}/people/resolve`, {
    method: 'POST',
    token,
    body: { name, use_existing: useExisting },
  });
}

/** POST /bills/{id}/confirm - Saves the split. The only call that writes the transactions. */
export async function confirmBill(token, billId) {
  return request(`/bills/${billId}/confirm`, { method: 'POST', token });
}

/** POST /bills/{id}/undo - Reverts a saved split. */
export async function undoBill(token, billId) {
  return request(`/bills/${billId}/undo`, { method: 'POST', token });
}

/** DELETE /bills/{id} - Cancels a draft. */
export async function cancelBill(token, billId) {
  return request(`/bills/${billId}`, { method: 'DELETE', token });
}

/** GET /bills/{id}/shares/{shareId}/request - UPI link and message for one friend's share. */
export async function fetchPayRequest(token, billId, shareId) {
  return request(`/bills/${billId}/shares/${shareId}/request`, { method: 'GET', token });
}

/** POST /bills/{id}/shares/{shareId}/paid - Marks a friend's share as paid back. */
export async function markBillSharePaid(token, billId, shareId) {
  return request(`/bills/${billId}/shares/${shareId}/paid`, { method: 'POST', token });
}

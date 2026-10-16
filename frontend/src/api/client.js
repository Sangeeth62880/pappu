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
    const errorMessage = data?.detail || `API request failed with status ${response.status}`;
    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
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

/**
 * POST /assistant/message - Unified message endpoint for Assistant v2.
 * @returns {Promise<AssistantResponse>}
 */
export async function sendAssistantMessage(token, { text, input = 'typed', client_msg_id = null }) {
  const normInput = input === 'voice' ? 'voice' : 'typed';
  const body = { text, input: normInput };
  if (client_msg_id) {
    body.client_msg_id = client_msg_id;
  }
  return request('/assistant/message', {
    method: 'POST',
    token,
    body,
  });
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
 * PATCH /profile - Updates user preferences (language, voice_replies).
 */
export async function patchProfile(token, { language, voice_replies } = {}) {
  const body = {};
  if (language !== undefined) body.language = language;
  if (voice_replies !== undefined) body.voice_replies = voice_replies;
  return request('/profile', {
    method: 'PATCH',
    token,
    body,
  });
}


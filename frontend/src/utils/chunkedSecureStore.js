import * as SecureStore from 'expo-secure-store';

export const CHUNK_SIZE = 1024;
export const INDEX_SUFFIX = '__index';
export const CHUNK_PREFIX = '__chunk_';

/**
 * Stores a value in SecureStore, chunking it if it exceeds CHUNK_SIZE.
 * Uses an index key (${key}__index) containing metadata ({ chunkCount, totalLength }).
 */
export async function setChunkedItem(key, value) {
  if (value === null || value === undefined) {
    await removeChunkedItem(key);
    return;
  }

  const str = String(value);
  const chunkCount = Math.ceil(str.length / CHUNK_SIZE) || 1;

  // Check if an existing index exists to clean up extra chunks if size decreased
  let prevChunkCount = 0;
  try {
    const existingIndexStr = await SecureStore.getItemAsync(`${key}${INDEX_SUFFIX}`);
    if (existingIndexStr) {
      const parsed = JSON.parse(existingIndexStr);
      prevChunkCount = parsed?.chunkCount || 0;
    }
  } catch (e) {
    // ignore
  }

  // Write new chunks
  for (let i = 0; i < chunkCount; i++) {
    const chunk = str.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}${CHUNK_PREFIX}${i}`, chunk);
  }

  // Clean up any stale chunks if the new value has fewer chunks than before
  if (prevChunkCount > chunkCount) {
    for (let i = chunkCount; i < prevChunkCount; i++) {
      try {
        await SecureStore.deleteItemAsync(`${key}${CHUNK_PREFIX}${i}`);
      } catch (e) {}
    }
  }

  // Write index
  const indexData = JSON.stringify({
    chunkCount,
    totalLength: str.length,
    updatedAt: Date.now(),
  });
  await SecureStore.setItemAsync(`${key}${INDEX_SUFFIX}`, indexData);

  // Clean up legacy direct key if present
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (e) {}
}

/**
 * Retrieves a chunked value from SecureStore using its index key.
 * Falls back to legacy direct key if index key is not found.
 */
export async function getChunkedItem(key) {
  try {
    const indexStr = await SecureStore.getItemAsync(`${key}${INDEX_SUFFIX}`);
    if (indexStr) {
      const parsed = JSON.parse(indexStr);
      const chunkCount = parsed?.chunkCount;
      if (typeof chunkCount !== 'number' || chunkCount < 1) {
        return null;
      }

      const chunks = [];
      for (let i = 0; i < chunkCount; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}${CHUNK_PREFIX}${i}`);
        if (chunk === null || chunk === undefined) {
          // Corrupted or missing chunk
          return null;
        }
        chunks.push(chunk);
      }
      return chunks.join('');
    }

    // Fallback: check direct key
    const direct = await SecureStore.getItemAsync(key);
    return direct ?? null;
  } catch (e) {
    return null;
  }
}

/**
 * Removes all chunks and the index key for a given key.
 */
export async function removeChunkedItem(key) {
  try {
    const indexStr = await SecureStore.getItemAsync(`${key}${INDEX_SUFFIX}`);
    if (indexStr) {
      try {
        const parsed = JSON.parse(indexStr);
        const chunkCount = parsed?.chunkCount;
        if (typeof chunkCount === 'number') {
          for (let i = 0; i < chunkCount; i++) {
            try {
              await SecureStore.deleteItemAsync(`${key}${CHUNK_PREFIX}${i}`);
            } catch (e) {}
          }
        }
      } catch (e) {}
      try {
        await SecureStore.deleteItemAsync(`${key}${INDEX_SUFFIX}`);
      } catch (e) {}
    }

    // Also delete direct key
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {}
  } catch (e) {}
}

/**
 * Supabase-compatible storage adapter with chunked Expo SecureStore.
 */
export const chunkedSecureStoreAdapter = {
  getItem: (key) => getChunkedItem(key),
  setItem: (key, value) => setChunkedItem(key, value),
  removeItem: (key) => removeChunkedItem(key),
};

import * as SecureStore from 'expo-secure-store';
import {
  setChunkedItem,
  getChunkedItem,
  removeChunkedItem,
  chunkedSecureStoreAdapter,
  CHUNK_SIZE,
  INDEX_SUFFIX,
  CHUNK_PREFIX,
} from '../src/utils/chunkedSecureStore';

describe('Chunked SecureStore Storage Adapter', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    if (SecureStore.__reset) {
      SecureStore.__reset();
    }
  });

  test('chunked storage round trip with small string under CHUNK_SIZE', async () => {
    const key = 'sb-test-token-small';
    const value = 'small-session-payload-under-1kb';

    await chunkedSecureStoreAdapter.setItem(key, value);

    // Verify stored in 1 chunk
    const indexStr = await SecureStore.getItemAsync(`${key}${INDEX_SUFFIX}`);
    expect(indexStr).toBeTruthy();
    const index = JSON.parse(indexStr);
    expect(index.chunkCount).toBe(1);
    expect(index.totalLength).toBe(value.length);

    // Retrieve via adapter
    const retrieved = await chunkedSecureStoreAdapter.getItem(key);
    expect(retrieved).toBe(value);
  });

  test('chunked storage round trip with large session payload exceeding 2 KB SecureStore limit', async () => {
    const key = 'sb-auth-session-large';
    // Generate realistic Supabase session string > 3.5 KB (3500+ characters)
    const largeJwtPayload = 'a'.repeat(3500);
    const mockSession = JSON.stringify({
      access_token: `header.${largeJwtPayload}.signature`,
      refresh_token: 'refresh_token_12345',
      user: {
        id: 'user-uuid-1234',
        email: 'sangeeth@pappu.dev',
        user_metadata: { name: 'Sangeeth P S', role: 'admin' },
      },
    });

    expect(mockSession.length).toBeGreaterThan(2048);
    const expectedChunks = Math.ceil(mockSession.length / CHUNK_SIZE);
    expect(expectedChunks).toBeGreaterThanOrEqual(4);

    await chunkedSecureStoreAdapter.setItem(key, mockSession);

    // Verify index record
    const indexStr = await SecureStore.getItemAsync(`${key}${INDEX_SUFFIX}`);
    expect(indexStr).toBeTruthy();
    const index = JSON.parse(indexStr);
    expect(index.chunkCount).toBe(expectedChunks);

    // Verify each chunk is strictly within CHUNK_SIZE (1024 bytes)
    for (let i = 0; i < expectedChunks; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}${CHUNK_PREFIX}${i}`);
      expect(chunk).toBeTruthy();
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE);
    }

    // Verify round-trip retrieval restores exact string
    const restored = await chunkedSecureStoreAdapter.getItem(key);
    expect(restored).toBe(mockSession);
    expect(JSON.parse(restored)).toEqual(JSON.parse(mockSession));
  });

  test('downsizing value deletes extra old chunks', async () => {
    const key = 'sb-downsize-key';
    const largeValue = 'x'.repeat(3500); // 4 chunks
    await chunkedSecureStoreAdapter.setItem(key, largeValue);

    let index = JSON.parse(await SecureStore.getItemAsync(`${key}${INDEX_SUFFIX}`));
    expect(index.chunkCount).toBe(4);
    expect(await SecureStore.getItemAsync(`${key}${CHUNK_PREFIX}3`)).toBeTruthy();

    // Now write a small value that needs only 1 chunk
    const smallValue = 'small';
    await chunkedSecureStoreAdapter.setItem(key, smallValue);

    index = JSON.parse(await SecureStore.getItemAsync(`${key}${INDEX_SUFFIX}`));
    expect(index.chunkCount).toBe(1);

    // Stale chunks 1, 2, 3 must be deleted
    expect(await SecureStore.getItemAsync(`${key}${CHUNK_PREFIX}1`)).toBeNull();
    expect(await SecureStore.getItemAsync(`${key}${CHUNK_PREFIX}2`)).toBeNull();
    expect(await SecureStore.getItemAsync(`${key}${CHUNK_PREFIX}3`)).toBeNull();

    // Read back must be smallValue
    expect(await chunkedSecureStoreAdapter.getItem(key)).toBe(smallValue);
  });

  test('removeItem deletes every chunk and the index key', async () => {
    const key = 'sb-session-to-remove';
    const value = 'y'.repeat(2500); // 3 chunks
    await chunkedSecureStoreAdapter.setItem(key, value);

    expect(await SecureStore.getItemAsync(`${key}${INDEX_SUFFIX}`)).toBeTruthy();
    expect(await SecureStore.getItemAsync(`${key}${CHUNK_PREFIX}0`)).toBeTruthy();
    expect(await SecureStore.getItemAsync(`${key}${CHUNK_PREFIX}1`)).toBeTruthy();
    expect(await SecureStore.getItemAsync(`${key}${CHUNK_PREFIX}2`)).toBeTruthy();

    // Remove item
    await chunkedSecureStoreAdapter.removeItem(key);

    expect(await SecureStore.getItemAsync(`${key}${INDEX_SUFFIX}`)).toBeNull();
    expect(await SecureStore.getItemAsync(`${key}${CHUNK_PREFIX}0`)).toBeNull();
    expect(await SecureStore.getItemAsync(`${key}${CHUNK_PREFIX}1`)).toBeNull();
    expect(await SecureStore.getItemAsync(`${key}${CHUNK_PREFIX}2`)).toBeNull();
    expect(await chunkedSecureStoreAdapter.getItem(key)).toBeNull();
  });

  test('returns null if any chunk is missing or corrupted', async () => {
    const key = 'sb-corrupted-key';
    const value = 'z'.repeat(2500);
    await chunkedSecureStoreAdapter.setItem(key, value);

    // Simulate missing chunk 1
    await SecureStore.deleteItemAsync(`${key}${CHUNK_PREFIX}1`);

    const result = await chunkedSecureStoreAdapter.getItem(key);
    expect(result).toBeNull();
  });

  test('fallback to legacy direct key when index key is absent', async () => {
    const legacyKey = 'sb-legacy-token';
    const legacyValue = 'legacy-stored-token';

    // Store directly without chunk index
    await SecureStore.setItemAsync(legacyKey, legacyValue);

    const retrieved = await chunkedSecureStoreAdapter.getItem(legacyKey);
    expect(retrieved).toBe(legacyValue);
  });
});

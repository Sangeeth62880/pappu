import Constants from 'expo-constants';
import { Platform } from 'react-native';

const BACKEND_DEV_PORT = 8000;

/**
 * Resolves the backend API base URL without hardcoded or per-device IPs:
 * 1. process.env.EXPO_PUBLIC_API_URL if set (production/preview builds, full HTTPS URL, no trailing slash).
 * 2. In development only (__DEV__): derives the host from Constants.expoConfig.hostUri (or linkingUri)
 *    which is the machine running Metro, and uses http://<host>:8000.
 *    On Android emulator, maps localhost / 127.0.0.1 to 10.0.2.2.
 * 3. Otherwise throws a clear configuration error.
 */
export function resolveApiBaseUrl({
  envUrl = process.env.EXPO_PUBLIC_API_URL,
  isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false,
  platform = Platform.OS,
  constants = Constants,
} = {}) {
  // 1. Explicit environment variable
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    let cleanUrl = envUrl.trim().replace(/\/+$/, '');

    // In production builds, reject non-https URLs
    if (!isDev) {
      if (!cleanUrl.toLowerCase().startsWith('https://')) {
        throw new Error(
          `Production builds require a secure HTTPS API URL, but received: "${cleanUrl}". Cleartext HTTP is rejected.`
        );
      }
    }

    return cleanUrl;
  }

  // 2. Development-only automatic discovery
  if (isDev) {
    const hostUri =
      constants?.expoConfig?.hostUri ||
      constants?.manifest2?.extra?.expoClient?.hostUri ||
      constants?.manifest?.debuggerHost ||
      '';

    let host = '';

    if (hostUri) {
      // hostUri is typically "192.168.x.x:8081" or "localhost:8081"
      host = hostUri.split(':')[0];
    } else if (constants?.linkingUri) {
      // linkingUri might be "exp://192.168.x.x:8081"
      try {
        const withoutScheme = constants.linkingUri.replace(/^[a-zA-Z0-9+.-]+:\/\//, '');
        host = withoutScheme.split('/')[0].split(':')[0];
      } catch (_e) {
        host = '';
      }
    } else if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test' && !constants?.noTestFallback) {
      return `http://localhost:${BACKEND_DEV_PORT}`;
    }

    if (host) {
      // Map Android emulator hostnames to the emulator gateway
      if (platform === 'android' && (host === 'localhost' || host === '127.0.0.1')) {
        host = '10.0.2.2';
      }

      return `http://${host}:${BACKEND_DEV_PORT}`;
    }
  }

  // 3. Clear configuration error
  throw new Error(
    'Pappu backend API URL is not configured. Please set EXPO_PUBLIC_API_URL or run the app with Metro development server.'
  );
}

/**
 * Returns the resolved API base URL.
 */
export function getApiBaseUrl() {
  return resolveApiBaseUrl();
}

/**
 * Startup health check helper against GET /health.
 * Returns { ok: true, data } or throws an error.
 */
export async function checkBackendHealth(timeoutMs = 60000) {
  const baseUrl = getApiBaseUrl();
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller?.signal,
    });

    if (timer) clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`Health check returned HTTP ${response.status}`);
    }

    const data = await response.json().catch(() => ({ status: 'ok' }));
    return { ok: true, data };
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}

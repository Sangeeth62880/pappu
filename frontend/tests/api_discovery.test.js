import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import { resolveApiBaseUrl, checkBackendHealth } from '../src/config/api';
import StartupHealthGate from '../src/components/ui/StartupHealthGate';
import { Text } from 'react-native';

describe('API URL Resolver (src/config/api.js)', () => {
  const originalEnv = process.env.EXPO_PUBLIC_API_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_URL = originalEnv;
  });

  test('returns env URL when set, trimming trailing slashes', () => {
    const url = resolveApiBaseUrl({
      envUrl: 'https://pappu-backend.onrender.com///',
      isDev: false,
    });
    expect(url).toBe('https://pappu-backend.onrender.com');
  });

  test('rejects http URLs in production with a clear error', () => {
    expect(() => {
      resolveApiBaseUrl({
        envUrl: 'http://insecure-api.example.com',
        isDev: false,
      });
    }).toThrow(/Production builds require a secure HTTPS API URL/);
  });

  test('accepts http URLs in development when explicitly set', () => {
    const url = resolveApiBaseUrl({
      envUrl: 'http://192.168.1.100:8000',
      isDev: true,
    });
    expect(url).toBe('http://192.168.1.100:8000');
  });

  test('derives host from Constants.expoConfig.hostUri in development', () => {
    const url = resolveApiBaseUrl({
      envUrl: '',
      isDev: true,
      constants: {
        expoConfig: { hostUri: '192.168.0.42:8081' },
      },
      platform: 'ios',
    });
    expect(url).toBe('http://192.168.0.42:8000');
  });

  test('derives host from Constants.linkingUri when hostUri is absent', () => {
    const url = resolveApiBaseUrl({
      envUrl: '',
      isDev: true,
      constants: {
        linkingUri: 'exp://192.168.4.55:8081/--/something',
      },
      platform: 'ios',
    });
    expect(url).toBe('http://192.168.4.55:8000');
  });

  test('maps localhost to 10.0.2.2 on Android emulator in dev', () => {
    const urlLocalhost = resolveApiBaseUrl({
      envUrl: '',
      isDev: true,
      constants: {
        expoConfig: { hostUri: 'localhost:8081' },
      },
      platform: 'android',
    });
    expect(urlLocalhost).toBe('http://10.0.2.2:8000');

    const urlIp = resolveApiBaseUrl({
      envUrl: '',
      isDev: true,
      constants: {
        expoConfig: { hostUri: '127.0.0.1:8081' },
      },
      platform: 'android',
    });
    expect(urlIp).toBe('http://10.0.2.2:8000');
  });

  test('does not map localhost to 10.0.2.2 on iOS or Web', () => {
    const urlIos = resolveApiBaseUrl({
      envUrl: '',
      isDev: true,
      constants: {
        expoConfig: { hostUri: 'localhost:8081' },
      },
      platform: 'ios',
    });
    expect(urlIos).toBe('http://localhost:8000');
  });

  test('throws plain sentence error when neither env nor dev host is available', () => {
    expect(() => {
      resolveApiBaseUrl({
        envUrl: '',
        isDev: false,
        constants: {},
      });
    }).toThrow('Pappu backend API URL is not configured. Please set EXPO_PUBLIC_API_URL or run the app with Metro development server.');
  });
});

describe('Grep test: No hardcoded backend IPs or URLs in frontend source', () => {
  test('frontend/src does not contain hardcoded IPs or non-env base URLs', () => {
    const srcDir = path.resolve(__dirname, '../src');
    const filesToScan = [];

    function walkDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
          filesToScan.push(fullPath);
        }
      }
    }

    walkDir(srcDir);
    expect(filesToScan.length).toBeGreaterThan(10);

    const forbiddenPatterns = [
      /100\.82\.216\.61/,
      /192\.168\.\d+\.\d+/,
      /ngrok\.io/,
      /ngrok-free\.app/,
    ];

    const violations = [];

    for (const file of filesToScan) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        // Skip SVG path data attributes
        if (line.includes(' d=') || line.includes('viewBox') || line.includes('<path')) {
          return;
        }
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(line)) {
            violations.push(`${path.relative(srcDir, file)}:${idx + 1}: ${line.trim()}`);
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });
});

describe('StartupHealthGate UI and State Derivations', () => {
  test('renders children directly when healthy', async () => {
    const { getByText } = await render(
      <StartupHealthGate testMode="healthy">
        <Text>Main App Loaded</Text>
      </StartupHealthGate>
    );
    expect(getByText('Main App Loaded')).toBeTruthy();
  });

  test('renders Waking Pappu up state with sleepy mascot', async () => {
    const { getByText, getByTestId } = await render(
      <StartupHealthGate testMode="waking">
        <Text>Main App</Text>
      </StartupHealthGate>
    );
    expect(getByTestId('startup-health-waking')).toBeTruthy();
    expect(getByText('Waking Pappu up')).toBeTruthy();
    expect(
      getByText('The server is waking up after being idle. This takes a few moments.')
    ).toBeTruthy();
  });

  test('renders Cant reach Pappu offline state with Retry button', async () => {
    const { getByText, getByTestId } = await render(
      <StartupHealthGate testMode="offline">
        <Text>Main App</Text>
      </StartupHealthGate>
    );
    expect(getByTestId('startup-health-offline')).toBeTruthy();
    expect(getByText("Can't reach Pappu")).toBeTruthy();
    expect(
      getByText('Check your internet connection or verify the server is running.')
    ).toBeTruthy();
    expect(getByTestId('health-retry-button')).toBeTruthy();
  });

  test('renders Configuration Error state with Retry button', async () => {
    const { getByText, getByTestId } = await render(
      <StartupHealthGate testMode="config_error" />
    );
    expect(getByTestId('startup-health-config_error')).toBeTruthy();
    expect(getByText('Configuration Error')).toBeTruthy();
    expect(getByTestId('health-config-retry-button')).toBeTruthy();
  });
});

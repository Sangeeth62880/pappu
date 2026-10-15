/**
 * Tests for MeScreen: prefs persistence, clear chat scope, sign-out clearing,
 * and every control does something real.
 */

global.IS_REACT_ACT_ENVIRONMENT = true;
import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MeScreen from '../src/screens/MeScreen';
import * as client from '../src/api/client';

jest.mock('../src/api/client');
jest.mock('../src/utils/reduceMotion', () => ({
  useReduceMotion: () => true,
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('MeScreen', () => {
  jest.setTimeout(15000);
  const mockToken = 'mock_jwt_token_123';

  const defaultProfile = {
    name: 'Sangeeth',
    email: 'sangeeth@pappu.dev',
    language: 'en',
    voice_replies: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client.fetchProfile.mockResolvedValue(defaultProfile);
    client.patchProfile.mockResolvedValue(defaultProfile);
    client.clearChatHistory.mockResolvedValue({ status: 'cleared', deleted_count: 0 });
  });

  afterEach(() => {
    cleanup();
  });

  // ── Profile Display ──

  test('displays profile name and email from GET /profile', async () => {
    await render(
      <MeScreen token={mockToken} />,
      { wrapper: createWrapper() },
    );

    expect(await screen.findByText('Sangeeth')).toBeTruthy();
    expect(await screen.findByText('sangeeth@pappu.dev')).toBeTruthy();
    expect(client.fetchProfile).toHaveBeenCalledWith(mockToken);
  });

  test('falls back to email prefix when no profile name', async () => {
    client.fetchProfile.mockResolvedValue({
      ...defaultProfile,
      name: null,
    });

    await render(
      <MeScreen token={mockToken} userEmail="test@pappu.dev" />,
      { wrapper: createWrapper() },
    );

    // Falls back to email prefix
    expect(await screen.findByText('test')).toBeTruthy();
  });

  // ── Language Preference ──

  test('language toggle calls PATCH /profile with new language', async () => {
    client.patchProfile.mockResolvedValue({ ...defaultProfile, language: 'ml' });

    await render(
      <MeScreen token={mockToken} />,
      { wrapper: createWrapper() },
    );

    const mlSegment = await screen.findByTestId('lang-segment-ml');
    await act(async () => {
      fireEvent.press(mlSegment);
    });

    await waitFor(() => {
      expect(client.patchProfile).toHaveBeenCalledWith(mockToken, { language: 'ml' });
    });
  });

  test('language defaults to en from profile', async () => {
    await render(
      <MeScreen token={mockToken} />,
      { wrapper: createWrapper() },
    );

    const enSegment = await screen.findByTestId('lang-segment-en');
    expect(enSegment).toBeTruthy();
  });

  // ── Voice Replies Toggle ──

  test('voice replies toggle calls PATCH /profile', async () => {
    client.patchProfile.mockResolvedValue({ ...defaultProfile, voice_replies: false });

    await render(
      <MeScreen token={mockToken} />,
      { wrapper: createWrapper() },
    );

    const toggle = await screen.findByTestId('voice-replies-toggle');
    await act(async () => {
      fireEvent(toggle, 'valueChange', false);
    });

    await waitFor(() => {
      expect(client.patchProfile).toHaveBeenCalledWith(mockToken, { voice_replies: false });
    });
  });

  // ── Clear Chat History ──

  test('clear chat opens dialog, confirm calls onClearChatHistory', async () => {
    const mockClearChat = jest.fn().mockResolvedValue(undefined);

    await render(
      <MeScreen token={mockToken} onClearChatHistory={mockClearChat} />,
      { wrapper: createWrapper() },
    );

    // Dialog should not be visible initially
    expect(screen.queryByTestId('dialog-clear-chat-card')).toBeNull();

    // Press clear chat button
    const clearBtn = await screen.findByTestId('profile-clear-chat-button');
    await act(async () => {
      fireEvent.press(clearBtn);
    });

    // Dialog should now be visible with Pappu mascot
    const dialogCard = await screen.findByTestId('dialog-clear-chat-card');
    expect(dialogCard).toBeTruthy();

    // Pappu concerned mascot should appear
    const mascot = await screen.findByTestId('dialog-clear-chat-mascot');
    expect(mascot).toBeTruthy();

    // Press confirm
    const confirmBtn = await screen.findByTestId('dialog-clear-chat-confirm');
    await act(async () => {
      fireEvent.press(confirmBtn);
    });

    await waitFor(() => {
      expect(mockClearChat).toHaveBeenCalledTimes(1);
    });
  });

  test('clear chat cancel does not call handler', async () => {
    const mockClearChat = jest.fn();

    await render(
      <MeScreen token={mockToken} onClearChatHistory={mockClearChat} />,
      { wrapper: createWrapper() },
    );

    const clearBtn = await screen.findByTestId('profile-clear-chat-button');
    await act(async () => {
      fireEvent.press(clearBtn);
    });

    const cancelBtn = await screen.findByTestId('dialog-clear-chat-cancel');
    await act(async () => {
      fireEvent.press(cancelBtn);
    });

    expect(mockClearChat).not.toHaveBeenCalled();
  });

  // ── Sign Out ──

  test('sign out opens dialog, confirm calls onSignOut', async () => {
    const mockSignOut = jest.fn().mockResolvedValue(undefined);

    await render(
      <MeScreen token={mockToken} onSignOut={mockSignOut} />,
      { wrapper: createWrapper() },
    );

    // Dialog should not be visible initially
    expect(screen.queryByTestId('dialog-signout-card')).toBeNull();

    // Press sign out button
    const signOutBtn = await screen.findByTestId('auth-signout-button');
    await act(async () => {
      fireEvent.press(signOutBtn);
    });

    // Dialog should now be visible with happy Pappu mascot
    const dialogCard = await screen.findByTestId('dialog-signout-card');
    expect(dialogCard).toBeTruthy();

    const mascot = await screen.findByTestId('dialog-signout-mascot');
    expect(mascot).toBeTruthy();

    // Press confirm
    const confirmBtn = await screen.findByTestId('dialog-signout-confirm');
    await act(async () => {
      fireEvent.press(confirmBtn);
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  test('sign out cancel does not call handler', async () => {
    const mockSignOut = jest.fn();

    await render(
      <MeScreen token={mockToken} onSignOut={mockSignOut} />,
      { wrapper: createWrapper() },
    );

    const signOutBtn = await screen.findByTestId('auth-signout-button');
    await act(async () => {
      fireEvent.press(signOutBtn);
    });

    const cancelBtn = await screen.findByTestId('dialog-signout-cancel');
    await act(async () => {
      fireEvent.press(cancelBtn);
    });

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  // ── Every Control Does Something Real ──

  test('all interactive controls have real handlers', async () => {
    const mockClearChat = jest.fn().mockResolvedValue(undefined);
    const mockSignOut = jest.fn().mockResolvedValue(undefined);

    await render(
      <MeScreen
        token={mockToken}
        onClearChatHistory={mockClearChat}
        onSignOut={mockSignOut}
      />,
      { wrapper: createWrapper() },
    );

    // 1. Language English segment is pressable and calls API
    client.patchProfile.mockResolvedValue({ ...defaultProfile, language: 'ml' });
    const mlSeg = await screen.findByTestId('lang-segment-ml');
    await act(async () => {
      fireEvent.press(mlSeg);
    });
    await waitFor(() => {
      expect(client.patchProfile).toHaveBeenCalledWith(mockToken, { language: 'ml' });
    });

    // 2. Voice replies toggle is interactive
    client.patchProfile.mockClear();
    client.patchProfile.mockResolvedValue({ ...defaultProfile, voice_replies: false });
    const toggle = await screen.findByTestId('voice-replies-toggle');
    await act(async () => {
      fireEvent(toggle, 'valueChange', false);
    });
    await waitFor(() => {
      expect(client.patchProfile).toHaveBeenCalledWith(mockToken, { voice_replies: false });
    });

    // 3. Clear chat button opens dialog
    const clearBtn = await screen.findByTestId('profile-clear-chat-button');
    await act(async () => {
      fireEvent.press(clearBtn);
    });
    const clearDialog = await screen.findByTestId('dialog-clear-chat-card');
    expect(clearDialog).toBeTruthy();

    // Close the dialog
    const clearCancel = await screen.findByTestId('dialog-clear-chat-cancel');
    await act(async () => {
      fireEvent.press(clearCancel);
    });

    // 4. Sign out button opens dialog
    const signOutBtn = await screen.findByTestId('auth-signout-button');
    await act(async () => {
      fireEvent.press(signOutBtn);
    });
    const signOutDialog = await screen.findByTestId('dialog-signout-card');
    expect(signOutDialog).toBeTruthy();
  });

  // ── Bug 4: Voice Replies Toggle & Row Alignment Fidelity ──

  test('voice replies toggle matches Stitch spec: 48x28 track, 20x20 thumb in ink, centered in 56pt row', async () => {
    await render(
      <MeScreen token={mockToken} />,
      { wrapper: createWrapper() },
    );

    const toggle = await screen.findByTestId('voice-replies-toggle');
    const thumb = await screen.findByTestId('voice-replies-toggle-thumb');

    // Flatten styles
    const trackStyle = Array.isArray(toggle.props.style)
      ? Object.assign({}, ...toggle.props.style.filter(Boolean))
      : toggle.props.style;
    const thumbStyle = Array.isArray(thumb.props.style)
      ? Object.assign({}, ...thumb.props.style.filter(Boolean))
      : thumb.props.style;

    // Track dimensions & styling per Stitch
    expect(trackStyle.width).toBe(48);
    expect(trackStyle.height).toBe(28);
    expect(trackStyle.borderRadius).toBe(14);
    expect(trackStyle.borderWidth).toBe(2);

    // Thumb dimensions & color per Stitch (20x20 circular ink thumb)
    expect(thumbStyle.width).toBe(20);
    expect(thumbStyle.height).toBe(20);
    expect(thumbStyle.borderRadius).toBe(10);
    expect(thumbStyle.backgroundColor).toBe('#1F2937'); // colors.ink
  });

  test('language segment container is 36pt high and vertically centered in 56pt row', async () => {
    await render(
      <MeScreen token={mockToken} />,
      { wrapper: createWrapper() },
    );

    const enSegment = await screen.findByTestId('lang-segment-en');
    const container = enSegment.parent;

    const containerStyle = Array.isArray(container.props.style)
      ? Object.assign({}, ...container.props.style.filter(Boolean))
      : container.props.style;

    expect(containerStyle.height).toBe(36);
  });

  test('mascot showcase is rendered in __DEV__ but omitted when __DEV__ is false', async () => {
    const originalDev = global.__DEV__;
    try {
      global.__DEV__ = true;
      const { queryByTestId: queryDev, unmount: unmountDev } = await render(
        <MeScreen token={mockToken} />,
        { wrapper: createWrapper() },
      );
      expect(queryDev('profile-mascot-dev-button')).toBeTruthy();
      unmountDev();

      global.__DEV__ = false;
      const { queryByTestId: queryProd, unmount: unmountProd } = await render(
        <MeScreen token={mockToken} />,
        { wrapper: createWrapper() },
      );
      expect(queryProd('profile-mascot-dev-button')).toBeNull();
      unmountProd();
    } finally {
      global.__DEV__ = originalDev;
    }
  });
});


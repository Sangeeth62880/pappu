import React from 'react';
import { Linking, Platform } from 'react-native';
import { render, fireEvent, waitFor, act, cleanup } from '@testing-library/react-native';
import App from '../App';
import QuickAccessSection from '../src/components/QuickAccessSection';
import MeScreen from '../src/screens/MeScreen';
import * as client from '../src/api/client';
import * as supabaseApi from '../src/api/supabase';
import * as SecureStore from 'expo-secure-store';
import { mockAudioRecorder, requestRecordingPermissionsAsync } from 'expo-audio';
import { takeListenRequest, resetListenTriggerForTests } from '../src/utils/listenTrigger';

jest.mock('../src/api/client');
jest.mock('../src/api/supabase');
jest.mock('expo-secure-store');

const session = { access_token: 'mock_jwt_token', user: { email: 'test@pappu.dev' } };

function stepLabels(utils) {
  return utils.getAllByTestId('quick-access-step').map((step) => step.children[0].props.children);
}

describe('Me screen: Quick access', () => {
  let urlListeners;

  beforeEach(() => {
    jest.clearAllMocks();
    resetListenTriggerForTests();
    urlListeners = [];
    Linking.addEventListener.mockImplementation((type, fn) => {
      urlListeners.push(fn);
      return { remove: jest.fn() };
    });
    Linking.getInitialURL.mockResolvedValue(null);
    Linking.openURL.mockResolvedValue(true);
    client.fetchProfile.mockResolvedValue({ name: 'Test', voice_replies: true, language: 'en' });
    client.fetchBudgets.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  test('is shown on the Me screen', async () => {
    const utils = await render(<MeScreen token="t" />);
    expect(await utils.findByTestId('quick-access-card')).toBeTruthy();
    expect(utils.getByText('Quick access')).toBeTruthy();
    expect(utils.getByTestId('quick-access-test-button')).toBeTruthy();
  });

  test('iOS lists the Shortcuts, Action Button, Back Tap and Lock Screen setup', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const utils = await render(<QuickAccessSection />);

    expect(stepLabels(utils)).toEqual([
      'App icon',
      'Make a shortcut',
      'Action Button',
      'Back Tap',
      'Lock Screen',
    ]);
    expect(utils.getByText(/add Open URLs with pappu:\/\/listen/)).toBeTruthy();
  });

  test('Android lists the icon, Quick Settings tile, power button and button mapping setup', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const utils = await render(<QuickAccessSection />);

    expect(stepLabels(utils)).toEqual([
      'App icon',
      'Quick Settings tile',
      'Power button',
      'Other buttons',
    ]);
    expect(utils.getByText(/Digital assistant app > Pappu/)).toBeTruthy();
  });

  test.each(['ios', 'android'])('%s text has no hyphens or em dashes', async (os) => {
    jest.replaceProperty(Platform, 'OS', os);
    const utils = await render(<QuickAccessSection />);
    const texts = [];
    const walk = (node) => {
      if (typeof node === 'string') texts.push(node);
      else if (Array.isArray(node)) node.forEach(walk);
      else if (node?.children) walk(node.children);
    };
    walk(utils.toJSON());
    expect(texts.length).toBeGreaterThan(5);
    texts.forEach((text) => expect(text).not.toMatch(/[-–—]/));
  });

  test('Test it opens pappu://listen through the OS', async () => {
    const utils = await render(<QuickAccessSection />);
    await fireEvent.press(utils.getByTestId('quick-access-test-button'));
    expect(Linking.openURL).toHaveBeenCalledWith('pappu://listen');
  });

  test('Test it still works in app when the OS cannot open the link', async () => {
    Linking.openURL.mockRejectedValueOnce(new Error('No app to handle pappu://'));
    const utils = await render(<QuickAccessSection />);

    await act(async () => {
      fireEvent.press(utils.getByTestId('quick-access-test-button'));
    });

    expect(takeListenRequest()).not.toBeNull();
  });

  test('end to end: Test it on the Me tab opens the assistant and records', async () => {
    supabaseApi.getSession.mockResolvedValue(session);
    supabaseApi.supabase = {
      auth: {
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      },
    };
    SecureStore.getItemAsync.mockResolvedValue('true');
    client.fetchSummary.mockResolvedValue({
      balance: 0,
      total_income: 0,
      total_expense: 0,
      category_breakdown: [],
      transaction_count: 0,
    });
    client.fetchTransactions.mockResolvedValue([]);
    client.fetchChatHistory.mockResolvedValue({ messages: [] });
    client.fetchActivePending.mockResolvedValue(null);
    requestRecordingPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    // The OS hands the link straight back to the running app.
    Linking.openURL.mockImplementation(async (url) => {
      urlListeners.forEach((fn) => fn({ url }));
      return true;
    });

    const utils = await render(<App />);
    fireEvent.press(await utils.findByTestId('tab-me'));
    await act(async () => {
      fireEvent.press(await utils.findByTestId('quick-access-test-button'));
    });

    expect(await utils.findByTestId('assistant-modal')).toBeTruthy();
    await waitFor(() => expect(mockAudioRecorder.record).toHaveBeenCalledTimes(1));
  });
});

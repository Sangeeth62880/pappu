import React from 'react';
import { render, act } from '@testing-library/react-native';
import VoiceOverlayHost from '../src/components/voiceOverlay/VoiceOverlayHost';
import { openVoiceOverlay, resetVoiceOverlayForTests } from '../src/utils/voiceOverlayStore';

let mockOverlayLoaded = false;
jest.mock('../src/components/voiceOverlay/VoiceOverlay', () => {
  mockOverlayLoaded = true;
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="voice-overlay" /> };
});

test('the overlay module is required only when the overlay first opens', async () => {
  resetVoiceOverlayForTests();
  const utils = await render(<VoiceOverlayHost token="tok" />);
  expect(mockOverlayLoaded).toBe(false);
  expect(utils.toJSON()).toBeNull();

  await act(async () => openVoiceOverlay('link'));
  expect(mockOverlayLoaded).toBe(true);
  expect(utils.getByTestId('voice-overlay')).toBeTruthy();
});

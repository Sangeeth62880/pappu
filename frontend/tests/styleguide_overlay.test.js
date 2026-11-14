import React from 'react';
import { render, fireEvent, act, cleanup } from '@testing-library/react-native';
import StyleguideScreen from '../src/screens/StyleguideScreen';
import VoiceOverlayView from '../src/components/voiceOverlay/VoiceOverlayView';
import { PREVIEW_STATES, previewState } from '../src/components/voiceOverlay/overlayPreviews';
import { overlayVisual } from '../src/components/voiceOverlay/overlayMachine';

jest.mock('expo-secure-store');

const hidden = { includeHiddenElements: true };
const pose = (utils) =>
  utils
    .getByTestId('voice-overlay-mascot', hidden)
    .children.find((c) => c.props?.testID?.startsWith('pappu-pose-'))
    ?.props.testID.replace('pappu-pose-', '');

describe('overlay previews', () => {
  afterEach(() => cleanup());

  test.each(PREVIEW_STATES.flatMap((name) => [[name, 'en'], [name, 'ml']]))(
    '%s (%s) renders without the backend',
    async (name, lang) => {
      const state = previewState(name, lang);
      const utils = await render(<VoiceOverlayView state={state} onClose={() => {}} />);
      expect(utils.getByTestId('voice-overlay')).toBeTruthy();
      expect(pose(utils)).toBe(overlayVisual(state).pose);
      if (name.startsWith('error.')) {
        expect(utils.getByTestId(`voice-overlay-error-${name.slice(6)}`)).toBeTruthy();
      }
    }
  );

  test('every preview state is distinct and reaches its phase', () => {
    expect(previewState('speaking').audioPlaying).toBe(true);
    expect(previewState('confirm').reply.pending.id).toBe('preview');
    expect(previewState('budget').reply.results[0].data.budget_alert.alert).toBe('over');
    expect(previewState('result', 'ml').lang).toBe('ml');
  });

  test('the styleguide opens a preview and closes it with its exit', async () => {
    const utils = await render(<StyleguideScreen onBack={() => {}} />);
    expect(utils.getByTestId('styleguide-overlay-section')).toBeTruthy();

    await act(async () => fireEvent.press(utils.getByTestId('styleguide-overlay-confirm')));
    expect(utils.getByTestId('voice-overlay-yes')).toBeTruthy();

    await act(async () => fireEvent.press(utils.getByTestId('voice-overlay-close')));
    expect(utils.queryByTestId('voice-overlay')).toBeNull();
  });
});

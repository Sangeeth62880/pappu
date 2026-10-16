import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import CoinButton from '../src/components/ui/CoinButton';

jest.mock('expo-secure-store');

describe('CoinButton & Gesture', () => {
  test('coin press and hold for >=300ms activates listening state in place and logs length on release', async () => {
    const onOpen = jest.fn();
    const onRecComplete = jest.fn();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { findByTestId } = await render(
      <CoinButton
        testID="test-coin-btn"
        initialTooltipVisible={false}
        onOpenAssistant={onOpen}
        onRecordingComplete={onRecComplete}
      />
    );

    const coinBtn = await findByTestId('test-coin-btn');

    jest.useFakeTimers();

    // Press in
    fireEvent(coinBtn, 'pressIn');

    // Fast-forward 350ms to exceed 300ms hold threshold
    act(() => {
      jest.advanceTimersByTime(350);
    });

    // Coin listening state active
    expect(await findByTestId('coin-listening-state')).toBeTruthy();

    // Release after hold
    fireEvent(coinBtn, 'pressOut');

    expect(logSpy).toHaveBeenCalledWith('Recording length:', expect.any(Number), 'ms');
    expect(onRecComplete).toHaveBeenCalledWith({ durationMs: expect.any(Number) });

    logSpy.mockRestore();
    jest.useRealTimers();
  });
});

import React from 'react';
import { render, act, screen } from '@testing-library/react-native';
import Pappu from '../src/components/ui/Pappu';
import { setGlobalReduceMotion } from '../src/utils/reduceMotion';

describe('Pappu blinkInListening (voice overlay)', () => {
  let randomSpy;
  beforeEach(() => {
    jest.useFakeTimers();
    setGlobalReduceMotion(false);
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5); // blink at 4000ms
  });
  afterEach(() => {
    randomSpy.mockRestore();
    jest.useRealTimers();
  });

  test('the listening pose blinks when opted in', async () => {
    await render(<Pappu mood="listening" enableBlinkInTest blinkInListening autoSleepy={false} />);
    expect(screen.queryByTestId('pappu-blink-overlay')).toBeNull();

    await act(async () => jest.advanceTimersByTime(4000));
    expect(screen.getByTestId('pappu-blink-overlay')).toBeTruthy();

    await act(async () => jest.advanceTimersByTime(125));
    expect(screen.queryByTestId('pappu-blink-overlay')).toBeNull();
  });

  test('without the opt in, the listening pose never blinks (other screens unchanged)', async () => {
    await render(<Pappu mood="listening" enableBlinkInTest autoSleepy={false} />);
    await act(async () => jest.advanceTimersByTime(4000));
    expect(screen.queryByTestId('pappu-blink-overlay')).toBeNull();
    await act(async () => jest.advanceTimersByTime(6000));
    expect(screen.queryByTestId('pappu-blink-overlay')).toBeNull();
  });

  test('other poses still never blink with the opt in', async () => {
    await render(<Pappu mood="thinking" enableBlinkInTest blinkInListening autoSleepy={false} />);
    await act(async () => jest.advanceTimersByTime(10000));
    expect(screen.queryByTestId('pappu-blink-overlay')).toBeNull();
  });

  test('no blink under Reduce Motion', async () => {
    setGlobalReduceMotion(true);
    await render(<Pappu mood="listening" enableBlinkInTest blinkInListening autoSleepy={false} />);
    await act(async () => jest.advanceTimersByTime(10000));
    expect(screen.queryByTestId('pappu-blink-overlay')).toBeNull();
    setGlobalReduceMotion(false);
  });
});

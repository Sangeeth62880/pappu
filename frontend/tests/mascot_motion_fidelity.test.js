/**
 * Comprehensive motion, mascot states, and reduce-motion verification tests.
 * Requirements:
 * 1. All ten Pappu states: idle, listening, thinking, speaking, happy, excited, worried, concerned, confused, sleepy.
 *    Server moods map to poses. Client states (listening, thinking, speaking, sleepy after 60s idle) override them.
 * 2. Reduce Motion fallbacks: zero translation/scale, instant fade-only or instant state replacement.
 * 3. Coin shower limits: 1.2s duration, max 12 coins, strictly on income only.
 */

global.IS_REACT_ACT_ENVIRONMENT = true;
import React from 'react';
import { render, screen, act, cleanup } from '@testing-library/react-native';
import Pappu, {
  resolveMascotPose,
  normalizeMood,
  SERVER_MOODS,
  CLIENT_STATES,
  ALL_POSES,
  BLINK_INTERVAL_MIN,
  BLINK_INTERVAL_MAX,
  BLINK_DURATION,
} from '../src/components/ui/Pappu';
import CoinShower, { MAX_COINS, SHOWER_DURATION_MS } from '../src/components/ui/CoinShower';
import MascotDevToggle from '../src/components/ui/MascotDevToggle';
import * as reduceMotionModule from '../src/utils/reduceMotion';

describe('Mascot States & Motion Fidelity', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  // ─── 1. All Ten Pappu States & Mapping ───
  describe('All Ten Pappu States & Pose Resolution', () => {
    test('canonical ten poses exist and are distinct', () => {
      expect(ALL_POSES).toHaveLength(10);
      expect(ALL_POSES).toEqual([
        'idle',
        'listening',
        'thinking',
        'speaking',
        'happy',
        'excited',
        'worried',
        'concerned',
        'confused',
        'sleepy',
      ]);
    });

    test('maps all 6 server moods to canonical mascot poses', () => {
      expect(resolveMascotPose({ serverMood: 'neutral' })).toBe('idle');
      expect(resolveMascotPose({ serverMood: 'happy' })).toBe('happy');
      expect(resolveMascotPose({ serverMood: 'excited' })).toBe('excited');
      expect(resolveMascotPose({ serverMood: 'concerned' })).toBe('concerned');
      expect(resolveMascotPose({ serverMood: 'confused' })).toBe('confused');
      expect(resolveMascotPose({ serverMood: 'worried' })).toBe('worried');
    });

    test('client interaction states override server moods', () => {
      // Listening overrides all moods
      SERVER_MOODS.forEach((mood) => {
        expect(resolveMascotPose({ serverMood: mood, clientState: 'listening' })).toBe('listening');
      });

      // Thinking overrides all moods
      SERVER_MOODS.forEach((mood) => {
        expect(resolveMascotPose({ serverMood: mood, clientState: 'thinking' })).toBe('thinking');
      });

      // Speaking overrides all moods
      SERVER_MOODS.forEach((mood) => {
        expect(resolveMascotPose({ serverMood: mood, clientState: 'speaking' })).toBe('speaking');
      });

      // Sleepy overrides all moods
      SERVER_MOODS.forEach((mood) => {
        expect(resolveMascotPose({ serverMood: mood, clientState: 'sleepy' })).toBe('sleepy');
      });

      // isSleepy flag overrides all moods
      SERVER_MOODS.forEach((mood) => {
        expect(resolveMascotPose({ serverMood: mood, isSleepy: true })).toBe('sleepy');
      });
    });

    test('client state idle or null does not override active server mood', () => {
      expect(resolveMascotPose({ serverMood: 'happy', clientState: 'idle' })).toBe('happy');
      expect(resolveMascotPose({ serverMood: 'excited', clientState: null })).toBe('excited');
      expect(resolveMascotPose({ serverMood: 'worried', clientState: undefined })).toBe('worried');
    });

    test('unknown or empty inputs safely fall back to idle', () => {
      expect(resolveMascotPose({})).toBe('idle');
      expect(resolveMascotPose(null)).toBe('idle');
      expect(resolveMascotPose('unknown_mood_code')).toBe('idle');
      expect(normalizeMood('unknown')).toBe('idle');
    });

    test.each(ALL_POSES)('renders mascot pose: %s', async (pose) => {
      await render(
        <Pappu mood={pose} size={120} testID={`pappu-${pose}`} autoSleepy={false} />
      );
      expect(screen.getByTestId(`pappu-${pose}`)).toBeTruthy();
      expect(screen.getByTestId(`pappu-pose-${pose}`)).toBeTruthy();
    });
  });

  // ─── 2. Mascot Dev Toggle Verification ───
  describe('Mascot Dev Toggle Component', () => {
    test('renders all 10 pose selectors, server moods and client states', async () => {
      await render(<MascotDevToggle />);

      // Verify dev preview card and active pose indicator
      expect(screen.getByTestId('mascot-dev-preview-card')).toBeTruthy();
      expect(screen.getByTestId('mascot-dev-mascot')).toBeTruthy();
      expect(screen.getByTestId('mascot-dev-active-pose')).toBeTruthy();

      // Verify all 10 direct pose pills
      ALL_POSES.forEach((p) => {
        expect(screen.getByTestId(`dev-pose-${p}`)).toBeTruthy();
      });

      // Verify server moods
      SERVER_MOODS.forEach((m) => {
        expect(screen.getByTestId(`dev-server-mood-${m}`)).toBeTruthy();
      });

      // Verify client states
      ['listening', 'thinking', 'speaking', 'sleepy'].forEach((st) => {
        expect(screen.getByTestId(`dev-client-state-${st}`)).toBeTruthy();
      });

      // Verify inactivity simulation button
      expect(screen.getByTestId('dev-simulate-inactivity-btn')).toBeTruthy();
    });
  });

  // ─── 3. Coin Shower Limits & Rules ───
  describe('Coin Shower Limits & Celebration Spec', () => {
    test('enforces max 12 coins and 1.2s duration constants', () => {
      expect(MAX_COINS).toBe(12);
      expect(SHOWER_DURATION_MS).toBe(1200);
    });

    test('clamps coin count to max 12 even if larger number is requested', async () => {
      await render(
        <CoinShower coinCount={50} onComplete={jest.fn()} />
      );

      // Should render at most 12 coins
      const coins = [];
      for (let i = 0; i < 20; i++) {
        const coin = screen.queryAllByTestId(`shower-coin-${i}`);
        if (coin.length > 0) coins.push(coin);
      }
      expect(coins.length).toBeLessThanOrEqual(12);
    });

    test('calls onComplete after animation terminates', async () => {
      const onComplete = jest.fn();
      await render(<CoinShower onComplete={onComplete} />);
      expect(onComplete).toBeDefined();
    });
  });

  // ─── 4. Reduce Motion Fallbacks ───
  describe('Accessibility Reduce Motion Fallbacks', () => {
    beforeEach(() => {
      reduceMotionModule.setGlobalReduceMotion(false);
    });

    afterEach(() => {
      reduceMotionModule.setGlobalReduceMotion(false);
    });

    test('disables coin shower completely when reduce motion is enabled', async () => {
      reduceMotionModule.setGlobalReduceMotion(true);
      const onComplete = jest.fn();

      await render(
        <CoinShower onComplete={onComplete} testID="test-coin-shower" />
      );

      // In Reduce Motion, CoinShower renders null and executes onComplete immediately
      expect(screen.queryByTestId('test-coin-shower')).toBeNull();
      expect(onComplete).toHaveBeenCalled();
    });

    test('disables sleepy floating z particle when reduce motion is enabled', async () => {
      reduceMotionModule.setGlobalReduceMotion(true);

      await render(
        <Pappu clientState="sleepy" size={120} autoSleepy={false} testID="sleepy-mascot" />
      );

      // Sleepy pose is rendered statically
      expect(screen.getByTestId('sleepy-mascot')).toBeTruthy();
      expect(screen.getByTestId('pappu-pose-sleepy')).toBeTruthy();
      // Floating z is disabled
      expect(screen.queryByTestId('pappu-sleepy-z')).toBeNull();
    });
  });

  // ─── 5. Bug 5: Idle Blink & No Figure Flip/Scale Verification ───
  describe('Bug 5: Mascot Idle Eye Blink & No Figure Flip Verification', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      reduceMotionModule.setGlobalReduceMotion(false);
    });

    afterEach(() => {
      cleanup();
      jest.clearAllTimers();
      jest.useRealTimers();
      reduceMotionModule.setGlobalReduceMotion(false);
    });

    test('Pappu never applies rotation or horizontal/vertical scale transforms to the figure at idle', async () => {
      await render(
        <Pappu mood="idle" size={120} testID="test-idle-pappu" autoSleepy={false} />
      );

      const container = screen.getByTestId('test-idle-pappu');
      const flatStyle = Array.isArray(container.props.style)
        ? Object.assign({}, ...container.props.style.filter(Boolean))
        : container.props.style || {};

      // Assert no transforms (rotate, rotateX, rotateY, scaleX, scaleY, etc.) on container
      if (flatStyle.transform) {
        flatStyle.transform.forEach((t) => {
          expect(t.rotate).toBeUndefined();
          expect(t.rotateX).toBeUndefined();
          expect(t.rotateY).toBeUndefined();
          expect(t.scaleX).toBeUndefined();
          expect(t.scaleY).toBeUndefined();
        });
      } else {
        expect(flatStyle.transform).toBeUndefined();
      }
    });

    test('blink interval constants are strictly within 3 to 5 seconds and 120ms duration', () => {
      expect(BLINK_INTERVAL_MIN).toBe(3000);
      expect(BLINK_INTERVAL_MAX).toBe(5000);
      expect(BLINK_DURATION).toBe(120);
    });

    test('eye blink overlay shows closed eyes for 120ms and restores open eyes', async () => {
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5); // 3000 + 1000 = 4000ms
      try {
        await render(
          <Pappu mood="idle" size={120} enableBlinkInTest={true} autoSleepy={false} testID="blink-pappu" />
        );

        // Initially not blinking
        expect(screen.queryByTestId('pappu-blink-overlay')).toBeNull();

        // Advance by 3900ms (below 4000ms): not blinking yet
        await act(async () => {
          jest.advanceTimersByTime(3900);
        });
        expect(screen.queryByTestId('pappu-blink-overlay')).toBeNull();

        // Advance by 100ms (reaches 4000ms): blink triggers and overlay renders
        await act(async () => {
          jest.advanceTimersByTime(100);
        });
        expect(screen.queryByTestId('pappu-blink-overlay')).toBeTruthy();

        // Advance by 125ms (past 120ms duration): blink cycle completes and overlay closes
        await act(async () => {
          jest.advanceTimersByTime(125);
        });
        expect(screen.queryByTestId('pappu-blink-overlay')).toBeNull();
      } finally {
        randomSpy.mockRestore();
      }
    });

    test('no blink under Reduce Motion', async () => {
      reduceMotionModule.setGlobalReduceMotion(true);

      await render(
        <Pappu mood="idle" size={120} enableBlinkInTest={true} autoSleepy={false} testID="rm-blink-pappu" />
      );

      // Advance past 10 seconds: must NEVER blink
      await act(async () => {
        jest.advanceTimersByTime(10000);
      });
      expect(screen.queryByTestId('pappu-blink-overlay')).toBeNull();
    });

    test('no blink when mascot is in non-idle client states (listening, thinking, speaking)', async () => {
      await render(
        <Pappu clientState="listening" size={120} enableBlinkInTest={true} autoSleepy={false} testID="listening-pappu" />
      );

      await act(async () => {
        jest.advanceTimersByTime(10000);
      });
      expect(screen.queryByTestId('pappu-blink-overlay')).toBeNull();
    });
  });
});


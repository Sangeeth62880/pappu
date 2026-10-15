import { useState, useEffect, useRef } from 'react';
import { useReduceMotion } from './reduceMotion';

/**
 * Hook to animate a numeric count-up from previous value (or 0) to targetAmount over duration ms.
 * Follows Pappu Motion Specification:
 * - Duration: 400ms
 * - Easing: ease-out (cubic)
 * - Reduce Motion Fallback: instant target value (0ms)
 * - In test environment (Jest): instant target value (0ms) to ensure deterministic assertions
 */
export function useCountUp(targetAmount, duration = 400, delay = 0) {
  const reduceMotion = useReduceMotion();
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

  const numericTarget = typeof targetAmount === 'number'
    ? targetAmount
    : parseFloat(String(targetAmount).replace(/[^0-9.-]/g, '')) || 0;

  const [displayValue, setDisplayValue] = useState(numericTarget);
  const prevTargetRef = useRef(numericTarget);

  useEffect(() => {
    const startVal = prevTargetRef.current !== numericTarget ? prevTargetRef.current : 0;
    prevTargetRef.current = numericTarget;

    if (reduceMotion || isTest) {
      setDisplayValue(numericTarget);
      return;
    }

    let startTime = null;
    let animationFrameId;

    const timeoutId = setTimeout(() => {
      const step = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        // Cubic ease-out: 1 - (1 - progress)^3
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = startVal + (numericTarget - startVal) * easeOut;
        setDisplayValue(Math.round(current * 100) / 100);

        if (progress < 1) {
          animationFrameId = requestAnimationFrame(step);
        } else {
          setDisplayValue(numericTarget);
        }
      };
      animationFrameId = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [numericTarget, duration, delay, reduceMotion, isTest]);

  return isTest || reduceMotion ? numericTarget : displayValue;
}

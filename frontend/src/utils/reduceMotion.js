import { useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

let globalReduceMotion = false;

// Initial sync check
if (AccessibilityInfo?.isReduceMotionEnabled) {
  AccessibilityInfo.isReduceMotionEnabled()
    .then((enabled) => {
      globalReduceMotion = Boolean(enabled);
    })
    .catch(() => {});
}

if (AccessibilityInfo?.addEventListener) {
  AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
    globalReduceMotion = Boolean(enabled);
  });
}

/**
 * Returns whether Reduce Motion is currently active globally.
 */
export function getReduceMotion() {
  return globalReduceMotion;
}

/**
 * Sets global reduce motion state (used in testing and overrides).
 */
export function setGlobalReduceMotion(enabled) {
  globalReduceMotion = Boolean(enabled);
}

/**
 * React hook to listen for Reduce Motion accessibility preferences.
 */
export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(globalReduceMotion);

  useEffect(() => {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
      return;
    }
    let mounted = true;

    if (AccessibilityInfo?.isReduceMotionEnabled) {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((enabled) => {
          if (mounted) setReduceMotion(Boolean(enabled));
        })
        .catch(() => {});
    }

    const subscription = AccessibilityInfo?.addEventListener
      ? AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
          if (mounted) setReduceMotion(Boolean(enabled));
        })
      : null;

    return () => {
      mounted = false;
      if (subscription?.remove) {
        subscription.remove();
      }
    };
  }, []);

  return reduceMotion;
}

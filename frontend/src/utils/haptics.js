import * as Haptics from 'expo-haptics';
import { queryClient } from '../data/queryClient';
import { queryKeys } from '../data/queryKeys';

/**
 * Haptic preference from the cached profile. The profiles table has haptic_feedback
 * (default true) but GET /profile does not return it yet, so until it does this is on.
 * A value of false (haptic_feedback or haptics_enabled) turns the ticks off.
 */
export function hapticsEnabled() {
  const profile = queryClient.getQueryData(queryKeys.profile());
  return profile?.haptic_feedback !== false && profile?.haptics_enabled !== false;
}

/** One short tick: 'summon' (light), 'success' or 'error'. Never throws. */
export function hapticTick(kind) {
  if (!hapticsEnabled()) return;
  try {
    const done =
      kind === 'summon'
        ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        : Haptics.notificationAsync(
            kind === 'error'
              ? Haptics.NotificationFeedbackType.Error
              : Haptics.NotificationFeedbackType.Success
          );
    done?.catch?.(() => {});
  } catch (_e) {}
}

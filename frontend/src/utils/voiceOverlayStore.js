import { useSyncExternalStore } from 'react';

/**
 * The one voice overlay ("Pappu emerges and listens"). Every trigger calls
 * openVoiceOverlay(source): pappu://listen links, icon quick actions, the Android tile and
 * assist gesture (all through listenTrigger.js) and a hold on the coin button.
 * VoiceOverlayHost renders the overlay while this is open.
 */
let state = { open: false, source: null, sessionId: 0 };
const subscribers = new Set();

function emit() {
  subscribers.forEach((fn) => fn());
}

function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function getSnapshot() {
  return state;
}

/**
 * Opens the overlay. A trigger while it is already open is ignored.
 *
 * @param {'link'|'quick_action'|'coin'|'styleguide'|string} source what summoned it
 * @returns {boolean} whether this call opened it
 */
export function openVoiceOverlay(source = 'unknown') {
  if (state.open) return false;
  state = { open: true, source, sessionId: state.sessionId + 1 };
  emit();
  return true;
}

export function closeVoiceOverlay() {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

export function isVoiceOverlayOpen() {
  return state.open;
}

/** { open, source, sessionId }; sessionId changes on every open. */
export function useVoiceOverlay() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function resetVoiceOverlayForTests() {
  state = { open: false, source: null, sessionId: 0 };
  emit();
}

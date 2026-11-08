import { useSyncExternalStore } from 'react';
import { Linking } from 'react-native';
import { isMicBusy } from './micActivity';

/**
 * "Press a button and talk": pappu://listen opens the assistant and starts listening.
 *
 * Links are caught from the very first render (cold start) and while the app runs
 * (warm start), then held here as one pending request until the app is ready to act on
 * it: fonts loaded, health check passed, session restored. HomeScreen consumes it.
 */
export const LISTEN_URL = 'pappu://listen';

// A request waits this long for startup (Render cold start, a health check retry).
export const LISTEN_REQUEST_MAX_AGE_MS = 2 * 60 * 1000;
// Signed out: listening resumes only if sign in finishes this soon after the screen shows.
export const SIGN_IN_WINDOW_MS = 60 * 1000;

let pending = null;
let nextId = 1;
let initialUrlHandled = false;
const subscribers = new Set();

function emit() {
  subscribers.forEach((fn) => fn());
}

function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function getSnapshot() {
  return pending;
}

/** pappu://listen, also as pappu:///listen or with a trailing slash or query. */
export function isListenUrl(url) {
  if (typeof url !== 'string') return false;
  return /^pappu:\/\/\/?listen\/?(?:[?#].*)?$/i.test(url.trim());
}

/**
 * Turns a listen link into a pending request. Any other URL, or a link that arrives
 * while a mic is already starting or recording, is ignored.
 *
 * @returns {boolean} whether a request was queued
 */
export function handleIncomingUrl(url, now = Date.now()) {
  if (!isListenUrl(url)) return false;
  if (isMicBusy()) return false;
  pending = { id: nextId++, at: now, signInShownAt: null };
  emit();
  return true;
}

/** The sign in screen is showing for the pending request: its sign in window starts now. */
export function noteSignInShown(now = Date.now()) {
  if (pending && pending.signInShownAt == null) pending.signInShownAt = now;
}

/** Removes the pending request and returns it, or null when there is none or it expired. */
export function takeListenRequest(now = Date.now()) {
  const request = pending;
  if (!request) return null;
  pending = null;
  emit();
  if (now - request.at > LISTEN_REQUEST_MAX_AGE_MS) return null;
  if (request.signInShownAt != null && now - request.signInShownAt > SIGN_IN_WINDOW_MS) return null;
  return request;
}

/** Re-renders with the pending request (or null) whenever it changes. */
export function useListenRequest() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Listens for pappu://listen: the URL that launched the app (once per process) and
 * every URL that arrives afterwards. Returns a cleanup function.
 */
export function startListenLinks() {
  if (!initialUrlHandled) {
    initialUrlHandled = true;
    Promise.resolve()
      .then(() => Linking.getInitialURL())
      .then((url) => {
        if (url) handleIncomingUrl(url);
      })
      .catch(() => {});
  }
  const subscription = Linking.addEventListener('url', (event) => handleIncomingUrl(event?.url));
  return () => subscription?.remove?.();
}

export function resetListenTriggerForTests() {
  pending = null;
  initialUrlHandled = false;
  emit();
}

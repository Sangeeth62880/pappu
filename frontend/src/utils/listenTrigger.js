import { useSyncExternalStore } from 'react';
import { Linking, Platform } from 'react-native';
import * as QuickActions from 'expo-quick-actions';
import { isMicBusy } from './micActivity';

/**
 * "Press a button and talk": pappu://listen opens the assistant and starts listening.
 *
 * Links are caught from the very first render (cold start) and while the app runs
 * (warm start), then held here as one pending request until the app is ready to act on
 * it: fonts loaded, health check passed, session restored. HomeScreen consumes it and
 * opens the voice overlay.
 */
export const LISTEN_URL = 'pappu://listen';

// Long-press on the app icon. Android resolves icon as a drawable or mipmap name.
export const TALK_QUICK_ACTION = {
  id: 'talk-to-pappu',
  title: 'Talk to Pappu',
  icon: Platform.OS === 'ios' ? 'symbol:mic.fill' : 'ic_launcher',
  params: { href: LISTEN_URL },
};

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
export function handleIncomingUrl(url, now = Date.now(), source = 'link') {
  if (!isListenUrl(url)) return false;
  if (isMicBusy()) return false;
  pending = { id: nextId++, at: now, signInShownAt: null, source };
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
 * Listens for pappu://listen: the URL or icon quick action that launched the app (once
 * per process) and every one that arrives afterwards. Also registers the "Talk to
 * Pappu" quick action, which carries the same link. Returns a cleanup function.
 */
export function startListenLinks() {
  Promise.resolve()
    .then(() => QuickActions.setItems([TALK_QUICK_ACTION]))
    .catch(() => {});

  if (!initialUrlHandled) {
    initialUrlHandled = true;
    const initialAction = QuickActions.initial;
    if (initialAction?.params?.href) {
      handleIncomingUrl(initialAction.params.href, Date.now(), 'quick_action');
    }
    Promise.resolve()
      .then(() => Linking.getInitialURL())
      .then((url) => {
        if (url) handleIncomingUrl(url);
      })
      .catch(() => {});
  }
  const linkSubscription = Linking.addEventListener('url', (event) => handleIncomingUrl(event?.url));
  const actionSubscription = QuickActions.addListener((action) =>
    handleIncomingUrl(action?.params?.href, Date.now(), 'quick_action')
  );
  return () => {
    linkSubscription?.remove?.();
    actionSubscription?.remove?.();
  };
}

export function resetListenTriggerForTests() {
  pending = null;
  initialUrlHandled = false;
  emit();
}

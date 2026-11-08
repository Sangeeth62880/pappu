import React, { useEffect } from 'react';
import VoiceOverlay from './VoiceOverlay';
import { useVoiceOverlay, closeVoiceOverlay } from '../../utils/voiceOverlayStore';

/**
 * Mounted once at the app shell. Renders nothing until the overlay store opens, so the
 * overlay costs nothing at cold start; each open gets a fresh session (sessionId key).
 */
export default function VoiceOverlayHost({ token, onTransactionMutated }) {
  const { open, source, sessionId } = useVoiceOverlay();

  // Signed out (or never signed in): an open overlay has nothing to talk to.
  useEffect(() => {
    if (open && !token) closeVoiceOverlay();
  }, [open, token]);

  if (!open || !token) return null;
  return (
    <VoiceOverlay
      key={sessionId}
      source={source}
      token={token}
      onTransactionMutated={onTransactionMutated}
      onClosed={closeVoiceOverlay}
    />
  );
}

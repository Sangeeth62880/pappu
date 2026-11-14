import React, { useEffect } from 'react';
import { useVoiceOverlay, closeVoiceOverlay } from '../../utils/voiceOverlayStore';

/**
 * Mounted once at the app shell. Renders nothing until the overlay store opens, and the
 * overlay module (its view, Reanimated styles, blur) is only required on the first open,
 * so it adds nothing to cold start. Each open gets a fresh session (sessionId key).
 */
export default function VoiceOverlayHost({ token, onTransactionMutated }) {
  const { open, source, sessionId } = useVoiceOverlay();

  // Signed out (or never signed in): an open overlay has nothing to talk to.
  useEffect(() => {
    if (open && !token) closeVoiceOverlay();
  }, [open, token]);

  if (!open || !token) return null;
  const VoiceOverlay = require('./VoiceOverlay').default;
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

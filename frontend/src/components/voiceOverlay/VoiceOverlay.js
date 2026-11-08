import React, { useCallback } from 'react';
import VoiceOverlayView from './VoiceOverlayView';

/**
 * One voice overlay session, from summon to dismiss. Owns the session logic and hands
 * plain state to VoiceOverlayView.
 */
export default function VoiceOverlay({ onClosed }) {
  const close = useCallback(() => {
    if (onClosed) onClosed();
  }, [onClosed]);

  return <VoiceOverlayView pose="listening" onClose={close} />;
}

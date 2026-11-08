/**
 * App-wide record of mics that are starting, recording or transcribing.
 *
 * Each MicButton guards its own double taps; this lets code outside it (the
 * pappu://listen deep link) see that some mic is already busy and stay out of the way.
 */
const busyMics = new Set();

export function setMicBusy(id, busy) {
  if (busy) busyMics.add(id);
  else busyMics.delete(id);
}

export function isMicBusy() {
  return busyMics.size > 0;
}

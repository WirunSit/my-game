// Settings kept on this device (not in the student's save: a school computer
// with a mouse and a tablet may want different controls).

/** How to aim and set the power */
export type AimMode =
  /** ↑ ↓ (buttons or keys) for the angle, hold the fire button to charge the power */
  | 'buttons'
  /** Slingshot: touch and hold the battlefield, pull back, let go to fire */
  | 'drag';

const AIM_KEY = 'sciboom.aim';
const listeners = new Set<(mode: AimMode) => void>();

/** Phones and tablets start with the slingshot, computers with the buttons */
function defaultAimMode(): AimMode {
  return typeof window !== 'undefined' && 'ontouchstart' in window ? 'drag' : 'buttons';
}

export function aimMode(): AimMode {
  try {
    const v = localStorage.getItem(AIM_KEY);
    if (v === 'buttons' || v === 'drag') return v;
  } catch {
    // ignore
  }
  return defaultAimMode();
}

export function setAimMode(mode: AimMode) {
  try {
    localStorage.setItem(AIM_KEY, mode);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l(mode));
}

/** Call fn whenever the aim mode changes; returns a function that stops it */
export function onAimModeChange(fn: (mode: AimMode) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

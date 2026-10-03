// Sound effects. Each one is layered like a real recording (e.g. a blast is a
// sharp crack + a deep thump + rumbling debris + the room's echo) and varies a
// little every time so repeats don't sound robotic. A recorded file with the
// same name (see docs/AUDIO.md) is played instead when there is one.
import { NOTE, bell, heldNoise, heldTone, noise, playSample, ready, tone, type Held } from './engine';

/** A little random variation */
const vary = (x: number, amount = 0.08) => x * (1 + (Math.random() * 2 - 1) * amount);

/** Recorded version if there is one (pitch varies a little each time) */
const recorded = (name: string, vol = 1, pan = 0) => !!playSample(name, { vol, pan, rate: vary(1, 0.04), send: 0.1 });

const noHeld: Held = { set() {}, stop() {} };

export const sfx = {
  // ---- Buttons ---------------------------------------------------------------------
  click() {
    const c = ready();
    if (!c || recorded('click', 0.6)) return;
    const t = c.currentTime;
    tone(vary(1400, 0.03), t, 0.05, { type: 'sine', vol: 0.12, slideTo: 900 });
    noise(t, 0.015, { from: 5000, type: 'highpass', vol: 0.05 });
  },
  /** A skill picked for this turn */
  pick() {
    const c = ready();
    if (!c || recorded('pick', 0.7)) return;
    const t = c.currentTime;
    bell(NOTE(84), t, 0.35, { vol: 0.09, send: 0.25 });
    bell(NOTE(91), t + 0.05, 0.4, { vol: 0.07, send: 0.25 });
  },
  /** A skill put back */
  unpick() {
    const c = ready();
    if (!c) return;
    tone(NOTE(79), c.currentTime, 0.12, { type: 'sine', vol: 0.08, slideTo: NOTE(72) });
  },
  /** Can't do that */
  deny() {
    const c = ready();
    if (!c || recorded('deny', 0.6)) return;
    const t = c.currentTime;
    tone(150, t, 0.16, { type: 'square', vol: 0.06, cutoff: 900 });
    tone(140, t + 0.12, 0.2, { type: 'square', vol: 0.06, cutoff: 900 });
  },

  // ---- Shooting ---------------------------------------------------------------------------
  /** The barrel goes off (`size`: bigger weapons boom deeper) */
  fire(size = 1, pan = 0) {
    const c = ready();
    if (!c || recorded('fire', 0.9, pan)) return;
    const t = c.currentTime;
    // Muzzle crack, the boom, and air rushing out
    noise(t, 0.05, { from: 6000, to: 2000, type: 'highpass', vol: 0.35, pan });
    tone(vary(95 / size), t, 0.35, { type: 'sine', vol: 0.55, slideTo: 38, attack: 0.002, pan });
    noise(t, 0.4 * size, { from: 2500, to: 200, vol: 0.4, pan, send: 0.2 });
    noise(t + 0.03, 0.25, { from: 900, to: 3000, type: 'bandpass', q: 1.5, vol: 0.12, pan });
  },
  /** Air rushing past a shell in flight: call set(speed 0–1) as it flies, stop() when it lands */
  flight(): Held {
    if (!ready()) return noHeld;
    return heldNoise({ type: 'bandpass', low: 500, high: 2600, vol: 0.3, q: 2.5 });
  },
  /** Paper plane thrown */
  plane(pan = 0) {
    const c = ready();
    if (!c || recorded('plane', 0.8, pan)) return;
    const t = c.currentTime;
    noise(t, 0.35, { from: 1200, to: 4500, type: 'bandpass', q: 3, vol: 0.4, pan });
    noise(t + 0.02, 0.06, { from: 3000, type: 'highpass', vol: 0.2, pan });
  },
  /** Bigger blasts sound deeper and longer */
  explode(radius = 50, pan = 0) {
    const c = ready();
    if (!c || recorded('explode', Math.min(1.2, radius / 50), pan)) return;
    const t = c.currentTime;
    const size = Math.max(0.7, Math.min(1.8, radius / 50));
    // Crack
    noise(t, 0.06, { from: 7000, to: 1500, type: 'highpass', vol: 0.5, pan });
    // Body of the blast, then the low thump under it
    noise(t, 0.7 * size, { from: 2400, to: 90, vol: 0.7, pan, send: 0.35 });
    tone(vary(70 / size), t, 0.6 * size, { type: 'sine', vol: 0.7, slideTo: 28, attack: 0.003, pan });
    // Dirt and stones raining down
    for (let i = 0; i < 6; i++) {
      const at = t + 0.12 + Math.random() * 0.5 * size;
      noise(at, 0.03 + Math.random() * 0.04, { from: vary(2200, 0.4), type: 'bandpass', q: 2, vol: 0.06 + Math.random() * 0.06, pan: pan + (Math.random() - 0.5) * 0.4 });
    }
  },
  /** Someone got hit (`direct`: full on) */
  hit(direct = false, pan = 0) {
    const c = ready();
    if (!c || recorded(direct ? 'hit_direct' : 'hit', 0.9, pan)) return;
    const t = c.currentTime;
    tone(vary(220), t, 0.16, { type: 'sine', vol: 0.4, slideTo: 90, pan });
    noise(t, 0.08, { from: 1200, to: 300, vol: 0.3, pan });
    if (direct) {
      // A bright "bonk" on top
      bell(vary(NOTE(76), 0.02), t + 0.02, 0.4, { vol: 0.12, ratio: 1.4, index: 3, pan, send: 0.2 });
    }
  },
  /** Holding fire: the power hum rises with the bar. set(power 0–1), stop() on release. */
  chargePower(): Held {
    if (!ready()) return noHeld;
    return heldTone({ type: 'sawtooth', low: 110, high: 660, vol: 0.05, cutoff: 1400 });
  },

  // ---- Turns -------------------------------------------------------------------------------
  turn() {
    const c = ready();
    if (!c || recorded('turn', 0.7)) return;
    const t = c.currentTime;
    bell(NOTE(81), t, 0.9, { vol: 0.12, send: 0.35 });
    bell(NOTE(88), t + 0.12, 1.1, { vol: 0.09, send: 0.35 });
  },
  /** Clock tick in the last seconds of a turn */
  tick(urgent = false) {
    const c = ready();
    if (!c || recorded('tick', 0.5)) return;
    const t = c.currentTime;
    tone(urgent ? 1760 : 1320, t, 0.05, { type: 'square', vol: 0.05, cutoff: 3000 });
    noise(t, 0.012, { from: 6000, type: 'highpass', vol: 0.06 });
  },
  /** One footstep (called every few steps while walking) */
  step() {
    const c = ready();
    if (!c || recorded('step', 0.4)) return;
    const t = c.currentTime;
    noise(t, 0.06, { from: vary(500, 0.25), to: 150, vol: 0.12 });
    noise(t, 0.02, { from: vary(2500, 0.3), type: 'bandpass', vol: 0.04 });
  },

  // ---- Skills --------------------------------------------------------------------------------
  heal() {
    const c = ready();
    if (!c || recorded('heal', 0.8)) return;
    const t = c.currentTime;
    [76, 79, 83, 88, 91].forEach((n, i) => bell(NOTE(n), t + i * 0.06, 0.8, { vol: 0.08, ratio: 2, index: 1, send: 0.45 }));
    noise(t, 0.8, { from: 3000, to: 9000, type: 'highpass', vol: 0.03, attack: 0.3, send: 0.4 });
  },
  shield() {
    const c = ready();
    if (!c || recorded('shield', 0.8)) return;
    const t = c.currentTime;
    tone(NOTE(55), t, 0.7, { type: 'sine', vol: 0.25, slideTo: NOTE(67), attack: 0.05, send: 0.3 });
    tone(NOTE(62), t, 0.7, { type: 'triangle', vol: 0.1, slideTo: NOTE(74), attack: 0.05, send: 0.3 });
    bell(NOTE(86), t + 0.15, 0.9, { vol: 0.07, ratio: 2.7, send: 0.5 });
  },
  /** Fading out of sight */
  stealth() {
    const c = ready();
    if (!c || recorded('stealth', 0.8)) return;
    const t = c.currentTime;
    noise(t, 0.6, { from: 4000, to: 600, type: 'bandpass', q: 2, vol: 0.22, attack: 0.05, send: 0.5 });
    tone(NOTE(84), t, 0.6, { type: 'sine', vol: 0.06, slideTo: NOTE(60), send: 0.5 });
  },
  /** A camouflaged fighter got hit and shows up again */
  reveal() {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone(NOTE(60), t, 0.25, { type: 'sine', vol: 0.1, slideTo: NOTE(84), send: 0.3 });
  },
  /** Paper plane lands: pop, and you're there */
  teleport(pan = 0) {
    const c = ready();
    if (!c || recorded('teleport', 0.8, pan)) return;
    const t = c.currentTime;
    tone(300, t, 0.12, { type: 'sine', vol: 0.25, slideTo: 900, pan });
    noise(t, 0.2, { from: 2000, to: 500, vol: 0.12, pan, send: 0.2 });
  },
  /** Something set on fire / burning at the start of a turn */
  burn(pan = 0) {
    const c = ready();
    if (!c || recorded('burn', 0.8, pan)) return;
    const t = c.currentTime;
    noise(t, 0.6, { from: 800, to: 300, vol: 0.4, attack: 0.05, pan });
    for (let i = 0; i < 8; i++) noise(t + Math.random() * 0.6, 0.015, { from: vary(4000, 0.4), type: 'bandpass', q: 3, vol: 0.18, pan });
  },
  /** The Ultimate goes off */
  ultimate() {
    const c = ready();
    if (!c || recorded('ultimate', 1)) return;
    const t = c.currentTime;
    noise(t, 0.9, { from: 300, to: 5000, type: 'bandpass', q: 1.2, vol: 0.4, attack: 0.6, send: 0.4 });
    [48, 55, 60, 64].forEach((n) => tone(NOTE(n), t + 0.6, 1.2, { type: 'sawtooth', vol: 0.1, cutoff: 1600, attack: 0.02, send: 0.5 }));
  },
  /** A boss winding up its ultimate */
  charge() {
    const c = ready();
    if (!c || recorded('boss_charge', 0.9)) return;
    const t = c.currentTime;
    tone(80, t, 1.4, { type: 'sawtooth', vol: 0.13, slideTo: 640, cutoff: 1200, attack: 0.3 });
    tone(81, t, 1.4, { type: 'sawtooth', vol: 0.13, slideTo: 650, cutoff: 1200, attack: 0.3 });
    noise(t, 1.4, { from: 200, to: 3000, type: 'bandpass', vol: 0.12, attack: 1, send: 0.3 });
  },

  // ---- Boss tricks -----------------------------------------------------------------------------
  lava() {
    const c = ready();
    if (!c || recorded('lava', 1)) return;
    const t = c.currentTime;
    noise(t, 1.6, { from: 160, to: 90, vol: 0.5, attack: 0.3 });
    for (let i = 0; i < 6; i++) tone(vary(90, 0.3), t + Math.random() * 1.2, 0.18, { type: 'sine', vol: 0.15, slideTo: 260 });
  },
  roots() {
    const c = ready();
    if (!c || recorded('roots', 1)) return;
    const t = c.currentTime;
    noise(t, 0.08, { from: 3000, to: 800, type: 'bandpass', vol: 0.35 });
    noise(t, 0.6, { from: 900, to: 200, vol: 0.4, send: 0.2 });
    for (let i = 0; i < 5; i++) noise(t + 0.05 + i * 0.07, 0.04, { from: vary(1800, 0.3), type: 'bandpass', q: 2, vol: 0.12 });
  },
  /** Amoebox swelling up */
  swell() {
    const c = ready();
    if (!c || recorded('swell', 1)) return;
    const t = c.currentTime;
    tone(120, t, 0.9, { type: 'sine', vol: 0.3, slideTo: 60 });
    for (let i = 0; i < 4; i++) tone(vary(300, 0.3), t + i * 0.18, 0.15, { type: 'sine', vol: 0.12, slideTo: 700 });
  },
  thunder() {
    const c = ready();
    if (!c || recorded('thunder', 1)) return;
    const t = c.currentTime;
    noise(t, 0.1, { from: 5000, type: 'highpass', vol: 0.3 });
    noise(t + 0.05, 2.2, { from: 600, to: 60, vol: 0.6, attack: 0.08, send: 0.5 });
  },
  /** The wind turns round */
  wind() {
    const c = ready();
    if (!c) return;
    noise(c.currentTime, 1.2, { from: 300, to: 1400, type: 'bandpass', q: 1.5, vol: 0.4, attack: 0.5, send: 0.3 });
  },

  // ---- Questions & rewards ---------------------------------------------------------------------
  quiz() {
    const c = ready();
    if (!c || recorded('quiz', 0.7)) return;
    const t = c.currentTime;
    // Page flip + a curious two-note chime
    noise(t, 0.12, { from: 2500, to: 6000, type: 'bandpass', q: 1, vol: 0.08 });
    bell(NOTE(79), t + 0.08, 0.6, { vol: 0.09, send: 0.35 });
    bell(NOTE(84), t + 0.2, 0.8, { vol: 0.09, send: 0.35 });
  },
  correct() {
    const c = ready();
    if (!c || recorded('correct', 0.8)) return;
    const t = c.currentTime;
    [72, 76, 79, 84].forEach((n, i) => bell(NOTE(n), t + i * 0.07, 0.7, { vol: 0.12, ratio: 2, index: 1.2, send: 0.35 }));
  },
  wrong() {
    const c = ready();
    if (!c || recorded('wrong', 0.7)) return;
    const t = c.currentTime;
    tone(NOTE(58), t, 0.25, { type: 'square', vol: 0.07, cutoff: 1200 });
    tone(NOTE(54), t + 0.22, 0.45, { type: 'square', vol: 0.07, cutoff: 900, slideTo: NOTE(52) });
  },
  crate() {
    const c = ready();
    if (!c || recorded('crate', 0.8)) return;
    const t = c.currentTime;
    // Wood cracking open
    for (let i = 0; i < 3; i++) noise(t + i * 0.05, 0.06, { from: vary(900, 0.2), type: 'bandpass', q: 3, vol: 0.25 });
    tone(140, t, 0.15, { type: 'triangle', vol: 0.2, slideTo: 90 });
  },
  item() {
    const c = ready();
    if (!c || recorded('item', 0.8)) return;
    const t = c.currentTime;
    [79, 83, 86, 91].forEach((n, i) => bell(NOTE(n), t + i * 0.05, 0.6, { vol: 0.08, ratio: 3, send: 0.4 }));
  },
  coin() {
    const c = ready();
    if (!c || recorded('coin', 0.7)) return;
    const t = c.currentTime;
    bell(NOTE(88), t, 0.25, { vol: 0.1, ratio: 4, index: 1.5 });
    bell(NOTE(93), t + 0.07, 0.5, { vol: 0.1, ratio: 4, index: 1.5, send: 0.3 });
  },

  // ---- End of a match (the music stops for these) ------------------------------------------
  win() {
    const c = ready();
    if (!c || recorded('win', 0.9)) return;
    const t = c.currentTime;
    const melody: [number, number, number][] = [
      [67, 0, 0.15], [72, 0.15, 0.15], [76, 0.3, 0.15], [79, 0.45, 0.3], [76, 0.8, 0.15], [79, 0.95, 0.9],
    ];
    for (const [n, at, d] of melody) {
      tone(NOTE(n), t + at, d + 0.15, { type: 'sawtooth', vol: 0.07, cutoff: 2400, send: 0.3 });
      tone(NOTE(n), t + at, d + 0.15, { type: 'square', vol: 0.04, cutoff: 1800, detune: 8, send: 0.3 });
    }
    // Big chord under the last note
    [55, 60, 64].forEach((n) => tone(NOTE(n), t + 0.95, 1.2, { type: 'sawtooth', vol: 0.05, cutoff: 1500, attack: 0.03, send: 0.4 }));
    [0, 0.3, 0.45, 0.95].forEach((at) => noise(t + at, 0.3, { from: 8000, type: 'highpass', vol: 0.05 }));
  },
  lose() {
    const c = ready();
    if (!c || recorded('lose', 0.9)) return;
    const t = c.currentTime;
    [67, 66, 65, 64].forEach((n, i) => tone(NOTE(n), t + i * 0.32, i === 3 ? 1.2 : 0.35, { type: 'triangle', vol: 0.14, cutoff: 1400, send: 0.3 }));
    tone(NOTE(40), t + 0.96, 1.4, { type: 'sine', vol: 0.15, send: 0.3 });
  },
  levelUp() {
    const c = ready();
    if (!c || recorded('levelup', 0.9)) return;
    const t = c.currentTime;
    [72, 76, 79, 84, 88, 91].forEach((n, i) => bell(NOTE(n), t + i * 0.06, 0.6, { vol: 0.09, send: 0.35 }));
    noise(t, 0.6, { from: 2000, to: 9000, type: 'highpass', vol: 0.04, attack: 0.2, send: 0.4 });
  },
};

/** Where on screen a sound comes from: -1 (left edge) … 1 (right edge), kept gentle */
export function panFor(screenX: number, screenWidth: number): number {
  return Math.max(-1, Math.min(1, (screenX / screenWidth) * 2 - 1)) * 0.6;
}


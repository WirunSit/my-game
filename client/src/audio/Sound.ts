// All sound is made in code with WebAudio (no audio files): short effects and
// two little looping tunes. Browsers only allow sound after the first tap or
// key press, so the context starts on that. One mute switch for everything,
// remembered on this device (a classroom of 30 computers can get loud!).

const MUTE_KEY = 'sciboom.mute';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let muted = readMuted();
const listeners = new Set<(muted: boolean) => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.7;
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.22;
  musicBus.connect(master);
  return ctx;
}

// The first tap/key press unlocks sound (browser rule)
if (typeof window !== 'undefined') {
  const unlock = () => {
    const c = audio();
    if (c?.state === 'suspended') void c.resume();
    if (c?.state !== 'suspended') {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    }
    if (pendingTrack) startMusic(pendingTrack);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(on: boolean) {
  muted = on;
  try {
    localStorage.setItem(MUTE_KEY, on ? '1' : '0');
  } catch {
    // ignore
  }
  if (master && ctx) master.gain.setTargetAtTime(on ? 0 : 0.7, ctx.currentTime, 0.05);
  listeners.forEach((l) => l(on));
}

export function onMuteChange(fn: (muted: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- Building blocks ----------------------------------------------------------------

function ready(): AudioContext | null {
  const c = audio();
  return c && c.state === 'running' && !muted ? c : null;
}

/** One note with a quick attack and a decay */
function tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; vol?: number; slideTo?: number; out?: AudioNode } = {}) {
  const c = ctx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'triangle';
  osc.frequency.setValueAtTime(freq, start);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, start + dur);
  const vol = opts.vol ?? 0.25;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(opts.out ?? master!);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

let noiseBuffer: AudioBuffer | null = null;

/** A burst of filtered noise (explosions, whooshes) */
function noise(start: number, dur: number, opts: { from: number; to: number; vol?: number; type?: BiquadFilterType }) {
  const c = ctx!;
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'lowpass';
  f.frequency.setValueAtTime(opts.from, start);
  f.frequency.exponentialRampToValueAtTime(opts.to, start + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(opts.vol ?? 0.5, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(start);
  src.stop(start + dur + 0.05);
}

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

// ---- Effects --------------------------------------------------------------------------

export const sfx = {
  click() {
    const c = ready();
    if (c) tone(880, c.currentTime, 0.06, { type: 'square', vol: 0.08 });
  },
  fire() {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone(180, t, 0.18, { type: 'sine', vol: 0.4, slideTo: 60 });
    noise(t, 0.25, { from: 4000, to: 400, vol: 0.25, type: 'bandpass' });
  },
  /** Bigger blasts sound deeper and longer */
  explode(radius = 50) {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const size = Math.min(1.6, radius / 50);
    noise(t, 0.45 * size, { from: 1800, to: 80, vol: 0.55 });
    tone(110 / size, t, 0.4 * size, { type: 'sine', vol: 0.5, slideTo: 35 });
  },
  hit() {
    const c = ready();
    if (c) tone(520, c.currentTime, 0.14, { type: 'square', vol: 0.12, slideTo: 200 });
  },
  correct() {
    const c = ready();
    if (!c) return;
    [72, 76, 79, 84].forEach((n, i) => tone(NOTE(n), c.currentTime + i * 0.08, 0.25, { vol: 0.22 }));
  },
  wrong() {
    const c = ready();
    if (!c) return;
    tone(NOTE(58), c.currentTime, 0.22, { type: 'square', vol: 0.12 });
    tone(NOTE(53), c.currentTime + 0.2, 0.35, { type: 'square', vol: 0.12 });
  },
  skill() {
    const c = ready();
    if (c) tone(600, c.currentTime, 0.3, { type: 'sine', vol: 0.18, slideTo: 1800 });
  },
  heal() {
    const c = ready();
    if (!c) return;
    [76, 79, 83, 88].forEach((n, i) => tone(NOTE(n), c.currentTime + i * 0.06, 0.3, { type: 'sine', vol: 0.15 }));
  },
  turn() {
    const c = ready();
    if (c) tone(NOTE(81), c.currentTime, 0.4, { type: 'sine', vol: 0.15 });
  },
  /** Boss charging its ultimate */
  charge() {
    const c = ready();
    if (c) tone(120, c.currentTime, 1.3, { type: 'sawtooth', vol: 0.08, slideTo: 700 });
  },
  win() {
    const c = ready();
    if (!c) return;
    const melody = [67, 72, 76, 79, 76, 79, 84];
    melody.forEach((n, i) => tone(NOTE(n), c.currentTime + i * 0.12, i === melody.length - 1 ? 0.6 : 0.2, { vol: 0.22 }));
  },
  lose() {
    const c = ready();
    if (!c) return;
    [67, 65, 62, 58].forEach((n, i) => tone(NOTE(n), c.currentTime + i * 0.2, 0.35, { vol: 0.18 }));
  },
  levelUp() {
    const c = ready();
    if (!c) return;
    [72, 76, 79, 84, 88, 91].forEach((n, i) => tone(NOTE(n), c.currentTime + i * 0.06, 0.25, { type: 'square', vol: 0.08 }));
  },
};

// ---- Music ----------------------------------------------------------------------------------
// A tiny step sequencer: bass + melody on a C major pentatonic, looped.

type Track = 'menu' | 'battle';
interface Pattern {
  bpm: number;
  bass: (number | null)[];
  lead: (number | null)[];
}

const PATTERNS: Record<Track, Pattern> = {
  menu: {
    bpm: 104,
    bass: [48, null, 55, null, 57, null, 55, null, 53, null, 60, null, 55, null, 52, null],
    lead: [72, 74, 76, null, 79, null, 76, 74, 72, null, 69, 72, 74, null, null, null],
  },
  battle: {
    bpm: 132,
    bass: [45, 45, 52, 45, 48, 48, 55, 48, 43, 43, 50, 43, 47, 47, 52, 47],
    lead: [69, null, 72, 74, null, 76, 74, null, 72, null, 69, 67, 69, null, null, null],
  },
};

let current: Track | null = null;
let pendingTrack: Track | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/** Start a looping tune (no-op if it's already playing). Waits for the first tap if sound isn't unlocked yet. */
export function startMusic(track: Track) {
  pendingTrack = track;
  const c = audio();
  if (!c || c.state !== 'running') return;
  if (current === track && timer) return;
  stopMusic();
  pendingTrack = track;
  current = track;
  const p = PATTERNS[track];
  const step = 60 / p.bpm / 2;
  let next = c.currentTime + 0.1;
  let i = 0;
  // Schedule a little ahead of time so the beat stays steady
  timer = setInterval(() => {
    while (next < c.currentTime + 0.3) {
      const b = p.bass[i % p.bass.length];
      const l = p.lead[i % p.lead.length];
      if (b !== null) tone(NOTE(b), next, step * 1.6, { type: 'triangle', vol: 0.35, out: musicBus! });
      if (l !== null) tone(NOTE(l), next, step * 1.2, { type: 'square', vol: 0.08, out: musicBus! });
      next += step;
      i++;
    }
  }, 60);
}

export function stopMusic() {
  if (timer) clearInterval(timer);
  timer = null;
  current = null;
}

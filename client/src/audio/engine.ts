// Audio plumbing shared by effects, music and ambience: one AudioContext, three
// buses (music, effects, ambience) through a gentle compressor, a room reverb made
// in code, the mute switch, and recorded sounds. Every sound is made in code, but
// a recorded file dropped into client/public/assets/audio/ (listed in its
// manifest.json, see docs/AUDIO.md) replaces the made-in-code one of the same name.

const MUTE_KEY = 'sciboom.mute';
const LEVEL = { master: 0.8, music: 0.24, sfx: 0.9, ambience: 0.8 };

export let ctx: AudioContext | null = null;
export const bus = {} as {
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  ambience: GainNode;
  /** Send into the room reverb */
  reverb: GainNode;
};

let muted = readMuted();
const listeners = new Set<(muted: boolean) => void>();
const unlockListeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const c = new AC();
  ctx = c;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(c.destination);
  bus.master = c.createGain();
  bus.master.gain.value = muted ? 0 : LEVEL.master;
  bus.master.connect(comp);
  for (const k of ['music', 'sfx', 'ambience'] as const) {
    bus[k] = c.createGain();
    bus[k].gain.value = LEVEL[k];
    bus[k].connect(bus.master);
  }
  // Room reverb: decaying stereo noise as the impulse response
  const verb = c.createConvolver();
  verb.buffer = impulse(c, 1.8, 2.6);
  bus.reverb = c.createGain();
  bus.reverb.gain.value = 1;
  bus.reverb.connect(verb).connect(bus.master);
  return c;
}

function impulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay * 0.5;
  }
  return buf;
}

// The first tap/key press unlocks sound (browser rule)
if (typeof window !== 'undefined') {
  const unlock = () => {
    const c = audio();
    if (c?.state === 'suspended') void c.resume();
    if (c?.state !== 'suspended') {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      void loadSamples();
    }
    unlockListeners.forEach((fn) => fn());
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** Called after every tap/key press until sound is unlocked (music waiting to start uses it) */
export function onUnlock(fn: () => void) {
  unlockListeners.add(fn);
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
  if (ctx) bus.master.gain.setTargetAtTime(on ? 0 : LEVEL.master, ctx.currentTime, 0.05);
  listeners.forEach((l) => l(on));
}

export function onMuteChange(fn: (muted: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The context, if sound can play right now */
export function ready(): AudioContext | null {
  const c = audio();
  return c && c.state === 'running' && !muted ? c : null;
}

// ---- Building blocks ----------------------------------------------------------------

export interface Out {
  /** Bus to play on (default: effects) */
  out?: AudioNode;
  /** How much goes into the room reverb (0–1) */
  send?: number;
  /** -1 left … 1 right */
  pan?: number;
}

function route(node: AudioNode, o: Out) {
  const c = ctx!;
  let last = node;
  if (o.pan) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    last.connect(p);
    last = p;
  }
  last.connect(o.out ?? bus.sfx);
  if (o.send) {
    const g = c.createGain();
    g.gain.value = o.send;
    last.connect(g).connect(bus.reverb);
  }
}

/** Gain envelope: quick attack to `peak`, then an exponential fade over `dur` */
function envelope(g: GainNode, t: number, peak: number, attack: number, dur: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
}

export interface ToneOpts extends Out {
  type?: OscillatorType;
  vol?: number;
  attack?: number;
  /** Glide to this frequency over the note */
  slideTo?: number;
  /** Lowpass the note (softer, rounder) */
  cutoff?: number;
  /** Slight detune in cents (for chorus with a second voice) */
  detune?: number;
}

/** One note with a quick attack and a fade */
export function tone(freq: number, t: number, dur: number, o: ToneOpts = {}) {
  const c = ctx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  if (o.detune) osc.detune.value = o.detune;
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
  envelope(g, t, o.vol ?? 0.25, o.attack ?? 0.008, dur);
  let src: AudioNode = osc;
  if (o.cutoff) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.cutoff;
    osc.connect(f);
    src = f;
  }
  src.connect(g);
  route(g, o);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** FM bell / mallet: bright at the start, mellow as it fades */
export function bell(freq: number, t: number, dur: number, o: Out & { vol?: number; ratio?: number; index?: number } = {}) {
  const c = ctx!;
  const car = c.createOscillator();
  const mod = c.createOscillator();
  const modGain = c.createGain();
  const g = c.createGain();
  car.frequency.value = freq;
  mod.frequency.value = freq * (o.ratio ?? 3.5);
  modGain.gain.setValueAtTime(freq * (o.index ?? 2.2), t);
  modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur * 0.6);
  mod.connect(modGain).connect(car.frequency);
  envelope(g, t, o.vol ?? 0.2, 0.004, dur);
  car.connect(g);
  route(g, o);
  for (const x of [car, mod]) {
    x.start(t);
    x.stop(t + dur + 0.05);
  }
}

let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const c = ctx!;
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

export interface NoiseOpts extends Out {
  vol?: number;
  attack?: number;
  type?: BiquadFilterType;
  /** Filter frequency at the start and at the end */
  from: number;
  to?: number;
  q?: number;
}

/** A burst of filtered noise (blasts, whooshes, crackles, footsteps) */
export function noise(t: number, dur: number, o: NoiseOpts) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer();
  // Start somewhere random so repeated bursts don't sound identical
  const offset = Math.random() * 1.5;
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'lowpass';
  f.Q.value = o.q ?? 0.8;
  f.frequency.setValueAtTime(o.from, t);
  if (o.to && o.to !== o.from) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const g = c.createGain();
  envelope(g, t, o.vol ?? 0.4, o.attack ?? 0.003, dur);
  src.connect(f).connect(g);
  route(g, o);
  src.start(t, offset);
  src.stop(t + dur + 0.05);
}

// ---- Drums (for the music) ------------------------------------------------------------

export function kick(t: number, vol: number, out: AudioNode) {
  tone(150, t, 0.32, { type: 'sine', vol, slideTo: 42, attack: 0.002, out });
  noise(t, 0.02, { from: 3000, type: 'lowpass', vol: vol * 0.3, out });
}

export function snare(t: number, vol: number, out: AudioNode) {
  noise(t, 0.16, { from: 1900, type: 'bandpass', q: 0.7, vol, out, send: 0.15 });
  tone(190, t, 0.09, { type: 'triangle', vol: vol * 0.6, slideTo: 150, out });
}

export function hat(t: number, vol: number, out: AudioNode, open = false) {
  noise(t, open ? 0.18 : 0.04, { from: 8000, type: 'highpass', vol, out });
}

// ---- Held sounds (follow the game while they play) -------------------------------------

export interface Held {
  /** 0–1: how strong / high the sound is right now */
  set(x: number): void;
  stop(): void;
}

const silent: Held = { set() {}, stop() {} };

/** A noise-based sound that keeps going until stopped (wind of a flying shell…) */
export function heldNoise(o: Out & { type?: BiquadFilterType; low: number; high: number; vol: number; q?: number }): Held {
  const c = ready();
  if (!c) return silent;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.Q.value = o.q ?? 1.2;
  f.frequency.value = o.low;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(o.vol * 0.4, c.currentTime + 0.08);
  src.connect(f).connect(g);
  route(g, o);
  src.start();
  let stopped = false;
  return {
    set(x) {
      if (stopped) return;
      const k = Math.max(0, Math.min(1, x));
      f.frequency.setTargetAtTime(o.low + (o.high - o.low) * k, c.currentTime, 0.05);
      g.gain.setTargetAtTime(o.vol * (0.25 + 0.75 * k), c.currentTime, 0.05);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      g.gain.setTargetAtTime(0.0001, c.currentTime, 0.06);
      src.stop(c.currentTime + 0.4);
    },
  };
}

/** A pitched sound that keeps going until stopped (charging power…) */
export function heldTone(o: Out & { type?: OscillatorType; low: number; high: number; vol: number; cutoff?: number }): Held {
  const c = ready();
  if (!c) return silent;
  const osc = c.createOscillator();
  const osc2 = c.createOscillator();
  osc.type = osc2.type = o.type ?? 'sawtooth';
  osc.frequency.value = o.low;
  osc2.frequency.value = o.low;
  osc2.detune.value = 9;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = o.cutoff ?? 1800;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(o.vol, c.currentTime + 0.05);
  osc.connect(f);
  osc2.connect(f);
  f.connect(g);
  route(g, o);
  osc.start();
  osc2.start();
  let stopped = false;
  return {
    set(x) {
      if (stopped) return;
      const fr = o.low * (o.high / o.low) ** Math.max(0, Math.min(1, x));
      osc.frequency.setTargetAtTime(fr, c.currentTime, 0.03);
      osc2.frequency.setTargetAtTime(fr, c.currentTime, 0.03);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      g.gain.setTargetAtTime(0.0001, c.currentTime, 0.04);
      osc.stop(c.currentTime + 0.3);
      osc2.stop(c.currentTime + 0.3);
    },
  };
}

// ---- Recorded sounds (optional) ---------------------------------------------------------

const samples = new Map<string, AudioBuffer>();
let samplesLoading: Promise<void> | null = null;

/** Read assets/audio/manifest.json and decode every file it lists (once, after unlock) */
function loadSamples(): Promise<void> {
  samplesLoading ??= (async () => {
    const c = ctx;
    if (!c) return;
    try {
      const res = await fetch('assets/audio/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const m = (await res.json()) as { files?: Record<string, string> };
      await Promise.all(
        Object.entries(m.files ?? {}).map(async ([name, file]) => {
          try {
            const data = await (await fetch(`assets/audio/${file}`)).arrayBuffer();
            samples.set(name, await c.decodeAudioData(data));
          } catch {
            // A broken file just keeps the made-in-code sound
          }
        }),
      );
      sampleListeners.forEach((fn) => fn());
    } catch {
      // No manifest: made-in-code sounds only
    }
  })();
  return samplesLoading;
}

const sampleListeners = new Set<() => void>();
/** Called once recorded sounds have loaded (music swaps to a recorded track then) */
export function onSamplesLoaded(fn: () => void) {
  sampleListeners.add(fn);
}

export function hasSample(name: string): boolean {
  return samples.has(name);
}

/** Play a recorded sound if there is one; returns its source (for looping music), or null */
export function playSample(name: string, o: Out & { vol?: number; rate?: number; loop?: boolean; at?: number } = {}): AudioBufferSourceNode | null {
  const c = ctx;
  const buf = samples.get(name);
  if (!c || !buf) return null;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = !!o.loop;
  src.playbackRate.value = o.rate ?? 1;
  const g = c.createGain();
  g.gain.value = o.vol ?? 1;
  src.connect(g);
  route(g, o);
  src.start(o.at ?? c.currentTime);
  return src;
}

export const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

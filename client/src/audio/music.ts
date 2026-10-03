// Background music and ambience, made in code.
// Music: a small band (drums, bass, chord pad, arpeggio, lead) plays songs
// written below as chords + melody, one song per kind of screen, cross-fading
// when the screen changes. Ambience: the sound of each world under the music
// (bubbling lab, forest birds, lava rumble, rain and thunder…).
// A recorded file named music_<track> or amb_<kind> (see docs/AUDIO.md) is
// looped instead when there is one.
import { NOTE, audio, bell, bus, hasSample, hat, heldNoise, kick, noise, onSamplesLoaded, onUnlock, playSample, snare, tone, type Held } from './engine';

export type Track = 'menu' | 'map' | 'battle' | 'boss' | 'pvp';
export type Ambience = 'lab' | 'cell' | 'forest' | 'lava' | 'storm' | 'arena';

type Lead = 'bell' | 'pluck' | 'saw' | 'square';

interface Section {
  /** One chord per bar, e.g. 'Am', 'F', 'C#m', 'Bb' */
  chords: string[];
  /** Per bar: 8 eighth-notes, e.g. 'E5 - G5 - C6 - B5 A5' ('-' holds the note, '.' is a rest) */
  melody: string[];
}

interface Song {
  bpm: number;
  sections: Section[];
  /** Section indices in playing order (then it loops) */
  order: number[];
  lead: Lead;
  /** 16 steps per bar: x = hit (hats: o = open) */
  kick: string;
  snare: string;
  hats: string;
  /** 16 steps per bar: R root, 5 fifth, 8 octave, . rest */
  bass: string;
  pad: boolean;
  arp: boolean;
  /** Lead volume */
  leadVol: number;
}

const SONGS: Record<Track, Song> = {
  // Cheerful, C major
  menu: {
    bpm: 100,
    lead: 'bell',
    leadVol: 0.11,
    kick: 'x.......x.......',
    snare: '....x.......x...',
    hats: '..x...x...x...x.',
    bass: 'R.....5.R.....5.',
    pad: true,
    arp: false,
    sections: [
      {
        chords: ['C', 'G', 'Am', 'F'],
        melody: ['E5 - G5 - C6 - B5 A5', 'G5 - - - D5 - G5 -', 'A5 - C6 - E6 - D6 C6', 'C6 - A5 - G5 - - -'],
      },
      {
        chords: ['F', 'G', 'C', 'C'],
        melody: ['A5 - A5 G5 F5 - A5 -', 'B5 - B5 A5 G5 - D6 -', 'E6 - D6 C6 G5 - E5 -', 'C5 - - - . . . .'],
      },
    ],
    order: [0, 0, 1, 0, 1],
  },
  // Off on an adventure, G major
  map: {
    bpm: 112,
    lead: 'pluck',
    leadVol: 0.12,
    kick: 'x.......x.......',
    snare: '............x...',
    hats: 'x.x.x.x.x.x.x.x.',
    bass: 'R...R...5...R...',
    pad: true,
    arp: true,
    sections: [
      {
        chords: ['G', 'D', 'Em', 'C'],
        melody: ['B4 - D5 - G5 - F#5 -', 'A5 - - - F#5 - D5 -', 'E5 - G5 - B5 - A5 G5', 'E5 - - - . . . .'],
      },
      {
        chords: ['C', 'D', 'G', 'G'],
        melody: ['E5 - E5 F#5 G5 - E5 -', 'F#5 - F#5 G5 A5 - D5 -', 'B5 - A5 G5 D5 - B4 -', 'G4 - - - . . . .'],
      },
    ],
    order: [0, 1],
  },
  // Stage fight, A minor, driving
  battle: {
    bpm: 128,
    lead: 'saw',
    leadVol: 0.07,
    kick: 'x.....x...x.....',
    snare: '....x.......x...',
    hats: 'x.x.x.x.x.x.x.xo',
    bass: 'R.R.R.R.R.R.5.8.',
    pad: true,
    arp: false,
    sections: [
      {
        chords: ['Am', 'F', 'C', 'G'],
        melody: ['A4 - C5 - E5 - D5 C5', 'C5 - - - A4 - F5 -', 'E5 - G5 - C5 - E5 -', 'D5 - B4 - G4 - B4 -'],
      },
      {
        chords: ['F', 'G', 'E', 'Am'],
        melody: ['F5 - E5 - D5 - C5 -', 'D5 - E5 - G5 - - -', 'E5 - D5 C5 B4 - G#4 -', 'A4 - - - . . . .'],
      },
    ],
    order: [0, 0, 1, 0, 1, 1],
  },
  // Boss fight, D minor, heavier and faster
  boss: {
    bpm: 140,
    lead: 'saw',
    leadVol: 0.08,
    kick: 'x.x...x.x.x...x.',
    snare: '....x.......x..x',
    hats: 'xxxxxxxxxxxxxxxx',
    bass: 'RRR.RRR.RRR.5.8.',
    pad: true,
    arp: true,
    sections: [
      {
        chords: ['Dm', 'Bb', 'Gm', 'A'],
        melody: ['D5 - - F5 E5 - D5 -', 'F5 - - G5 F5 - D5 -', 'G5 - - A5 Bb5 - A5 G5', 'A5 - - - E5 - C#5 -'],
      },
      {
        chords: ['Dm', 'C', 'Bb', 'A'],
        melody: ['A5 - A5 - G5 - F5 -', 'G5 - E5 - C5 - E5 -', 'F5 - D5 - Bb4 - D5 -', 'C#5 - E5 - A5 - - -'],
      },
    ],
    order: [0, 1, 0, 1, 1],
  },
  // Playing against a friend, E minor
  pvp: {
    bpm: 134,
    lead: 'square',
    leadVol: 0.06,
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hats: '..x...x...x...xo',
    bass: 'R.R.8.R.R.R.5.R.',
    pad: true,
    arp: true,
    sections: [
      {
        chords: ['Em', 'C', 'G', 'D'],
        melody: ['E5 - G5 - B5 - A5 G5', 'G5 - E5 - C5 - E5 -', 'D5 - G5 - B5 - D6 -', 'C6 - B5 - A5 - F#5 -'],
      },
      {
        chords: ['C', 'D', 'Em', 'Em'],
        melody: ['E5 - E5 - G5 - A5 -', 'F#5 - A5 - D6 - - -', 'B5 - A5 G5 F#5 - D5 -', 'E5 - - - . . . .'],
      },
    ],
    order: [0, 0, 1, 1],
  },
};

// ---- Reading the notation ------------------------------------------------------------------

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'F#5' -> MIDI number */
function midi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (Number(m[3]) + 1) + PITCH[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** 'C#m' -> root (MIDI, octave 3) and the three chord notes */
function chord(name: string): { root: number; notes: number[] } {
  const m = /^([A-G])([#b]?)(m?)$/.exec(name);
  if (!m) throw new Error(`bad chord ${name}`);
  const root = 48 + PITCH[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return { root, notes: [root, root + (m[3] ? 3 : 4), root + 7] };
}

/** A song as a list of bars, ready to play */
function compile(song: Song) {
  return song.order.flatMap((i) =>
    song.sections[i].chords.map((ch, bar) => ({
      chord: chord(ch),
      // Eighth notes -> [step (16ths), MIDI, length in steps]
      notes: parseMelody(song.sections[i].melody[bar]),
    })),
  );
}

function parseMelody(line: string): [number, number, number][] {
  const tokens = line.trim().split(/\s+/);
  const out: [number, number, number][] = [];
  let held: [number, number, number] | null = null;
  tokens.forEach((tok, i) => {
    if (tok === '-') {
      if (held) held[2] += 2;
    } else if (tok === '.') {
      held = null;
    } else {
      held = [i * 2, midi(tok), 2];
      out.push(held);
    }
  });
  return out;
}

// ---- Instruments ------------------------------------------------------------------------------

function playLead(kind: Lead, n: number, t: number, dur: number, vol: number, out: AudioNode) {
  const f = NOTE(n);
  switch (kind) {
    case 'bell':
      bell(f, t, Math.max(0.5, dur * 1.5), { vol, ratio: 2, index: 1.4, out, send: 0.3 });
      break;
    case 'pluck':
      tone(f, t, Math.max(0.3, dur), { type: 'triangle', vol: vol * 1.3, out, send: 0.25 });
      tone(f * 2, t, 0.12, { type: 'sine', vol: vol * 0.4, out });
      break;
    case 'saw':
      tone(f, t, dur * 0.95, { type: 'sawtooth', vol, cutoff: 2600, attack: 0.01, out, send: 0.2 });
      tone(f, t, dur * 0.95, { type: 'sawtooth', vol, cutoff: 2600, attack: 0.01, detune: 12, out, send: 0.2 });
      break;
    case 'square':
      tone(f, t, dur * 0.9, { type: 'square', vol, cutoff: 3000, attack: 0.01, out, send: 0.2 });
      tone(f / 2, t, dur * 0.9, { type: 'triangle', vol: vol * 0.8, out });
      break;
  }
}

// ---- Player ---------------------------------------------------------------------------------------

interface Playing {
  track: Track;
  gain: GainNode;
  stop(): void;
}

let playing: Playing | null = null;
let wanted: Track | null = null;

/** Play a song for this screen (no-op if it's already on). Waits for the first tap if sound isn't unlocked yet. */
export function startMusic(track: Track) {
  wanted = track;
  const c = audio();
  if (!c || c.state !== 'running') return;
  if (playing?.track === track) return;
  fadeOut(playing);
  playing = hasSample(`music_${track}`) ? playRecorded(c, track) : playSong(c, track);
}

export function stopMusic() {
  wanted = null;
  fadeOut(playing);
  playing = null;
}

function fadeOut(p: Playing | null) {
  const c = audio();
  if (!p || !c) return;
  p.gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.35);
  setTimeout(() => p.stop(), 1600);
}

function newGain(c: AudioContext): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(1, c.currentTime + 1.2);
  g.connect(bus.music);
  return g;
}

function playRecorded(c: AudioContext, track: Track): Playing {
  const gain = newGain(c);
  const src = playSample(`music_${track}`, { out: gain, loop: true });
  return { track, gain, stop: () => src?.stop() };
}

function playSong(c: AudioContext, track: Track): Playing {
  const song = SONGS[track];
  const bars = compile(song);
  const gain = newGain(c);
  const step = 60 / song.bpm / 4;
  let next = c.currentTime + 0.1;
  let i = 0;
  // Schedule a little ahead of time so the beat stays steady
  const timer = setInterval(() => {
    while (next < c.currentTime + 0.25) {
      playStep(song, bars, i, next, step, gain);
      next += step;
      i++;
    }
  }, 50);
  return { track, gain, stop: () => clearInterval(timer) };
}

function playStep(song: Song, bars: ReturnType<typeof compile>, i: number, t: number, step: number, out: GainNode) {
  const s = i % 16;
  const bar = bars[Math.floor(i / 16) % bars.length];
  const { root, notes } = bar.chord;
  // Drums
  if (song.kick[s] === 'x') kick(t, 0.5, out);
  if (song.snare[s] === 'x') snare(t, 0.3, out);
  if (song.hats[s] !== '.') hat(t, s % 4 === 0 ? 0.07 : 0.045, out, song.hats[s] === 'o');
  // Bass
  const b = song.bass[s];
  if (b !== '.') {
    const n = root - 12 + (b === '5' ? 7 : b === '8' ? 12 : 0);
    tone(NOTE(n), t, step * 1.8, { type: 'sawtooth', vol: 0.16, cutoff: 420, attack: 0.005, out });
    tone(NOTE(n), t, step * 1.8, { type: 'sine', vol: 0.18, out });
  }
  // Chord pad: a soft, wide chord held through the bar
  if (song.pad && s === 0) {
    const len = step * 16;
    for (const n of notes) {
      tone(NOTE(n + 12), t, len, { type: 'sawtooth', vol: 0.028, cutoff: 1100, attack: 0.25, out, send: 0.4 });
      tone(NOTE(n + 12), t, len, { type: 'sawtooth', vol: 0.028, cutoff: 1100, attack: 0.25, detune: 14, out, send: 0.4 });
    }
  }
  // Arpeggio: chord notes going up, every 16th
  if (song.arp && s % 2 === 0) {
    const n = notes[(s / 2) % 3] + 24 + (s >= 8 ? 12 : 0);
    tone(NOTE(n), t, step * 1.5, { type: 'triangle', vol: 0.035, out, send: 0.25 });
  }
  // Melody
  for (const [at, n, len] of bar.notes) if (at === s) playLead(song.lead, n, t, len * step, song.leadVol, out);
}

// ---- Ambience -----------------------------------------------------------------------------------

let ambience: { kind: Ambience; stop(): void } | null = null;
let wantedAmbience: Ambience | null = null;

/** The sound of the place, under the music (stops with stopAmbience or when another one starts) */
export function startAmbience(kind: Ambience) {
  wantedAmbience = kind;
  const c = audio();
  if (!c || c.state !== 'running') return;
  if (ambience?.kind === kind) return;
  ambience?.stop();
  const rec = playSample(`amb_${kind}`, { out: bus.ambience, loop: true });
  ambience = rec ? { kind, stop: () => rec.stop() } : makeAmbience(c, kind);
}

export function stopAmbience() {
  wantedAmbience = null;
  ambience?.stop();
  ambience = null;
}

function makeAmbience(c: AudioContext, kind: Ambience): { kind: Ambience; stop(): void } {
  const out = bus.ambience;
  const beds: Held[] = [];
  const bed = (o: Parameters<typeof heldNoise>[0], level: number) => {
    const h = heldNoise({ ...o, out });
    h.set(level);
    beds.push(h);
  };
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  // Things that happen now and then: [chance per 0.25 s, sound]
  let events: [number, (t: number) => void][] = [];
  const bubble = (t: number, low: number, high: number, vol: number) => tone(rnd(low, high), t, 0.12, { type: 'sine', vol, slideTo: rnd(high, high * 2), out, pan: rnd(-0.8, 0.8) });

  switch (kind) {
    case 'lab':
      bed({ type: 'lowpass', low: 180, high: 220, vol: 0.12 }, 0.3);
      events = [
        [0.35, (t) => bubble(t, 300, 600, 0.09)],
        [0.04, (t) => bell(rnd(1800, 2600), t, 0.5, { vol: 0.02, ratio: 5.1, out, pan: rnd(-0.8, 0.8) })], // glass clink
      ];
      break;
    case 'cell':
      bed({ type: 'lowpass', low: 250, high: 450, vol: 0.18 }, 0.5);
      events = [
        [0.2, (t) => bubble(t, 200, 400, 0.06)],
        [0.05, (t) => tone(rnd(90, 140), t, 1.2, { type: 'sine', vol: 0.08, attack: 0.4, out })], // slow pulse
      ];
      break;
    case 'forest':
      bed({ type: 'bandpass', low: 400, high: 700, vol: 0.12, q: 0.6 }, 0.4);
      events = [
        [
          0.06,
          (t) => {
            const p = rnd(-0.9, 0.9);
            const base = rnd(2600, 4200);
            const n = 2 + Math.floor(Math.random() * 3);
            for (let k = 0; k < n; k++) tone(base, t + k * 0.11, 0.08, { type: 'sine', vol: 0.03, slideTo: base * 1.35, out, pan: p });
          },
        ],
        [0.03, (t) => noise(t, 1.5, { from: 500, to: 1100, type: 'bandpass', vol: 0.06, attack: 0.6, out })], // gust through leaves
      ];
      break;
    case 'lava':
      bed({ type: 'lowpass', low: 90, high: 140, vol: 0.3 }, 0.6);
      events = [
        [0.3, (t) => noise(t, 0.015, { from: rnd(2500, 5000), type: 'bandpass', q: 3, vol: 0.05, out, pan: rnd(-0.8, 0.8) })], // crackle
        [0.08, (t) => bubble(t, 70, 110, 0.12)], // lava bubble
      ];
      break;
    case 'storm':
      bed({ type: 'highpass', low: 3000, high: 3500, vol: 0.06 }, 0.6); // rain
      bed({ type: 'bandpass', low: 300, high: 900, vol: 0.14, q: 0.7 }, 0.5); // wind
      events = [
        [0.012, (t) => noise(t, 2.5, { from: 400, to: 50, vol: 0.25, attack: 0.15, out, send: 0.4 })], // distant thunder
        [0.04, (t) => noise(t, 1.8, { from: 300, to: 1300, type: 'bandpass', vol: 0.08, attack: 0.7, out })],
      ];
      break;
    case 'arena':
      bed({ type: 'bandpass', low: 350, high: 500, vol: 0.06, q: 0.5 }, 0.4);
      events = [[0.02, (t) => noise(t, 1.5, { from: 300, to: 900, type: 'bandpass', vol: 0.05, attack: 0.6, out })]];
      break;
  }
  const timer = setInterval(() => {
    const t = c.currentTime + 0.05;
    for (const [chance, play] of events) if (Math.random() < chance) play(t + Math.random() * 0.2);
  }, 250);
  return {
    kind,
    stop() {
      clearInterval(timer);
      beds.forEach((b) => b.stop());
    },
  };
}

// Music/ambience asked for before the first tap starts after it; recorded files take over once loaded
onUnlock(() => {
  if (wanted) startMusic(wanted);
  if (wantedAmbience) startAmbience(wantedAmbience);
});
onSamplesLoaded(() => {
  const t = wanted;
  const a = wantedAmbience;
  if (t && hasSample(`music_${t}`)) {
    fadeOut(playing);
    playing = null;
    startMusic(t);
  }
  if (a && hasSample(`amb_${a}`)) {
    ambience?.stop();
    ambience = null;
    startAmbience(a);
  }
});

// The game's sound: effects (sfx.ts), music and ambience (music.ts), on a shared
// engine (engine.ts). Everything is made in code; recorded files can replace any
// of it (docs/AUDIO.md). One mute switch for everything, remembered on this
// device (a classroom of 30 computers can get loud!).
export { isMuted, onMuteChange, setMuted } from './engine';
export type { Held } from './engine';
export { panFor, sfx } from './sfx';
export { startAmbience, startMusic, stopAmbience, stopMusic, type Ambience, type Track } from './music';

// Design resolution — the game is scaled to fit any screen (desktop or phone, landscape)
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const FONT_FAMILY = 'Kanit, sans-serif';

// Draw order (higher = in front)
export const DEPTH = {
  background: 0,
  terrain: 10,
  fighter: 20,
  projectile: 30,
  fx: 40,
  hud: 100,
  overlay: 200,
} as const;

export const TEXT_STROKE = '#1b1d3a';

import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { BattleScene } from './scenes/BattleScene';
import { CostumeSheetScene } from './scenes/CostumeSheetScene';
import { InventoryScene } from './scenes/InventoryScene';
import { LobbyScene } from './scenes/LobbyScene';
import { MenuScene } from './scenes/MenuScene';
import { OnlineBattleScene } from './scenes/OnlineBattleScene';
import { PreloadScene } from './scenes/PreloadScene';
import { StageScene } from './scenes/StageScene';
import { WardrobeScene } from './scenes/WardrobeScene';
import { WorldMapScene } from './scenes/WorldMapScene';

/**
 * WebGL is fastest on a real graphics card, but when the browser only has a
 * software fallback (common on old school PCs and VMs) the plain 2D canvas is
 * many times faster. ?canvas / ?webgl in the URL force one or the other.
 */
function pickRenderer(): number {
  const q = new URLSearchParams(location.search);
  if (q.has('canvas')) return Phaser.CANVAS;
  if (q.has('webgl')) return Phaser.WEBGL;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return Phaser.CANVAS;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return Phaser.CANVAS;
  } catch {
    return Phaser.CANVAS;
  }
  return Phaser.AUTO;
}

async function start() {
  // Wait for the Thai web font so Phaser text renders with it on first draw
  // Google Fonts serves Thai glyphs as a separate file per weight, so ask for Thai text explicitly
  try {
    await Promise.all([document.fonts.load('400 32px Kanit', 'กขค abc'), document.fonts.load('700 32px Kanit', 'กขค abc')]);
  } catch {
    // Font failed to load (offline?) — fall back to the default sans-serif
  }

  const game = new Phaser.Game({
    type: pickRenderer(),
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#1b1d3a',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { activePointers: 3 }, // multi-touch: move + aim + fire on phones
    dom: { createContainer: true }, // real text boxes (room codes, login)
    scene: [PreloadScene, MenuScene, WorldMapScene, StageScene, InventoryScene, WardrobeScene, BattleScene, LobbyScene, OnlineBattleScene, CostumeSheetScene],
  });
  // Let the automated playtest (tools/playtest.mjs) peek at the game while developing
  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
}

start();

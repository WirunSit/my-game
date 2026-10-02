import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { BootScene } from './scenes/BootScene';

async function start() {
  // Wait for the Thai web font so Phaser text renders with it on first draw
  try {
    await document.fonts.load('700 32px Kanit');
  } catch {
    // Font failed to load (offline?) — fall back to the default sans-serif
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#1b1d3a',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { activePointers: 3 }, // multi-touch: move + aim + fire on phones
    scene: [BootScene],
  });
}

start();

import * as Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';

interface ManifestEntry {
  key: string;
  path: string;
}

// Loads every sliced image listed in assets/manifest.json, with a progress bar
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    const barW = 500;
    const x = (GAME_WIDTH - barW) / 2;
    const y = GAME_HEIGHT / 2;
    this.add
      .text(GAME_WIDTH / 2, y - 60, 'กำลังโหลด...', { fontFamily: FONT_FAMILY, fontSize: '32px', color: '#ffffff', stroke: TEXT_STROKE, strokeThickness: 6 })
      .setOrigin(0.5);
    this.add.rectangle(x, y, barW, 24, 0x000000, 0.4).setOrigin(0, 0.5);
    const fill = this.add.rectangle(x, y, 0, 24, 0xffcc33).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => (fill.width = barW * p));

    this.load.json('manifest', 'assets/manifest.json');
    // Once the list arrives, queue every image in it (the loader keeps going)
    this.load.once('filecomplete-json-manifest', (_key: string, _type: string, list: ManifestEntry[]) => {
      for (const a of list) this.load.image(a.key, a.path);
    });
  }

  create() {
    this.anims.create({
      key: 'explosion',
      frames: [0, 1, 2, 3, 4, 5].map((i) => ({ key: `fx/explosion_${i}` })),
      frameRate: 16,
      hideOnComplete: true,
    });
    // ?costumes opens the developer page for checking where hats and glasses sit
    const sheet = import.meta.env.DEV && new URLSearchParams(location.search).has('costumes');
    this.scene.start(sheet ? 'CostumeSheet' : 'Menu');
  }
}

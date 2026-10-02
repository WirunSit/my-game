import * as Phaser from 'phaser';
import { COSMETIC_CATALOG, EMPTY_OUTFIT, type Character, type Outfit } from '@sciboom/shared';
import { FONT_FAMILY } from '../config';
import { Costume, type Pose } from '../game/Costume';

/**
 * Developer page (open the game with ?costumes&p=0..8): every body picture
 * wearing one set of items, to check that hats and glasses sit right.
 * tools/costumes.mjs screenshots every page into art/debug/costumes/.
 */
export class CostumeSheetScene extends Phaser.Scene {
  constructor() {
    super('CostumeSheet');
  }

  create() {
    this.cameras.main.setBackgroundColor('#d8dde8');
    const page = Number(new URLSearchParams(location.search).get('p') ?? 0);
    const ids = (slot: string) => COSMETIC_CATALOG.filter((c) => c.slot === slot).map((c) => c.id);
    const hats = ids('hat');
    const faces = ids('face');
    const backs = ids('back');
    const set: Outfit = { ...EMPTY_OUTFIT, hat: hats[page % hats.length], face: faces[page % faces.length], back: backs[page % backs.length] };
    this.add.text(10, 6, `p=${page}: ${set.hat} / ${set.face} / ${set.back}`, { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#1b1d3a' });

    const bodies: { character: Character; suit: string | null; pose: Pose }[] = [];
    for (const character of ['boy', 'girl'] as const) {
      for (const pose of ['side', 'hurt', 'win'] as const) bodies.push({ character, suit: null, pose });
      for (const suit of ids('suit')) bodies.push({ character, suit, pose: 'side' });
    }
    bodies.forEach((b, i) => {
      const x = 110 + (i % 6) * 210;
      const y = 340 + Math.floor(i / 6) * 340;
      const c = new Costume(this, b.character, { ...set, suit: b.suit }, 260);
      c.root.setPosition(x, y);
      c.setPose(b.pose);
    });
  }
}

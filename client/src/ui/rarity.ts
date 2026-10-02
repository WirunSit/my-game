import * as Phaser from 'phaser';

/** Frame colour per rarity (index = stars): grey, green, blue, purple, gold */
export const RARITY_COLORS = [0xffffff, 0xb0b4c0, 0x4cd964, 0x3a8dde, 0xb25cff, 0xffcc33];

/** Row of small star images, centred on x */
export function addStars(scene: Phaser.Scene, x: number, y: number, count: number, size = 22): Phaser.GameObjects.Image[] {
  const out: Phaser.GameObjects.Image[] = [];
  for (let i = 0; i < count; i++) {
    const st = scene.add.image(x + (i - (count - 1) / 2) * (size + 2), y, 'ui/star');
    st.setScale(size / st.height);
    out.push(st);
  }
  return out;
}

import * as Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT } from '../config';

/**
 * Placeholder sky + distant hills drawn in code (until the GPT background art
 * for this map arrives). With parallax=true the hills scroll slower than the ground.
 */
export function drawSkyBackground(scene: Phaser.Scene, width: number, parallax: boolean) {
  // Gradient drawn once into a texture (Graphics gradients don't work in the Canvas renderer)
  if (!scene.textures.exists('sky')) {
    const tex = scene.textures.createCanvas('sky', 4, GAME_HEIGHT)!;
    const ctx = tex.getContext();
    const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    grad.addColorStop(0, '#5bb8ff');
    grad.addColorStop(1, '#ffd9a8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, GAME_HEIGHT);
    tex.refresh();
  }
  // A little wider/taller than the screen so camera shake never shows the edge
  scene.add.image(-30, -30, 'sky').setOrigin(0).setDisplaySize(scene.scale.width + 60, GAME_HEIGHT + 60).setScrollFactor(0).setDepth(DEPTH.background);

  // Soft clouds
  const clouds = scene.add.graphics().setDepth(DEPTH.background).setScrollFactor(parallax ? 0.15 : 0);
  clouds.fillStyle(0xffffff, 0.75);
  for (let i = 0; i < 9; i++) {
    const cx = (i * 263) % width;
    const cy = 70 + ((i * 97) % 150);
    clouds.fillEllipse(cx, cy, 160, 46);
    clouds.fillEllipse(cx + 50, cy - 18, 110, 50);
    clouds.fillEllipse(cx - 45, cy - 8, 90, 36);
  }

  // Two layers of far hills
  const layers = [
    { color: 0x9fc9e8, base: 470, amp: 60, f: 0.004, factor: 0.25 },
    { color: 0x7fb37a, base: 530, amp: 45, f: 0.007, factor: 0.45 },
  ];
  for (const l of layers) {
    const g = scene.add.graphics().setDepth(DEPTH.background).setScrollFactor(parallax ? l.factor : 0);
    g.fillStyle(l.color, 1);
    g.beginPath();
    g.moveTo(0, GAME_HEIGHT);
    for (let x = 0; x <= width; x += 16) g.lineTo(x, l.base + Math.sin(x * l.f) * l.amp + Math.sin(x * l.f * 2.7) * l.amp * 0.3);
    g.lineTo(width, GAME_HEIGHT);
    g.closePath();
    g.fillPath();
  }
}

/**
 * GPT-made background art. It's wider than the screen and scrolls at `factor`
 * of the camera speed so it feels far away. Falls back to the drawn sky if missing.
 */
export function drawArtBackground(scene: Phaser.Scene, key: string, worldWidth: number, factor = 0.5) {
  if (!scene.textures.exists(key)) {
    drawSkyBackground(scene, worldWidth, true);
    return;
  }
  const img = scene.add.image(-30, -30, key).setOrigin(0).setScrollFactor(factor).setDepth(DEPTH.background);
  // Tall enough to hide camera shake; wide enough to cover the whole parallax range
  const needW = scene.scale.width + (worldWidth - scene.scale.width) * factor + 60;
  const scale = Math.max((GAME_HEIGHT + 60) / img.height, needW / img.width);
  img.setScale(scale);
}

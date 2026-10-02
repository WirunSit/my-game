import * as Phaser from 'phaser';
import { FONT_FAMILY, TEXT_STROKE } from '../config';

export interface TextButtonOptions {
  width?: number;
  height?: number;
  color?: number;
  fontSize?: number;
  disabled?: boolean;
}

/** Rounded, chunky button with a Thai label. Works with mouse and touch. */
export function addTextButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: TextButtonOptions = {},
): Phaser.GameObjects.Container {
  const w = opts.width ?? 360;
  const h = opts.height ?? 72;
  const color = opts.disabled ? 0x777788 : (opts.color ?? 0xff8a1f);

  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 4, -h / 2 + 6, w, h, 20);
  g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 20);
  g.fillStyle(0xffffff, 0.25).fillRoundedRect(-w / 2 + 8, -h / 2 + 6, w - 16, h / 2 - 6, 14);
  g.lineStyle(4, 0x1b1d3a, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 20);

  const text = scene.add
    .text(0, 0, label, {
      fontFamily: FONT_FAMILY,
      fontSize: `${opts.fontSize ?? 30}px`,
      fontStyle: '700',
      color: '#ffffff',
      stroke: TEXT_STROKE,
      strokeThickness: 5,
    })
    .setOrigin(0.5);

  const button = scene.add.container(x, y, [g, text]).setSize(w, h);
  if (!opts.disabled) {
    button.setInteractive({ useHandCursor: true });
    button.on('pointerdown', () => button.setScale(0.95));
    button.on('pointerout', () => button.setScale(1));
    button.on('pointerup', () => {
      button.setScale(1);
      onClick();
    });
  }
  return button;
}

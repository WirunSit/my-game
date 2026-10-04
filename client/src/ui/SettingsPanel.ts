import * as Phaser from 'phaser';
import { isMuted, setMuted, sfx } from '../audio/Sound';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import { aimMode, setAimMode, type AimMode } from '../settings';
import { addTextButton } from './TextButton';

const style = (size: number, color = '#ffffff'): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT_FAMILY,
  fontSize: `${size}px`,
  fontStyle: '700',
  color,
  stroke: TEXT_STROKE,
  strokeThickness: Math.max(3, size / 6),
  padding: { top: 6 },
});

const AIM_CHOICES: { mode: AimMode; title: string; lines: string[] }[] = [
  {
    mode: 'buttons',
    title: 'ปุ่มกด',
    lines: ['ปุ่มลูกศรขึ้น-ลง ปรับมุม', 'กดค้างปุ่มยิงเพื่อชาร์จแรง', 'แล้วปล่อยเพื่อยิง'],
  },
  {
    mode: 'drag',
    title: 'ลากยิง (หนังสติ๊ก)',
    lines: ['แตะค้างที่สนาม แล้วดึงถอยหลัง', 'ดึงไกล = แรงมาก, ปล่อยเพื่อยิง', 'ลากกลับมาที่เดิมเพื่อยกเลิก'],
  },
];

/** Gear button that opens the settings panel */
export function addSettingsButton(scene: Phaser.Scene, x: number, y: number, size = 40) {
  const icon = scene.add.image(x, y, 'ui/gear').setScrollFactor(0).setDepth(DEPTH.hud);
  icon.setScale(size / icon.height);
  icon.setInteractive({ useHandCursor: true }).on('pointerup', () => openSettings(scene));
  return icon;
}

/** Settings over whatever is on screen: how to aim, and sound on/off. Changes apply at once. */
export function openSettings(scene: Phaser.Scene) {
  sfx.click();
  const objects: Phaser.GameObjects.GameObject[] = [];
  const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(DEPTH.overlay + 20);
    objects.push(o);
    return o;
  };
  const close = () => objects.forEach((o) => o.destroy());

  // Dim everything and swallow taps so nothing underneath reacts
  keep(scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0c1f, 0.7).setOrigin(0).setInteractive());
  const pw = 820;
  const ph = 520;
  const top = (GAME_HEIGHT - ph) / 2;
  const panel = keep(scene.add.graphics());
  panel.fillStyle(0x1b1d3a, 0.97).fillRoundedRect(GAME_WIDTH / 2 - pw / 2, top, pw, ph, 26);
  panel.lineStyle(4, 0xffcc33, 1).strokeRoundedRect(GAME_WIDTH / 2 - pw / 2, top, pw, ph, 26);
  keep(scene.add.text(GAME_WIDTH / 2, top + 42, 'ตั้งค่า', style(40, '#ffcc33')).setOrigin(0.5));

  // How to aim: two cards, the chosen one highlighted
  keep(scene.add.text(GAME_WIDTH / 2 - pw / 2 + 40, top + 92, 'วิธีเล็งยิง', style(26)).setOrigin(0, 0.5));
  const cards = AIM_CHOICES.map((c, i) => {
    const cx = GAME_WIDTH / 2 + (i === 0 ? -190 : 190);
    const cy = top + 220;
    const g = keep(scene.add.graphics());
    const hit = keep(scene.add.zone(cx, cy, 350, 190).setInteractive({ useHandCursor: true }));
    keep(scene.add.text(cx, cy - 62, c.title, style(26)).setOrigin(0.5));
    c.lines.forEach((l, k) => keep(scene.add.text(cx, cy - 16 + k * 34, l, style(19, '#d8e4ff')).setOrigin(0.5)));
    hit.on('pointerup', () => {
      setAimMode(c.mode);
      sfx.pick();
      draw();
    });
    return { mode: c.mode, g, cx, cy };
  });
  const draw = () => {
    for (const c of cards) {
      const on = aimMode() === c.mode;
      c.g.clear();
      c.g.fillStyle(on ? 0x3a8dde : 0x2a2d52, 1).fillRoundedRect(c.cx - 175, c.cy - 95, 350, 190, 20);
      c.g.lineStyle(on ? 6 : 3, on ? 0xffee55 : 0x6a6f9a, 1).strokeRoundedRect(c.cx - 175, c.cy - 95, 350, 190, 20);
    }
  };
  draw();

  // Sound
  const soundY = top + 372;
  keep(scene.add.text(GAME_WIDTH / 2 - pw / 2 + 40, soundY, 'เสียงและเพลง', style(26)).setOrigin(0, 0.5));
  let soundBtn: Phaser.GameObjects.Container | null = null;
  const drawSound = () => {
    soundBtn?.destroy();
    const on = !isMuted();
    soundBtn = keep(
      addTextButton(scene, GAME_WIDTH / 2 + 220, soundY, on ? 'เปิดอยู่' : 'ปิดอยู่', () => {
        setMuted(on);
        drawSound();
      }, { width: 200, height: 56, fontSize: 24, color: on ? 0x2fbf5b : 0x8a8fa8 }),
    );
  };
  drawSound();

  keep(addTextButton(scene, GAME_WIDTH / 2, top + ph - 50, 'ปิด', close, { width: 220, height: 60, fontSize: 26, color: 0xff8a1f }));
}

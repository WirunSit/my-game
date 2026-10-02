import * as Phaser from 'phaser';
import { ITEM_SKILLS, SKILL_SLOTS, type SkillSlot } from '@sciboom/shared';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';


export interface SlotState {
  enabled: boolean;
  armed: boolean;
  /** Uses left (item skills) */
  count?: number;
  /** 0–1 fill (ultimate gauge) */
  fill?: number;
  /** Short reason it can't be used, e.g. "★3" or "อีก 2 ตา" */
  note?: string;
}

const SIZE = 60;
const GAP = 78;
const Y = GAME_HEIGHT - 158;
const KEY_NAMES = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'];

const style = (size: number, color = '#ffffff'): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT_FAMILY,
  fontSize: `${size}px`,
  fontStyle: '700',
  color,
  stroke: TEXT_STROKE,
  strokeThickness: Math.max(3, size / 5),
  padding: { top: 4 },
});

interface SlotView {
  root: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Container;
  badge: Phaser.GameObjects.Text;
  note: Phaser.GameObjects.Text;
}

/** Row of round skill buttons above the power bar (tap, or keys 1–7) */
export class SkillBar {
  onPick: (slot: SkillSlot) => void = () => {};
  private readonly views = new Map<SkillSlot, SlotView>();
  private readonly hint: Phaser.GameObjects.Text;
  private visible = false;

  constructor(private readonly scene: Phaser.Scene) {
    const names: Record<SkillSlot, string> = {
      double: ITEM_SKILLS.double.name,
      triple: ITEM_SKILLS.triple.name,
      heal: ITEM_SKILLS.heal.name,
      plane: ITEM_SKILLS.plane.name,
      stealth: ITEM_SKILLS.stealth.name,
      special: 'ท่าพิเศษ',
      ultimate: 'ไม้ตาย',
    };
    const x0 = GAME_WIDTH / 2 - ((SKILL_SLOTS.length - 1) * GAP) / 2;
    SKILL_SLOTS.forEach((slot, i) => {
      const x = x0 + i * GAP;
      const ring = scene.add.graphics();
      const icon = scene.add.container(0, 0);
      const label = scene.add.text(0, SIZE / 2 + 12, names[slot], style(13)).setOrigin(0.5);
      const keyHint = scene.add.text(-SIZE / 2 + 2, -SIZE / 2 - 2, String(i + 1), style(13, '#ffcc33')).setOrigin(0.5);
      const badge = scene.add.text(SIZE / 2 - 4, -SIZE / 2 + 4, '', style(16, '#7dff8a')).setOrigin(0.5);
      const note = scene.add.text(0, 2, '', style(15, '#ffcc33')).setOrigin(0.5);
      const root = scene.add.container(x, Y, [ring, icon, label, keyHint, badge, note]).setScrollFactor(0).setDepth(DEPTH.hud);
      root.setSize(SIZE + 10, SIZE + 10).setInteractive({ useHandCursor: true });
      root.on('pointerup', () => this.visible && this.onPick(slot));
      this.views.set(slot, { root, ring, icon, badge, note });
    });
    this.hint = scene.add
      .text(GAME_WIDTH / 2, Y - SIZE / 2 - 26, '', style(18, '#bfe8ff'))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);

    const kb = scene.input.keyboard!;
    KEY_NAMES.forEach((k, i) => kb.on(`keydown-${k}`, () => this.visible && this.onPick(SKILL_SLOTS[i])));
    scene.events.once('shutdown', () => KEY_NAMES.forEach((k) => kb.off(`keydown-${k}`)));
    this.setVisible(false);
  }

  /** Icons depend on who is playing: their weapon and their character */
  setIcons(weaponId: string, portraitKey: string) {
    const img = (key: string, h: number, x = 0, y = 0, alpha = 1) => {
      const im = this.scene.add.image(x, y, key).setAlpha(alpha);
      im.setScale(Math.min(h / im.height, (SIZE - 12) / im.width));
      return im;
    };
    const icons: Record<SkillSlot, Phaser.GameObjects.Image[]> = {
      double: [img('fx/proj_cannonball', 24, -8, 4), img('fx/proj_cannonball', 24, 8, -4)],
      triple: [img('fx/proj_cannonball', 20, -12, 6), img('fx/proj_cannonball', 20, 0, -8), img('fx/proj_cannonball', 20, 12, 6)],
      heal: [img('ui/heart', 38)],
      plane: [img('fx/paper_plane', 30)],
      stealth: [img(portraitKey, 46, 0, 0, 0.35)],
      special: [img(`weapons/${weaponId}`, 34)],
      ultimate: [img('ui/crystal', 38)],
    };
    for (const slot of SKILL_SLOTS) {
      const v = this.views.get(slot)!;
      v.icon.removeAll(true);
      v.icon.add(icons[slot]);
    }
  }

  update(states: Record<SkillSlot, SlotState>, hint = '') {
    for (const slot of SKILL_SLOTS) {
      const s = states[slot];
      const v = this.views.get(slot)!;
      const g = v.ring;
      g.clear();
      g.fillStyle(s.armed ? 0x5a3d00 : 0x1b1d3a, 0.85).fillCircle(0, 0, SIZE / 2);
      if (s.fill !== undefined) {
        // Gauge drawn as an arc around the button
        g.lineStyle(6, 0x3a3d5a, 1).strokeCircle(0, 0, SIZE / 2);
        if (s.fill > 0) {
          g.lineStyle(6, s.fill >= 1 ? 0xffcc33 : 0x5fd4ff, 1);
          g.beginPath();
          g.arc(0, 0, SIZE / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.fill));
          g.strokePath();
        }
      }
      g.lineStyle(s.armed ? 5 : 3, s.armed ? 0xffee55 : s.enabled ? 0xffffff : 0x666677, 1).strokeCircle(0, 0, SIZE / 2 + (s.fill !== undefined ? 4 : 0));
      v.icon.setAlpha(s.enabled || s.armed ? 1 : 0.35);
      v.badge.setText(s.count !== undefined ? String(s.count) : '').setColor(s.count ? '#7dff8a' : '#ff9a9a');
      v.note.setText(s.note ?? '');
      v.root.setScale(s.armed ? 1.1 : 1);
    }
    this.hint.setText(hint);
  }

  /** See-through while the player stands behind the bar, so they can still see themselves */
  fadeIfCovering(screenX: number, screenTop: number, screenBottom: number) {
    const x0 = GAME_WIDTH / 2 - ((SKILL_SLOTS.length - 1) * GAP) / 2 - GAP / 2;
    const x1 = GAME_WIDTH - x0;
    const covering = screenX > x0 && screenX < x1 && screenBottom > Y - SIZE / 2 - 30 && screenTop < Y + SIZE / 2 + 20;
    const alpha = covering ? 0.4 : 1;
    for (const v of this.views.values()) v.root.setAlpha(alpha);
    this.hint.setAlpha(alpha);
  }

  setVisible(on: boolean) {
    this.visible = on;
    for (const v of this.views.values()) v.root.setVisible(on);
    this.hint.setVisible(on);
  }
}

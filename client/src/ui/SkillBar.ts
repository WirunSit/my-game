import * as Phaser from 'phaser';
import { ITEM_SKILLS, SKILL_SLOTS, type SkillSlot } from '@sciboom/shared';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';


export interface SlotState {
  enabled: boolean;
  armed: boolean;
  /** Stamina it uses */
  cost?: number;
  /** Uses left this match (skills that have a limit) */
  count?: number;
  /** 0–1 fill (ultimate gauge) */
  fill?: number;
  /** Short reason it can't be used, e.g. "★3" or "อีก 2" */
  note?: string;
}

const SIZE = 52;
const GAP = 64;
const Y = GAME_HEIGHT - 158;
const KEY_NAMES = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'ZERO'];
const KEY_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

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
  cost: Phaser.GameObjects.Text;
  note: Phaser.GameObjects.Text;
}

/** Row of round skill buttons above the power bar (tap, or keys 1–9 and 0) */
export class SkillBar {
  onPick: (slot: SkillSlot) => void = () => {};
  private readonly views = new Map<SkillSlot, SlotView>();
  private readonly hint: Phaser.GameObjects.Text;
  private visible = false;

  constructor(private readonly scene: Phaser.Scene) {
    const names: Record<SkillSlot, string> = {
      plus1: '+1',
      plus2: '+2',
      triple: ITEM_SKILLS.triple.name,
      power: ITEM_SKILLS.power.name,
      shield: ITEM_SKILLS.shield.name,
      heal: ITEM_SKILLS.heal.name,
      plane: 'จรวดกระดาษ',
      stealth: ITEM_SKILLS.stealth.name,
      special: 'ท่าพิเศษ',
      ultimate: 'ไม้ตาย',
    };
    const x0 = GAME_WIDTH / 2 - ((SKILL_SLOTS.length - 1) * GAP) / 2;
    SKILL_SLOTS.forEach((slot, i) => {
      const x = x0 + i * GAP;
      const ring = scene.add.graphics();
      const icon = scene.add.container(0, 0);
      const label = scene.add.text(0, SIZE / 2 + 11, names[slot], style(12)).setOrigin(0.5);
      const keyHint = scene.add.text(-SIZE / 2 + 1, -SIZE / 2 - 1, KEY_LABELS[i], style(12, '#ffcc33')).setOrigin(0.5);
      const badge = scene.add.text(SIZE / 2 - 2, -SIZE / 2 + 2, '', style(14, '#7dff8a')).setOrigin(0.5);
      // Stamina price, bottom right like DDTank
      const cost = scene.add.text(SIZE / 2 - 3, SIZE / 2 - 8, '', style(13, '#5fd4ff')).setOrigin(0.5);
      const note = scene.add.text(0, 2, '', style(14, '#ffcc33')).setOrigin(0.5);
      const root = scene.add.container(x, Y, [ring, icon, label, keyHint, badge, cost, note]).setScrollFactor(0).setDepth(DEPTH.hud);
      root.setSize(SIZE + 8, SIZE + 10).setInteractive({ useHandCursor: true });
      root.on('pointerup', () => this.visible && this.onPick(slot));
      this.views.set(slot, { root, ring, icon, badge, cost, note });
    });
    this.hint = scene.add
      .text(GAME_WIDTH / 2, Y - SIZE / 2 - 24, '', style(17, '#bfe8ff'))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);

    const kb = scene.input.keyboard!;
    // When frames lag, Phaser can hand the same key press over more than once; picking twice would put the skill back
    const handled = new WeakSet<KeyboardEvent>();
    KEY_NAMES.forEach((k, i) =>
      kb.on(`keydown-${k}`, (e: KeyboardEvent) => {
        if (handled.has(e)) return;
        handled.add(e);
        if (this.visible) this.onPick(SKILL_SLOTS[i]);
      }),
    );
    scene.events.once('shutdown', () => KEY_NAMES.forEach((k) => kb.off(`keydown-${k}`)));
    this.setVisible(false);
  }

  /** Icons depend on who is playing: their weapon and their character */
  setIcons(weaponId: string, portraitKey: string) {
    const img = (key: string, h: number, x = 0, y = 0, alpha = 1) => {
      const im = this.scene.add.image(x, y, key).setAlpha(alpha);
      im.setScale(Math.min(h / im.height, (SIZE - 10) / im.width));
      return im;
    };
    const tag = (text: string) => this.scene.add.text(0, 2, text, style(20, '#ffdd33')).setOrigin(0.5);
    // Icon art (art/raw/14.png -> ui/skill_*) where there is some; the rest is made from existing art
    const art: Partial<Record<SkillSlot, string>> = {
      plus1: 'ui/skill_double',
      triple: 'ui/skill_triple',
      heal: 'ui/skill_heal',
      plane: 'ui/skill_plane',
      stealth: 'ui/skill_stealth',
      ultimate: 'ui/skill_ultimate',
      plus2: 'ui/skill_plus2',
      power: 'ui/skill_power',
      shield: 'ui/skill_shield',
    };
    const fallback: Record<SkillSlot, () => Phaser.GameObjects.GameObject[]> = {
      plus1: () => [img('fx/proj_cannonball', 22, -7, 4), img('fx/proj_cannonball', 22, 7, -4)],
      plus2: () => [img('fx/proj_cannonball', 18, -10, 8), img('fx/proj_cannonball', 18, 0, 0), img('fx/proj_cannonball', 18, 10, -8)],
      triple: () => [img('fx/proj_cannonball', 18, -11, 6), img('fx/proj_cannonball', 18, 0, -8), img('fx/proj_cannonball', 18, 11, 6)],
      power: () => [img('fx/fx_spark', 40)],
      shield: () => [img('fx/fx_shield', 40)],
      heal: () => [img('ui/heart', 34)],
      plane: () => [img(this.scene.textures.exists('fx/proj_paper_plane') ? 'fx/proj_paper_plane' : 'fx/paper_plane', 26)],
      stealth: () => [img(portraitKey, 40, 0, 0, 0.35)],
      special: () => [img(`weapons/${weaponId}`, 30)],
      ultimate: () => [img('ui/crystal', 34)],
    };
    for (const slot of SKILL_SLOTS) {
      const key = art[slot];
      // The special keeps showing the player's own weapon
      const icon: Phaser.GameObjects.GameObject[] = key && this.scene.textures.exists(key) ? [img(key, 40)] : fallback[slot]();
      // +1 / +2 look alike: print the number on top
      if (slot === 'plus1') icon.push(tag('+1'));
      if (slot === 'plus2') icon.push(tag('+2'));
      const v = this.views.get(slot)!;
      v.icon.removeAll(true);
      v.icon.add(icon);
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
          g.lineStyle(6, s.fill >= 1 ? 0xffcc33 : 0xff7a1a, 1);
          g.beginPath();
          g.arc(0, 0, SIZE / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.fill));
          g.strokePath();
        }
      }
      g.lineStyle(s.armed ? 5 : 3, s.armed ? 0xffee55 : s.enabled ? 0xffffff : 0x666677, 1).strokeCircle(0, 0, SIZE / 2 + (s.fill !== undefined ? 4 : 0));
      v.icon.setAlpha(s.enabled || s.armed ? 1 : 0.35);
      v.badge.setText(s.count !== undefined ? `x${s.count}` : '').setColor(s.count ? '#7dff8a' : '#ff9a9a');
      v.cost.setText(s.cost !== undefined && !s.note ? String(s.cost) : '').setColor(s.enabled || s.armed ? '#5fd4ff' : '#8a8fa8');
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

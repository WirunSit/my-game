import * as Phaser from 'phaser';
import {
  COSMETIC_CATALOG,
  COSMETIC_SLOTS,
  SLOT_NAMES,
  SLOT_UNLOCK_LEVEL,
  cosmeticArt,
  isUnlocked,
  type CosmeticDef,
  type CosmeticSlot,
} from '@sciboom/shared';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import { drawArtBackground } from '../game/background';
import { Costume, type Pose } from '../game/Costume';
import { loadSave, updateSave, type Character, type SaveData } from '../save';
import { addTextButton } from '../ui/TextButton';

const text = (size: number, color = '#ffffff'): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT_FAMILY,
  fontSize: `${size}px`,
  fontStyle: '700',
  color,
  stroke: TEXT_STROKE,
  strokeThickness: Math.max(3, size / 6),
  padding: { top: 6 },
});

const COLS = 5;
const CARD_W = 136;
const CARD_H = 156;
const GRID_X = 486;
const GRID_Y = 196;
const PREVIEW_X = 240;
const PREVIEW_FEET_Y = 540;

interface WardrobeData {
  tab?: CosmeticSlot;
  facing?: 1 | -1;
  pose?: Pose;
  /** Scene to return to */
  from?: string;
  message?: string;
}

/** ห้องแต่งตัว: choose a hat, face item, suit and back item; items unlock with the player's level */
export class WardrobeScene extends Phaser.Scene {
  private save!: SaveData;
  private tab: CosmeticSlot = 'hat';
  private facing: 1 | -1 = 1;
  private pose: Pose = 'side';
  private from = 'WorldMap';

  constructor() {
    super('Wardrobe');
  }

  init(data: WardrobeData) {
    this.save = loadSave();
    this.from = data.from ?? this.from;
    this.tab = data.tab ?? this.tab;
    this.facing = data.facing ?? 1;
    this.pose = data.pose ?? 'side';
  }

  create(data: WardrobeData) {
    drawArtBackground(this, 'backgrounds/menu_school', GAME_WIDTH, 0);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0c1f, 0.55).setOrigin(0);
    this.add.text(GAME_WIDTH / 2, 40, 'ห้องแต่งตัว', text(40, '#ffcc33')).setOrigin(0.5);
    this.add.text(40, 40, `Lv ${this.save.level}`, text(30, '#7dff8a')).setOrigin(0, 0.5);

    this.preview();
    this.tabs();
    this.items();

    addTextButton(this, 120, GAME_HEIGHT - 44, 'กลับ', () => this.scene.start(this.from), {
      width: 180,
      height: 58,
      fontSize: 24,
      color: 0x3a8dde,
    });
    if (data.message) this.flash(data.message);
  }

  // ---- Left: the dressed-up character ------------------------------------------

  private preview() {
    const g = this.add.graphics();
    g.fillStyle(0x1b1d3a, 0.8).fillRoundedRect(40, 90, 400, 540, 22);
    g.lineStyle(4, 0xffcc33, 1).strokeRoundedRect(40, 90, 400, 540, 22);
    // Little stage to stand on
    g.fillStyle(0xffffff, 0.15).fillEllipse(PREVIEW_X, PREVIEW_FEET_Y, 260, 44);

    const costume = new Costume(this, this.save.character, this.save.outfit, 330);
    costume.setPose(this.pose);
    costume.root.setPosition(PREVIEW_X, PREVIEW_FEET_Y - 8);
    costume.root.scaleX = this.facing;
    this.tweens.add({ targets: costume.root, y: costume.root.y - 6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // Spin: squash to nothing, flip, grow back — looks like turning around
    addTextButton(
      this,
      PREVIEW_X - 90,
      PREVIEW_FEET_Y + 50,
      'หมุนตัว',
      () => {
        this.facing = this.facing === 1 ? -1 : 1;
        this.tweens.add({
          targets: costume.root,
          scaleX: 0,
          duration: 150,
          yoyo: true,
          onYoyo: () => (costume.root.scaleX = 0.01 * this.facing),
          onComplete: () => (costume.root.scaleX = this.facing),
        });
      },
      { width: 160, height: 50, fontSize: 20, color: 0x8a5cf6 },
    );
    addTextButton(
      this,
      PREVIEW_X + 90,
      PREVIEW_FEET_Y + 50,
      this.pose === 'win' ? 'ท่าปกติ' : 'ท่าดีใจ',
      () => this.go({ pose: this.pose === 'win' ? 'side' : 'win' }),
      { width: 160, height: 50, fontSize: 20, color: 0xff8a1f },
    );

    // Boy / girl switch (same as on the world map), stacked on the left so tall hats never cover it
    (['boy', 'girl'] as Character[]).forEach((c, i) => {
      const y = 140 + i * 76;
      const on = c === this.save.character;
      const ring = this.add.circle(84, y, 32, 0xffffff, on ? 0.9 : 0.25).setStrokeStyle(4, on ? 0xffcc33 : 0x1b1d3a);
      const img = this.add.image(84, y + 30, `characters/${c}_front`).setOrigin(0.5, 1);
      img.setScale(60 / img.height);
      ring.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        updateSave((d) => (d.character = c));
        this.go({});
      });
    });
  }

  // ---- Right: slot tabs and item cards -------------------------------------------

  private tabs() {
    const w = 180;
    COSMETIC_SLOTS.forEach((slot, i) => {
      const x = GRID_X + w / 2 + i * (w + 10);
      const open = this.save.level >= SLOT_UNLOCK_LEVEL[slot];
      const label = open ? SLOT_NAMES[slot] : `${SLOT_NAMES[slot]} (Lv ${SLOT_UNLOCK_LEVEL[slot]})`;
      const btn = addTextButton(this, x, 130, label, () => this.go({ tab: slot }), {
        width: w,
        height: 56,
        fontSize: open ? 22 : 18,
        color: slot === this.tab ? 0xff8a1f : open ? 0x3a8dde : 0x555566,
      });
      if (slot === this.tab) btn.setScale(1.06);
    });
  }

  private items() {
    const slot = this.tab;
    const defs = COSMETIC_CATALOG.filter((c) => c.slot === slot);
    const level = this.save.level;
    const worn = this.save.outfit[slot];

    // First card takes the item off (for suits: back to the school uniform)
    this.card(0, null, worn === null, true, () => this.wear(slot, null));
    defs.forEach((def, i) => {
      const open = isUnlocked(def, level);
      this.card(i + 1, def, worn === def.id, open, () =>
        open ? this.wear(slot, def.id) : this.flash(`${def.name} ปลดล็อกที่ Lv ${def.level}`),
      );
    });

    // Something to look forward to
    const next = defs.filter((d) => !isUnlocked(d, level)).sort((a, b) => a.level - b.level)[0];
    const rows = Math.ceil((defs.length + 1) / COLS);
    const y = GRID_Y + rows * (CARD_H + 12) + 16;
    const hint = next ? `ชิ้นต่อไป: ${next.name} ปลดล็อกที่ Lv ${next.level}` : `ปลดล็อก${SLOT_NAMES[slot]}ครบทุกชิ้นแล้ว!`;
    this.add.text(GRID_X + (COLS * (CARD_W + 12)) / 2, y, hint, text(20, next ? '#bfe8ff' : '#7dff8a')).setOrigin(0.5, 0);
  }

  private card(index: number, def: CosmeticDef | null, worn: boolean, open: boolean, onTap: () => void) {
    const x = GRID_X + (index % COLS) * (CARD_W + 12);
    const y = GRID_Y + Math.floor(index / COLS) * (CARD_H + 12);
    const g = this.add.graphics();
    g.fillStyle(0x1b1d3a, worn ? 0.95 : 0.75).fillRoundedRect(x, y, CARD_W, CARD_H, 16);
    g.lineStyle(worn ? 6 : 3, worn ? 0xffee55 : open ? 0xffffff : 0x666677, worn ? 1 : 0.6).strokeRoundedRect(x, y, CARD_W, CARD_H, 16);

    if (def) {
      const img = this.add.image(x + CARD_W / 2, y + 64, cosmeticArt(def, this.save.character));
      img.setScale(Math.min(110 / img.width, 96 / img.height));
      if (!open) img.setAlpha(0.3);
    } else {
      // "Nothing" card: a crossed-out circle
      const n = this.add.graphics();
      n.lineStyle(6, 0xff9a9a, 0.9).strokeCircle(x + CARD_W / 2, y + 64, 32);
      n.lineBetween(x + CARD_W / 2 - 22, y + 64 + 22, x + CARD_W / 2 + 22, y + 64 - 22);
    }
    const name = def ? def.name : this.tab === 'suit' ? 'ชุดนักเรียน' : 'ไม่ใส่';
    this.add.text(x + CARD_W / 2, y + 128, name, text(15, open ? '#ffffff' : '#9a9aaa')).setOrigin(0.5);
    if (worn) this.add.text(x + 10, y + 8, 'ใส่อยู่', text(14, '#7dff8a'));
    if (!open && def) {
      const badge = this.add.graphics();
      badge.fillStyle(0x000000, 0.7).fillRoundedRect(x + CARD_W / 2 - 40, y + 46, 80, 36, 12);
      this.add.text(x + CARD_W / 2, y + 64, `Lv ${def.level}`, text(20, '#ffcc33')).setOrigin(0.5);
    }
    const hit = this.add.zone(x, y, CARD_W, CARD_H).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', onTap);
  }

  // ---- Actions ----------------------------------------------------------------------

  private wear(slot: CosmeticSlot, id: string | null) {
    if (this.save.outfit[slot] === id) return;
    updateSave((d) => (d.outfit[slot] = id));
    this.go({ message: id ? 'แต่งตัวแล้ว!' : slot === 'suit' ? 'เปลี่ยนเป็นชุดนักเรียนแล้ว' : 'ถอดออกแล้ว' });
  }

  private go(data: WardrobeData) {
    this.scene.restart({ tab: this.tab, facing: this.facing, pose: this.pose, from: this.from, ...data });
  }

  private flash(message: string) {
    const t = this.add.text(GAME_WIDTH / 2 + 220, GAME_HEIGHT - 44, message, text(26, '#7dff8a')).setOrigin(0.5);
    this.tweens.add({ targets: t, alpha: 0, delay: 1400, duration: 500, onComplete: () => t.destroy() });
  }
}

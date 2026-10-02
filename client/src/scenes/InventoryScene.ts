import * as Phaser from 'phaser';
import { startMusic } from '../audio/Sound';
import {
  FUSE_COUNT,
  MAX_LEVEL,
  RARITY_NAMES,
  canFuse,
  expToNext,
  maxWeaponLevel,
  upgradeCost,
  weaponDef,
  weaponStats,
  type WeaponItem,
} from '@sciboom/shared';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import { drawArtBackground } from '../game/background';
import { loadSave, newUid, updateSave, type SaveData } from '../save';
import { RARITY_COLORS, addStars } from '../ui/rarity';
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

const COLS = 4;
const ROWS = 3;
const CARD_W = 168;
const CARD_H = 156;
const GRID_X = 40;
const GRID_Y = 120;

interface InventoryData {
  selected?: string;
  page?: number;
  /** Scene to return to */
  from?: string;
  /** Message to flash after an action */
  message?: string;
}

/** คลังอาวุธ: pick, upgrade and fuse weapons */
export class InventoryScene extends Phaser.Scene {
  private save!: SaveData;
  private selected!: WeaponItem;
  private page = 0;
  private from = 'WorldMap';

  constructor() {
    super('Inventory');
  }

  init(data: InventoryData) {
    this.save = loadSave();
    this.from = data.from ?? this.from;
    this.page = data.page ?? 0;
    this.selected = this.save.weapons.find((w) => w.uid === data.selected) ?? this.save.weapons.find((w) => w.uid === this.save.equipped)!;
  }

  create(data: InventoryData) {
    startMusic('menu');
    drawArtBackground(this, 'backgrounds/world1_lab', GAME_WIDTH, 0);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0c1f, 0.6).setOrigin(0);
    this.add.text(GAME_WIDTH / 2, 40, 'คลังอาวุธ', text(40, '#ffcc33')).setOrigin(0.5);
    this.header();
    this.grid();
    this.details();

    addTextButton(this, 120, GAME_HEIGHT - 44, 'กลับ', () => this.scene.start(this.from), {
      width: 180,
      height: 58,
      fontSize: 24,
      color: 0x3a8dde,
    });
    if (data.message) this.flash(data.message);
  }

  /** Level + EXP bar on the left, coins and crystals on the right */
  private header() {
    const s = this.save;
    this.add.text(40, 40, `Lv ${s.level}`, text(30, '#7dff8a')).setOrigin(0, 0.5);
    const barX = 130;
    this.add.rectangle(barX, 42, 200, 16, 0x1b1d3a).setOrigin(0, 0.5).setStrokeStyle(2, 0xffffff, 0.7);
    const need = s.level >= MAX_LEVEL ? 1 : expToNext(s.level);
    this.add.rectangle(barX + 2, 42, 196 * Math.min(1, s.exp / need), 12, 0x7dff8a).setOrigin(0, 0.5);
    this.add.text(barX + 100, 64, s.level >= MAX_LEVEL ? 'เลเวลสูงสุด' : `EXP ${s.exp}/${need}`, text(14)).setOrigin(0.5);

    const coin = this.add.image(GAME_WIDTH - 330, 40, 'ui/coin');
    coin.setScale(36 / coin.height);
    this.add.text(GAME_WIDTH - 306, 40, `${s.coins}`, text(26)).setOrigin(0, 0.5);
    const crystal = this.add.image(GAME_WIDTH - 180, 40, 'ui/crystal');
    crystal.setScale(36 / crystal.height);
    this.add.text(GAME_WIDTH - 156, 40, `${s.crystals}`, text(26)).setOrigin(0, 0.5);
    this.add.text(GAME_WIDTH - 40, 76, 'ผลึกความรู้ได้จากการตอบคำถามถูก', text(14, '#bfe8ff')).setOrigin(1, 0.5);
  }

  private sortedWeapons(): WeaponItem[] {
    const eq = this.save.equipped;
    return [...this.save.weapons].sort(
      (a, b) => Number(b.uid === eq) - Number(a.uid === eq) || b.rarity - a.rarity || b.level - a.level || a.id.localeCompare(b.id),
    );
  }

  private grid() {
    const list = this.sortedWeapons();
    const perPage = COLS * ROWS;
    const pages = Math.max(1, Math.ceil(list.length / perPage));
    this.page = Phaser.Math.Clamp(this.page, 0, pages - 1);
    const shown = list.slice(this.page * perPage, (this.page + 1) * perPage);

    shown.forEach((w, i) => {
      const x = GRID_X + (i % COLS) * (CARD_W + 12);
      const y = GRID_Y + Math.floor(i / COLS) * (CARD_H + 12);
      const isSel = w.uid === this.selected.uid;
      const g = this.add.graphics();
      g.fillStyle(0x1b1d3a, isSel ? 0.95 : 0.75).fillRoundedRect(x, y, CARD_W, CARD_H, 16);
      g.lineStyle(isSel ? 6 : 4, RARITY_COLORS[w.rarity], 1).strokeRoundedRect(x, y, CARD_W, CARD_H, 16);
      // Selected card: bright yellow outline outside the rarity frame
      if (isSel) g.lineStyle(4, 0xffee55, 1).strokeRoundedRect(x - 6, y - 6, CARD_W + 12, CARD_H + 12, 20);
      const img = this.add.image(x + CARD_W / 2, y + 62, `weapons/${w.id}`);
      img.setScale(Math.min(130 / img.width, 80 / img.height));
      addStars(this, x + CARD_W / 2, y + 116, w.rarity, 18);
      this.add.text(x + CARD_W / 2, y + 140, `Lv ${w.level}`, text(16)).setOrigin(0.5);
      if (w.uid === this.save.equipped) {
        this.add.text(x + 10, y + 10, 'ใช้อยู่', text(14, '#7dff8a')).setOrigin(0, 0);
      }
      const hit = this.add.zone(x, y, CARD_W, CARD_H).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.go({ selected: w.uid }));
    });

    if (pages > 1) {
      const py = GRID_Y + ROWS * (CARD_H + 12) + 14;
      const mid = GRID_X + (COLS * (CARD_W + 12)) / 2;
      this.add.text(mid, py, `หน้า ${this.page + 1}/${pages}`, text(18)).setOrigin(0.5);
      if (this.page > 0) addTextButton(this, mid - 150, py, '‹ ก่อนหน้า', () => this.go({ page: this.page - 1 }), { width: 150, height: 44, fontSize: 18 });
      if (this.page < pages - 1) addTextButton(this, mid + 150, py, 'ถัดไป ›', () => this.go({ page: this.page + 1 }), { width: 150, height: 44, fontSize: 18 });
    }
  }

  /** Right-hand panel for the selected weapon */
  private details() {
    const w = this.selected;
    const def = weaponDef(w.id);
    const stats = weaponStats(w);
    const x0 = 780;
    const cx = x0 + 230;
    const g = this.add.graphics();
    g.fillStyle(0x1b1d3a, 0.9).fillRoundedRect(x0, 110, 460, 540, 22);
    g.lineStyle(5, RARITY_COLORS[w.rarity], 1).strokeRoundedRect(x0, 110, 460, 540, 22);

    const img = this.add.image(cx, 200, `weapons/${w.id}`);
    img.setScale(Math.min(260 / img.width, 140 / img.height));
    this.add.text(cx, 292, def.name, text(28)).setOrigin(0.5);
    addStars(this, cx, 330, w.rarity, 24);
    this.add.text(cx, 360, `ระดับ ${RARITY_NAMES[w.rarity]}  ·  Lv ${w.level}/${maxWeaponLevel(w.rarity)}`, text(18, '#dddddd')).setOrigin(0.5);
    this.add.text(x0 + 40, 398, `พลังโจมตี  ${stats.damage}`, text(20, '#ffb3a7')).setOrigin(0, 0.5);
    this.add.text(x0 + 250, 398, `รัศมีระเบิด  ${stats.radius}`, text(20, '#a7d8ff')).setOrigin(0, 0.5);

    // Equip
    const equipped = w.uid === this.save.equipped;
    addTextButton(this, cx, 450, equipped ? 'กำลังใช้อยู่' : 'ใช้อาวุธนี้', () => this.equip(), {
      width: 380,
      height: 58,
      fontSize: 24,
      color: 0x2fbf5b,
      disabled: equipped,
    });

    // Upgrade
    const atMax = w.level >= maxWeaponLevel(w.rarity);
    const cost = upgradeCost(w.rarity, w.level);
    const affordable = this.save.coins >= cost.coins && this.save.crystals >= cost.crystals;
    addTextButton(this, cx, 526, atMax ? 'เลเวลสูงสุดแล้ว' : 'อัปเลเวล', () => this.upgrade(), {
      width: 380,
      height: 58,
      fontSize: 24,
      color: 0xff8a1f,
      disabled: atMax || !affordable,
    });
    if (!atMax) {
      this.add
        .text(cx, 566, `ใช้ เหรียญ ${cost.coins} + ผลึกความรู้ ${cost.crystals}`, text(15, affordable ? '#ffffff' : '#ff9a9a'))
        .setOrigin(0.5);
    }

    // Fuse
    const copies = this.save.weapons.filter((o) => o.id === w.id && o.rarity === w.rarity).length;
    const fusable = canFuse(this.save.weapons, w);
    addTextButton(this, cx, 610, w.rarity >= 5 ? 'ระดับสูงสุดแล้ว' : `หลอม ${FUSE_COUNT} ชิ้นเป็น ${w.rarity + 1} ดาว (มี ${copies}/${FUSE_COUNT})`, () => this.fuse(), {
      width: 380,
      height: 52,
      fontSize: 20,
      color: 0x8a5cf6,
      disabled: !fusable,
    });
  }

  // ---- Actions ----------------------------------------------------------------

  private equip() {
    updateSave((d) => (d.equipped = this.selected.uid));
    this.go({ selected: this.selected.uid, message: 'เปลี่ยนอาวุธแล้ว' });
  }

  private upgrade() {
    const uid = this.selected.uid;
    let ok = false;
    updateSave((d) => {
      const w = d.weapons.find((o) => o.uid === uid);
      if (!w || w.level >= maxWeaponLevel(w.rarity)) return;
      const cost = upgradeCost(w.rarity, w.level);
      if (d.coins < cost.coins || d.crystals < cost.crystals) return;
      d.coins -= cost.coins;
      d.crystals -= cost.crystals;
      w.level++;
      ok = true;
    });
    this.go({ selected: uid, message: ok ? 'อัปเลเวลสำเร็จ!' : 'เหรียญหรือผลึกไม่พอ' });
  }

  /** Merge the selected weapon with 2 copies (lowest level first) into one a star higher */
  private fuse() {
    const target = this.selected;
    let newUidValue = '';
    updateSave((d) => {
      if (!canFuse(d.weapons, target)) return;
      const same = d.weapons
        .filter((o) => o.id === target.id && o.rarity === target.rarity && o.uid !== target.uid)
        .sort((a, b) => Number(a.uid === d.equipped) - Number(b.uid === d.equipped) || a.level - b.level)
        .slice(0, FUSE_COUNT - 1);
      const used = new Set([target.uid, ...same.map((o) => o.uid)]);
      const wasEquipped = used.has(d.equipped);
      d.weapons = d.weapons.filter((o) => !used.has(o.uid));
      const fused: WeaponItem = { uid: newUid(), id: target.id, rarity: target.rarity + 1, level: 1 };
      d.weapons.push(fused);
      if (wasEquipped) d.equipped = fused.uid;
      newUidValue = fused.uid;
    });
    this.go({ selected: newUidValue || target.uid, message: newUidValue ? `หลอมสำเร็จ! ได้อาวุธ ${target.rarity + 1} ดาว` : 'หลอมไม่ได้' });
  }

  private go(data: InventoryData) {
    this.scene.restart({ page: this.page, selected: this.selected.uid, from: this.from, ...data });
  }

  private flash(message: string) {
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 44, message, text(28, '#7dff8a')).setOrigin(0.5);
    this.tweens.add({ targets: t, alpha: 0, delay: 1400, duration: 500, onComplete: () => t.destroy() });
  }
}

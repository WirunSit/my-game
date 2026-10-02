import * as Phaser from 'phaser';
import { startMusic } from '../audio/Sound';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import { drawArtBackground } from '../game/background';
import { STAGES, WORLDS, isUnlocked, type WorldConfig } from '../game/stages';
import { isWorldOpen } from '../net/session';
import { loadSave, updateSave, type Character } from '../save';
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

type WorldLock = 'open' | 'teacher' | 'previous';

/** Pick a world (tabs) and one of its three stages; choose boy/girl */
export class WorldMapScene extends Phaser.Scene {
  private world = 1;

  constructor() {
    super('WorldMap');
  }

  init(data: { world?: number }) {
    const stars = loadSave().stars;
    // Default: the furthest world the player can play
    const playable = WORLDS.filter((w) => this.lockOf(w, stars) === 'open').map((w) => w.id);
    this.world = data.world ?? playable[playable.length - 1] ?? 1;
  }

  /** Why a world can't be played yet: the teacher hasn't opened it, or the previous boss isn't beaten */
  private lockOf(w: WorldConfig, stars: Record<string, number>): WorldLock {
    if (!isWorldOpen(w.id)) return 'teacher';
    const first = STAGES.find((s) => s.world === w.id)!;
    return isUnlocked(first.id, stars) ? 'open' : 'previous';
  }

  create() {
    startMusic('menu');
    const save = loadSave();
    const w = WORLDS[this.world - 1];
    drawArtBackground(this, w.background, GAME_WIDTH, 0);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0c1f, 0.45).setOrigin(0);

    this.add.text(GAME_WIDTH / 2, 44, 'ผจญภัยโลกวิทยาศาสตร์', text(40, '#ffcc33')).setOrigin(0.5);

    // Level, coins and crystals
    this.add.text(30, 30, `Lv ${save.level}`, text(28, '#7dff8a')).setOrigin(0, 0.5);
    const coin = this.add.image(36, 74, 'ui/coin');
    coin.setScale(30 / coin.height);
    this.add.text(58, 74, `${save.coins}`, text(22)).setOrigin(0, 0.5);
    const crystal = this.add.image(150, 74, 'ui/crystal');
    crystal.setScale(30 / crystal.height);
    this.add.text(172, 74, `${save.crystals}`, text(22)).setOrigin(0, 0.5);

    this.characterPicker(save.character);
    this.tabs(save.stars);
    this.worldCard(w, save.stars);

    addTextButton(this, GAME_WIDTH - 410, GAME_HEIGHT - 48, 'ห้องแต่งตัว', () => this.scene.start('Wardrobe', { from: 'WorldMap' }), {
      width: 240,
      height: 60,
      fontSize: 24,
      color: 0x8a5cf6,
    });
    addTextButton(this, GAME_WIDTH - 150, GAME_HEIGHT - 48, 'คลังอาวุธ', () => this.scene.start('Inventory', { from: 'WorldMap' }), {
      width: 240,
      height: 60,
      fontSize: 24,
      color: 0x2fbf5b,
    });
    addTextButton(this, 130, GAME_HEIGHT - 48, 'กลับเมนู', () => this.scene.start('Menu'), {
      width: 200,
      height: 60,
      fontSize: 24,
      color: 0x3a8dde,
    });
  }

  private characterPicker(current: Character) {
    this.add.text(GAME_WIDTH - 230, 44, 'ตัวละคร', text(22)).setOrigin(1, 0.5);
    const options: Character[] = ['boy', 'girl'];
    options.forEach((c, i) => {
      const x = GAME_WIDTH - 180 + i * 100;
      const ring = this.add.circle(x, 52, 44, 0xffffff, c === current ? 0.9 : 0.25).setStrokeStyle(4, c === current ? 0xffcc33 : 0x1b1d3a);
      const img = this.add.image(x, 92, `characters/${c}_front`).setOrigin(0.5, 1);
      img.setScale(84 / img.height);
      ring.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        updateSave((d) => (d.character = c));
        this.scene.restart({ world: this.world });
      });
    });
  }

  /** One tab per world: boss picture, stars collected, lock state */
  private tabs(stars: Record<string, number>) {
    const tabW = 214;
    const x0 = GAME_WIDTH / 2 - (2 * (tabW + 12));
    WORLDS.forEach((w, i) => {
      const x = x0 + i * (tabW + 12);
      const y = 150;
      const selected = w.id === this.world;
      const lock = this.lockOf(w, stars);
      const got = STAGES.filter((s) => s.world === w.id).reduce((a, s) => a + (stars[s.id] ?? 0), 0);
      const g = this.add.graphics();
      g.fillStyle(selected ? 0xff8a1f : 0x1b1d3a, selected ? 0.95 : 0.8).fillRoundedRect(x - tabW / 2, y - 44, tabW, 88, 18);
      g.lineStyle(selected ? 5 : 3, selected ? 0xffee55 : lock === 'open' ? 0xffffff : 0x666677, 1).strokeRoundedRect(x - tabW / 2, y - 44, tabW, 88, 18);
      const boss = this.add.image(x - tabW / 2 + 44, y + 38, w.boss).setOrigin(0.5, 1);
      boss.setScale(Math.min(76 / boss.height, 76 / boss.width)).setAlpha(lock === 'open' ? 1 : 0.4);
      this.add.text(x + 26, y - 18, w.title, text(24)).setOrigin(0.5);
      this.add.text(x + 26, y + 16, lock === 'open' ? `ดาว ${got}/9` : lock === 'teacher' ? 'ครูยังไม่เปิด' : 'ยังล็อกอยู่', text(17, lock === 'open' ? '#ffcc33' : '#bbbbcc')).setOrigin(0.5);
      const hit = this.add.zone(x - tabW / 2, y - 44, tabW, 88).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.scene.restart({ world: w.id }));
    });
  }

  /** The selected world's three stages connected by a path */
  private worldCard(w: WorldConfig, stars: Record<string, number>) {
    const top = 214;
    const card = this.add.graphics();
    card.fillStyle(0x1b1d3a, 0.75).fillRoundedRect(60, top, GAME_WIDTH - 120, 384, 26);
    card.lineStyle(4, 0xffcc33, 1).strokeRoundedRect(60, top, GAME_WIDTH - 120, 384, 26);
    this.add.text(100, top + 34, `${w.title}: ${w.unitTitle}`, text(30, '#ffcc33')).setOrigin(0, 0.5);

    const lock = this.lockOf(w, stars);
    const stages = STAGES.filter((s) => s.world === w.id);
    const xs = [300, 620, 960];
    const y = top + 220;
    const path = this.add.graphics();
    path.lineStyle(10, 0xffffff, 0.5);
    path.lineBetween(xs[0], y, xs[xs.length - 1], y);

    stages.forEach((s, i) => {
      const x = xs[i];
      const open = lock === 'open' && isUnlocked(s.id, stars);
      const icon = this.add.image(x, y + 50, s.enemy.texture).setOrigin(0.5, 1);
      icon.setScale(Math.min((s.isBoss ? 150 : 100) / icon.height, (s.isBoss ? 190 : 130) / icon.width));
      if (!open) icon.setAlpha(0.3);

      const badge = this.add.circle(x, y + 70, 30, open ? 0xff8a1f : 0x666677).setStrokeStyle(4, 0x1b1d3a);
      this.add.text(x, y + 70, s.id, text(20)).setOrigin(0.5);
      this.add.text(x, y + 118, open ? s.title : 'ยังล็อกอยู่', text(19, open ? '#ffffff' : '#aaaaaa')).setOrigin(0.5);

      const got = stars[s.id] ?? 0;
      for (let k = 0; k < 3; k++) {
        const st = this.add.image(x + (k - 1) * 30, y - (s.isBoss ? 112 : 64), 'ui/star');
        st.setScale(26 / st.height).setAlpha(k < got ? 1 : 0.25);
      }

      if (open) {
        for (const o of [icon, badge]) {
          o.setInteractive({ useHandCursor: true }).on('pointerup', () => this.scene.start('Stage', { stageId: s.id }));
        }
        this.tweens.add({ targets: icon, y: icon.y - 8, duration: 700 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    });

    if (lock !== 'open') {
      const msg = lock === 'teacher' ? 'ครูยังไม่เปิดโลกนี้ (จะเปิดเมื่อเรียนถึงบทนี้)' : `ปราบบอสของโลก ${w.id - 1} ก่อน แล้วโลกนี้จะเปิด`;
      const box = this.add.graphics();
      box.fillStyle(0x0b0c1f, 0.85).fillRoundedRect(GAME_WIDTH / 2 - 330, top + 120, 660, 70, 18);
      this.add.text(GAME_WIDTH / 2, top + 155, msg, text(24, '#ffcc33')).setOrigin(0.5);
    }
  }
}

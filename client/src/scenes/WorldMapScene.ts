import * as Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import { drawArtBackground } from '../game/background';
import { STAGES, WORLDS, isUnlocked } from '../game/stages';
import { loadSave, updateSave, type Character } from '../save';
import { isWorldOpen } from '../net/session';
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

/** Pick a world and stage, and choose boy/girl character */
export class WorldMapScene extends Phaser.Scene {
  constructor() {
    super('WorldMap');
  }

  create() {
    const save = loadSave();
    drawArtBackground(this, 'backgrounds/world1_lab', GAME_WIDTH, 0);
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
    this.worldOne(save.stars);
    this.otherWorlds();

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
        this.scene.restart();
      });
    });
  }

  /** World 1 card with its three stages connected by a path */
  private worldOne(stars: Record<string, number>) {
    const w = WORLDS[0];
    const card = this.add.graphics();
    card.fillStyle(0x1b1d3a, 0.75).fillRoundedRect(60, 120, GAME_WIDTH - 120, 330, 26);
    card.lineStyle(4, 0xffcc33, 1).strokeRoundedRect(60, 120, GAME_WIDTH - 120, 330, 26);
    this.add.text(100, 150, `${w.title}: ${w.unitTitle}`, text(32, '#ffcc33')).setOrigin(0, 0.5);

    const stages = STAGES.filter((s) => s.world === w.id);
    const xs = [300, 620, 960];
    const y = 320;
    const path = this.add.graphics();
    path.lineStyle(10, 0xffffff, 0.5);
    path.lineBetween(xs[0], y, xs[xs.length - 1], y);

    stages.forEach((s, i) => {
      const x = xs[i];
      const open = isUnlocked(s.id, stars) && isWorldOpen(w.id);
      const icon = this.add.image(x, y + 50, s.enemy.texture).setOrigin(0.5, 1);
      icon.setScale((s.isBoss ? 150 : 100) / icon.height);
      if (!open) icon.setAlpha(0.3);

      const badge = this.add.circle(x, y + 70, 30, open ? 0xff8a1f : 0x666677).setStrokeStyle(4, 0x1b1d3a);
      this.add.text(x, y + 70, s.id, text(20)).setOrigin(0.5);
      this.add.text(x, y + 118, open ? s.title : 'ยังล็อกอยู่', text(20, open ? '#ffffff' : '#aaaaaa')).setOrigin(0.5);

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
  }

  private otherWorlds() {
    const rest = WORLDS.slice(1);
    const cardW = 230;
    const startX = GAME_WIDTH / 2 - ((rest.length - 1) * (cardW + 20)) / 2 + 60;
    rest.forEach((w, i) => {
      const x = startX + i * (cardW + 20);
      const y = 560;
      const g = this.add.graphics();
      g.fillStyle(0x1b1d3a, 0.7).fillRoundedRect(x - cardW / 2, y - 80, cardW, 160, 18);
      g.lineStyle(3, 0x8888aa, 1).strokeRoundedRect(x - cardW / 2, y - 80, cardW, 160, 18);
      const boss = this.add.image(x, y + 30, w.boss).setOrigin(0.5, 1).setAlpha(0.35);
      boss.setScale(90 / boss.height);
      this.add.text(x, y - 58, w.title, text(20)).setOrigin(0.5);
      this.add.text(x, y + 46, w.unitTitle, text(15, '#dddddd')).setOrigin(0.5);
      this.add.text(x, y - 10, 'เร็ว ๆ นี้', text(22, '#ffcc33')).setOrigin(0.5);
    });
  }
}

import * as Phaser from 'phaser';
import { MAX_WIND, type Terrain, type Vec } from '@sciboom/shared';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import type { Combatant } from '../game/Combatant';

const textStyle = (size: number, color = '#ffffff'): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT_FAMILY,
  fontSize: `${size}px`,
  fontStyle: '700',
  color,
  stroke: TEXT_STROKE,
  strokeThickness: Math.max(3, size / 6),
});

interface FighterPanel {
  portrait: Phaser.GameObjects.Image;
  hpFill: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
  hpWidth: number;
}

const MINIMAP = { x: GAME_WIDTH / 2 - 120, y: 122, w: 240, h: 64 };

/** Everything drawn on top of the battlefield (doesn't scroll with the camera) */
export class Hud {
  private readonly panels: FighterPanel[] = [];
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly windArrow: Phaser.GameObjects.Image;
  private readonly windText: Phaser.GameObjects.Text;
  private readonly angleText: Phaser.GameObjects.Text;
  private readonly powerFill: Phaser.GameObjects.Rectangle;
  private readonly powerMarker: Phaser.GameObjects.Triangle;
  private readonly powerArea: { x: number; w: number };
  private readonly staminaFill: Phaser.GameObjects.Rectangle;
  private readonly minimapGround: Phaser.GameObjects.Graphics;
  private readonly minimapDots: Phaser.GameObjects.Graphics;
  private readonly mapScale: number;
  private statusItems: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fighters: Combatant[],
    worldWidth: number,
  ) {
    fighters.forEach((f, i) => this.panels.push(this.fighterPanel(f, i === 0 ? 'left' : 'right')));

    // Turn timer
    const timerBg = scene.add.circle(GAME_WIDTH / 2, 44, 34, 0x1b1d3a, 0.75).setStrokeStyle(4, 0xffcc33);
    this.timerText = scene.add.text(GAME_WIDTH / 2, 44, '20', textStyle(34, '#ffcc33')).setOrigin(0.5);

    // Wind
    this.windArrow = scene.add.image(GAME_WIDTH / 2, 100, 'ui/wind_arrow');
    this.windText = scene.add.text(GAME_WIDTH / 2, 100, '', textStyle(20)).setOrigin(0.5);

    // Mini-map
    this.mapScale = MINIMAP.w / worldWidth;
    const mapBg = scene.add.rectangle(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h, 0x1b1d3a, 0.55).setOrigin(0).setStrokeStyle(2, 0xffffff, 0.6);
    this.minimapGround = scene.add.graphics();
    this.minimapDots = scene.add.graphics();

    // Bottom: angle + power bar
    const barY = GAME_HEIGHT - 52;
    const gauge = scene.add.image(GAME_WIDTH / 2 - 300, barY - 6, 'ui/gauge');
    gauge.setScale(84 / gauge.width);
    this.angleText = scene.add.text(GAME_WIDTH / 2 - 300, barY + 26, '', textStyle(22)).setOrigin(0.5);

    const frame = scene.add.image(GAME_WIDTH / 2 + 10, barY, 'ui/bar_power').setDisplaySize(440, 56);
    // The bar art has a dark inner slot; draw the fill inside it
    const innerW = frame.displayWidth * 0.86;
    const innerH = frame.displayHeight * 0.42;
    this.powerArea = { x: frame.x - innerW / 2, w: innerW };
    this.powerFill = scene.add.rectangle(this.powerArea.x, barY, 0, innerH, 0xff7a1a).setOrigin(0, 0.5);
    this.powerMarker = scene.add.triangle(0, barY - innerH / 2 - 8, 0, 0, 16, 0, 8, 12, 0xffffff).setStrokeStyle(2, 0x1b1d3a);
    const powerLabel = scene.add.text(frame.x, barY - 42, 'แรง', textStyle(18)).setOrigin(0.5);

    // Walking stamina (above the move buttons)
    const stY = GAME_HEIGHT - 138;
    const stLabel = scene.add.text(40, stY - 20, 'พลังเดิน', textStyle(16)).setOrigin(0, 0.5);
    const stBg = scene.add.rectangle(40, stY, 190, 12, 0x1b1d3a, 0.7).setOrigin(0, 0.5).setStrokeStyle(2, 0xffffff, 0.7);
    this.staminaFill = scene.add.rectangle(42, stY, 186, 8, 0x5fd4ff).setOrigin(0, 0.5);

    for (const o of [
      timerBg, this.timerText, this.windArrow, this.windText, mapBg, this.minimapGround, this.minimapDots,
      gauge, this.angleText, frame, this.powerFill, this.powerMarker, powerLabel, stLabel, stBg, this.staminaFill,
    ]) {
      o.setScrollFactor(0).setDepth(DEPTH.hud);
    }
  }

  private fighterPanel(f: Combatant, side: 'left' | 'right'): FighterPanel {
    const s = this.scene;
    const dir = side === 'left' ? 1 : -1;
    const edge = side === 'left' ? 16 : GAME_WIDTH - 16;

    const plate = s.add.graphics();
    plate.fillStyle(0x1b1d3a, 0.6).fillRoundedRect(side === 'left' ? 8 : GAME_WIDTH - 368, 8, 360, 92, 18);
    const portrait = s.add.image(edge + dir * 40, 96, f.portraitKey).setOrigin(0.5, 1);
    portrait.setScale(Math.min(86 / portrait.height, 84 / portrait.width));
    const name = s.add.text(edge + dir * 92, 14, f.name, textStyle(22)).setOrigin(side === 'left' ? 0 : 1, 0);

    const frame = s.add.image(edge + dir * 222, 68, 'ui/bar_hp').setDisplaySize(252, 40);
    const hpWidth = frame.displayWidth * 0.86;
    const hpFill = s.add.rectangle(frame.x - hpWidth / 2, 68, hpWidth, frame.displayHeight * 0.42, 0x4cd964).setOrigin(0, 0.5);
    const hpText = s.add.text(frame.x, 68, '', textStyle(15)).setOrigin(0.5);

    for (const o of [plate, portrait, name, frame, hpFill, hpText]) o.setScrollFactor(0).setDepth(DEPTH.hud);
    const panel = { portrait, hpFill, hpText, hpWidth };
    this.setHpBar(panel, f);
    return panel;
  }

  private setHpBar(p: FighterPanel, f: Combatant) {
    const frac = f.hp / f.maxHp;
    p.hpFill.width = p.hpWidth * frac;
    p.hpFill.fillColor = frac > 0.5 ? 0x4cd964 : frac > 0.25 ? 0xffcc00 : 0xff3b30;
    p.hpText.setText(`${f.hp} / ${f.maxHp}`);
  }

  refreshHp() {
    this.fighters.forEach((f, i) => this.setHpBar(this.panels[i], f));
  }

  setActive(index: number) {
    this.panels.forEach((p, i) => {
      this.scene.tweens.killTweensOf(p.portrait);
      p.portrait.setAlpha(i === index ? 1 : 0.55);
      if (i === index) this.scene.tweens.add({ targets: p.portrait, y: 90, duration: 300, yoyo: true, repeat: -1 });
      else p.portrait.y = 96;
    });
  }

  /** Small icons + labels under the left (player) panel, e.g. shield, crystals */
  setStatus(items: { icon: string; text: string }[]) {
    this.statusItems.forEach((o) => o.destroy());
    this.statusItems = [];
    let x = 20;
    for (const it of items) {
      const icon = this.scene.add.image(x, 124, it.icon).setOrigin(0, 0.5);
      icon.setScale(30 / icon.height);
      const label = this.scene.add.text(x + icon.displayWidth + 4, 124, it.text, textStyle(17)).setOrigin(0, 0.5);
      for (const o of [icon, label]) o.setScrollFactor(0).setDepth(DEPTH.hud);
      this.statusItems.push(icon, label);
      x += icon.displayWidth + label.width + 18;
    }
  }

  /** Hide/show the turn timer (hidden during the computer's turn) */
  showTimer(visible: boolean) {
    this.timerText.setVisible(visible);
  }

  setTimer(seconds: number) {
    const s = Math.max(0, Math.ceil(seconds));
    this.timerText.setText(String(s));
    this.timerText.setColor(s <= 5 ? '#ff5544' : '#ffcc33');
  }

  setWind(wind: number) {
    const strength = Math.abs(wind) / MAX_WIND;
    this.windArrow.setVisible(wind !== 0);
    this.windArrow.setScale((60 + 100 * strength) / this.windArrow.width, 44 / this.windArrow.height);
    this.windArrow.setFlipX(wind < 0);
    this.windText.setText(wind === 0 ? 'ไม่มีลม' : `ลม ${Math.abs(wind)}`);
  }

  setAngle(angle: number) {
    this.angleText.setText(`มุม ${Math.round(angle)}°`);
  }

  setPower(power: number, last: number | null) {
    this.powerFill.width = (this.powerArea.w * power) / 100;
    this.powerMarker.setVisible(last !== null);
    if (last !== null) this.powerMarker.x = this.powerArea.x + (this.powerArea.w * last) / 100 - 8;
  }

  setStamina(frac: number) {
    this.staminaFill.width = 186 * Math.max(0, frac);
  }

  /** Redraw the terrain outline in the mini-map (call after craters change it) */
  drawMinimap(terrain: Terrain) {
    const g = this.minimapGround;
    g.clear();
    g.fillStyle(0x7fd36a, 0.9);
    const sy = MINIMAP.h / terrain.height;
    for (let x = 0; x < terrain.width; x += 8) {
      const top = terrain.groundBelow(x, 0);
      if (top === null) continue;
      g.fillRect(MINIMAP.x + x * this.mapScale, MINIMAP.y + top * sy, Math.max(1, 8 * this.mapScale), (terrain.height - top) * sy);
    }
  }

  updateMinimap(terrainHeight: number, viewX: number, viewW: number, projectile: Vec | null) {
    const g = this.minimapDots;
    const sy = MINIMAP.h / terrainHeight;
    g.clear();
    g.lineStyle(2, 0xffffff, 0.8).strokeRect(MINIMAP.x + viewX * this.mapScale, MINIMAP.y, viewW * this.mapScale, MINIMAP.h);
    for (const f of this.fighters) {
      if (!f.alive) continue;
      g.fillStyle(f.color, 1).fillCircle(MINIMAP.x + f.x * this.mapScale, MINIMAP.y + Math.max(0, f.y - 30) * sy, 4);
    }
    if (projectile) {
      g.fillStyle(0xffffff, 1).fillCircle(MINIMAP.x + projectile.x * this.mapScale, MINIMAP.y + Phaser.Math.Clamp(projectile.y, 0, terrainHeight) * sy, 2.5);
    }
  }

  /** Big centred message that fades away (e.g. "ตาของผู้เล่น 1") */
  banner(text: string, color = '#ffffff') {
    const t = this.scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, text, textStyle(52, color))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.overlay)
      .setScale(0.6)
      .setAlpha(0);
    this.scene.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 220, ease: 'Back.out' });
    this.scene.tweens.add({ targets: t, alpha: 0, y: t.y - 30, delay: 1000, duration: 400, onComplete: () => t.destroy() });
  }
}

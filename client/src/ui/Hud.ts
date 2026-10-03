import * as Phaser from 'phaser';
import { MAX_WIND, type Terrain, type Vec } from '@sciboom/shared';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import type { Combatant } from '../game/Combatant';
import { BAR_FRAMES, FrameBar } from './FrameBar';

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
  hpBar: FrameBar;
  hpText: Phaser.GameObjects.Text;
}

const MINIMAP = { x: GAME_WIDTH / 2 - 120, y: 122, w: 240, h: 64 };

/** Everything drawn on top of the battlefield (doesn't scroll with the camera) */
export class Hud {
  private readonly panels: FighterPanel[] = [];
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly windArrow: Phaser.GameObjects.Image;
  private readonly windText: Phaser.GameObjects.Text;
  private readonly angleText: Phaser.GameObjects.Text;
  private readonly powerBar: FrameBar;
  private readonly powerMarker: Phaser.GameObjects.Triangle;
  private readonly powerArea: { x: number; w: number };
  private readonly staminaFill: Phaser.GameObjects.Graphics;
  private readonly staminaY: number;
  private readonly staminaText: Phaser.GameObjects.Text;
  private readonly minimapGround: Phaser.GameObjects.Graphics;
  private readonly minimapDots: Phaser.GameObjects.Graphics;
  private readonly mapScale: number;
  private statusItems: Phaser.GameObjects.GameObject[] = [];
  private lastBanner?: Phaser.GameObjects.Text;
  private countdownText?: Phaser.GameObjects.Text;
  /** Whether a fighter gets a dot on the mini-map (camouflage hides it from the other side) */
  showOnMap: (c: Combatant) => boolean = () => true;

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

    // Power bar: the fill sits exactly in the frame's inner slot
    this.powerBar = new FrameBar(scene, GAME_WIDTH / 2 + 10, barY, 440, 56, BAR_FRAMES.power);
    this.powerArea = { x: this.powerBar.holeX, w: this.powerBar.holeW };
    this.powerMarker = scene.add.triangle(0, barY - 20, 0, 0, 16, 0, 8, 12, 0xffffff).setStrokeStyle(2, 0x1b1d3a);
    const powerLabel = scene.add.text(GAME_WIDTH / 2 + 10, barY - 42, 'แรง', textStyle(18)).setOrigin(0.5);

    // Stamina for walking and skills (above the move buttons)
    const stY = GAME_HEIGHT - 138;
    const stLabel = scene.add.text(40, stY - 20, 'สตามินา', textStyle(16)).setOrigin(0, 0.5);
    this.staminaText = scene.add.text(230, stY - 20, '', textStyle(16, '#5fd4ff')).setOrigin(1, 0.5);
    const stBg = scene.add.graphics();
    stBg.fillStyle(0x1b1d3a, 0.7).fillRoundedRect(40, stY - 7, 190, 14, 7);
    stBg.lineStyle(2, 0xffffff, 0.7).strokeRoundedRect(40, stY - 7, 190, 14, 7);
    this.staminaFill = scene.add.graphics();
    this.staminaY = stY;

    for (const o of [
      timerBg, this.timerText, this.windArrow, this.windText, mapBg, this.minimapGround, this.minimapDots,
      gauge, this.angleText, ...this.powerBar.objects, this.powerMarker, powerLabel, stLabel, this.staminaText, stBg, this.staminaFill,
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

    // HP bar: the frame keeps its round ends, the fill sits exactly in its inner slot
    const hpBar = new FrameBar(s, edge + dir * 222, 68, 252, 40, BAR_FRAMES.hp);
    const hpText = s.add.text(edge + dir * 222, 68, '', textStyle(15)).setOrigin(0.5);

    for (const o of [plate, portrait, name, ...hpBar.objects, hpText]) o.setScrollFactor(0).setDepth(DEPTH.hud);
    const panel = { portrait, hpBar, hpText };
    this.setHpBar(panel, f);
    return panel;
  }

  private setHpBar(p: FighterPanel, f: Combatant) {
    const frac = f.hp / f.maxHp;
    p.hpBar.setFill(frac, frac > 0.5 ? 0x4cd964 : frac > 0.25 ? 0xffcc00 : 0xff3b30);
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
    this.powerBar.setFill(power / 100, 0xff7a1a);
    this.powerMarker.setVisible(last !== null);
    if (last !== null) this.powerMarker.x = this.powerArea.x + (this.powerArea.w * last) / 100 - 8;
  }

  setStamina(frac: number, value?: number) {
    // Rounded ends like the frame (the radius shrinks for a nearly empty bar)
    const w = 184 * Math.max(0, Math.min(1, frac));
    this.staminaFill.clear();
    if (w > 0.5) this.staminaFill.fillStyle(0x5fd4ff, 1).fillRoundedRect(43, this.staminaY - 4, w, 8, Math.min(4, w / 2));
    this.staminaText.setText(value === undefined ? '' : String(Math.floor(value)));
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
      if (!f.alive || !this.showOnMap(f)) continue;
      g.fillStyle(f.color, 1).fillCircle(MINIMAP.x + f.x * this.mapScale, MINIMAP.y + Math.max(0, f.y - 30) * sy, 4);
    }
    if (projectile) {
      g.fillStyle(0xffffff, 1).fillCircle(MINIMAP.x + projectile.x * this.mapScale, MINIMAP.y + Phaser.Math.Clamp(projectile.y, 0, terrainHeight) * sy, 2.5);
    }
  }

  /** Big centred message that fades away (e.g. "ตาของผู้เล่น 1") */
  banner(text: string, color = '#ffffff') {
    // A new message replaces the old one instead of piling on top of it
    if (this.lastBanner?.active) {
      this.scene.tweens.killTweensOf(this.lastBanner);
      this.lastBanner.destroy();
    }
    const t = this.scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, text, textStyle(52, color))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.overlay)
      .setScale(0.6)
      .setAlpha(0);
    this.scene.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 220, ease: 'Back.out' });
    this.scene.tweens.add({ targets: t, alpha: 0, y: t.y - 30, delay: 1000, duration: 400, onComplete: () => t.destroy() });
    this.lastBanner = t;
  }

  /** Big number in the middle of the screen for the last seconds of a turn (5, 4, 3, 2, 1) */
  countdown(n: number) {
    this.clearCountdown();
    const t = this.scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, String(n), { ...textStyle(140, n <= 3 ? '#ff5544' : '#ffcc33'), strokeThickness: 12 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.overlay)
      .setScale(1.8)
      .setAlpha(0);
    // Slam in, hold, then fade before the next number
    this.scene.tweens.add({ targets: t, alpha: 0.9, scale: 1, duration: 200, ease: 'Back.out' });
    this.scene.tweens.add({ targets: t, alpha: 0, scale: 0.8, delay: 600, duration: 300, onComplete: () => t.destroy() });
    this.countdownText = t;
  }

  clearCountdown() {
    if (!this.countdownText?.active) return;
    this.scene.tweens.killTweensOf(this.countdownText);
    this.countdownText.destroy();
  }
}

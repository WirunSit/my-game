import * as Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH } from '../config';

// Phase 0 placeholder screen: proves Phaser, the Thai font and scaling work.
// Replaced by the real menu in later phases.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    this.drawBackground();

    this.add
      .text(GAME_WIDTH / 2, 200, 'SciBoom!', {
        fontFamily: FONT_FAMILY,
        fontSize: '96px',
        fontStyle: '700',
        color: '#ffcc33',
        stroke: '#1b1d3a',
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 290, 'บูมวิทย์ — เกมยิงวิทยาศาสตร์ ม.1', {
        fontFamily: FONT_FAMILY,
        fontSize: '36px',
        color: '#ffffff',
        stroke: '#1b1d3a',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 360, 'ขั้นที่ 0: ตั้งโปรเจคสำเร็จ ✔ — แตะหรือคลิกเพื่อยิงลูกทดสอบ', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        color: '#c8f7c5',
      })
      .setOrigin(0.5);

    // Tap/click anywhere: lob a test ball in an arc toward that point
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.lobBall(p.x, p.y));
  }

  private drawBackground() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x6ec6ff, 0x6ec6ff, 0xffd59e, 0xffd59e, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Rolling placeholder hills (real terrain arrives in phase 1)
    g.fillStyle(0x5fb34a, 1);
    g.beginPath();
    g.moveTo(0, GAME_HEIGHT);
    for (let x = 0; x <= GAME_WIDTH; x += 20) {
      const y = 560 + Math.sin(x / 140) * 40 + Math.sin(x / 57) * 12;
      g.lineTo(x, y);
    }
    g.lineTo(GAME_WIDTH, GAME_HEIGHT);
    g.closePath();
    g.fillPath();
  }

  private lobBall(targetX: number, targetY: number) {
    const startX = 80;
    const startY = 520;
    const ball = this.add.circle(startX, startY, 12, 0x333344).setStrokeStyle(3, 0x111122);
    const peakY = Math.min(startY, targetY) - 180;

    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 900,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        // Quadratic bezier: start -> peak -> target
        const midX = (startX + targetX) / 2;
        ball.x = (1 - t) ** 2 * startX + 2 * (1 - t) * t * midX + t ** 2 * targetX;
        ball.y = (1 - t) ** 2 * startY + 2 * (1 - t) * t * peakY + t ** 2 * targetY;
      },
      onComplete: () => {
        ball.destroy();
        const boom = this.add.circle(targetX, targetY, 10, 0xffaa22);
        this.tweens.add({
          targets: boom,
          radius: 50,
          alpha: 0,
          duration: 350,
          onComplete: () => boom.destroy(),
        });
      },
    });
  }
}

import * as Phaser from 'phaser';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';

const BTN = 92;

/**
 * Keyboard (← → move, ↑ ↓ aim, Space fire — also A/D/W/S) plus big on-screen
 * buttons for phones and tablets. Read the current state every frame.
 */
export class Controls {
  onFireDown: () => void = () => {};
  onFireUp: () => void = () => {};

  private readonly held = { left: false, right: false, up: false, down: false };
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key>;
  private fireHeld = false;

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys.SPACE.on('down', () => this.pressFire());
    this.keys.SPACE.on('up', () => this.releaseFire());

    const y = GAME_HEIGHT - 70;
    this.holdButton(80, y, 180, 'left');
    this.holdButton(80 + BTN + 14, y, 0, 'right');
    this.holdButton(GAME_WIDTH - 330, y, -90, 'up');
    this.holdButton(GAME_WIDTH - 230, y, 90, 'down');
    this.fireButton(GAME_WIDTH - 95, y - 10);
  }

  /** -1 left, 1 right, 0 none */
  get moveDir(): -1 | 0 | 1 {
    const l = this.held.left || this.keys.LEFT.isDown || this.keys.A.isDown;
    const r = this.held.right || this.keys.RIGHT.isDown || this.keys.D.isDown;
    return l === r ? 0 : l ? -1 : 1;
  }

  /** 1 raise aim, -1 lower aim, 0 none */
  get aimDir(): -1 | 0 | 1 {
    const u = this.held.up || this.keys.UP.isDown || this.keys.W.isDown;
    const d = this.held.down || this.keys.DOWN.isDown || this.keys.S.isDown;
    return u === d ? 0 : u ? 1 : -1;
  }

  private pressFire() {
    if (this.fireHeld) return;
    this.fireHeld = true;
    this.onFireDown();
  }

  private releaseFire() {
    if (!this.fireHeld) return;
    this.fireHeld = false;
    this.onFireUp();
  }

  private holdButton(x: number, y: number, angleDeg: number, dir: keyof Controls['held']) {
    const img = this.scene.add.image(x, y, 'ui/btn_arrow').setScrollFactor(0).setDepth(DEPTH.hud).setAlpha(0.85);
    img.setScale(BTN / img.width).setAngle(angleDeg);
    const base = img.scale;
    img.setInteractive();
    const press = () => {
      this.held[dir] = true;
      img.setScale(base * 0.9);
    };
    const release = () => {
      this.held[dir] = false;
      img.setScale(base);
    };
    img.on('pointerdown', press);
    img.on('pointerup', release);
    img.on('pointerout', release);
  }

  private fireButton(x: number, y: number) {
    const img = this.scene.add.image(x, y, 'ui/btn_fire').setScrollFactor(0).setDepth(DEPTH.hud);
    img.setScale(150 / img.width);
    const base = img.scale;
    this.scene.add
      .text(x, y - 8, 'ยิง!', {
        fontFamily: FONT_FAMILY,
        fontSize: '34px',
        fontStyle: '700',
        color: '#ffffff',
        stroke: TEXT_STROKE,
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);
    img.setInteractive();
    img.on('pointerdown', () => {
      img.setScale(base * 0.92);
      this.pressFire();
    });
    const release = () => {
      img.setScale(base);
      this.releaseFire();
    };
    img.on('pointerup', release);
    img.on('pointerout', release);
  }
}

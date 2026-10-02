import * as Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import { addTextButton } from '../ui/TextButton';
import { drawSkyBackground } from '../game/background';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    drawSkyBackground(this, GAME_WIDTH, false);

    this.add
      .text(GAME_WIDTH / 2, 120, 'SciBoom!', {
        fontFamily: FONT_FAMILY,
        fontSize: '110px',
        fontStyle: '700',
        color: '#ffcc33',
        stroke: TEXT_STROKE,
        strokeThickness: 12,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 215, 'บูมวิทย์ — เกมยิงวิทยาศาสตร์ ม.1', {
        fontFamily: FONT_FAMILY,
        fontSize: '34px',
        color: '#ffffff',
        stroke: TEXT_STROKE,
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    // Mascots either side of the buttons
    const boy = this.add.image(250, 560, 'characters/boy_front').setOrigin(0.5, 1);
    boy.setScale(300 / boy.height);
    const girl = this.add.image(GAME_WIDTH - 250, 560, 'characters/girl_front').setOrigin(0.5, 1);
    girl.setScale(300 / girl.height);
    for (const [img, delay] of [[boy, 0], [girl, 400]] as const) {
      this.tweens.add({ targets: img, y: img.y - 12, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay });
    }

    addTextButton(this, GAME_WIDTH / 2, 330, 'เล่น 2 คน (เครื่องเดียวกัน)', () => this.scene.start('Battle'), {
      width: 460,
    });
    addTextButton(this, GAME_WIDTH / 2, 420, 'ด่านบอส (เร็ว ๆ นี้)', () => {}, { width: 460, disabled: true });
    addTextButton(this, GAME_WIDTH / 2, 510, 'PvP ออนไลน์ (เร็ว ๆ นี้)', () => {}, { width: 460, disabled: true });

    // Phones: fullscreen hides the browser bar and gives a bigger game
    if (this.sys.game.device.input.touch) {
      addTextButton(this, GAME_WIDTH / 2, 620, 'เต็มจอ', () => this.goFullscreen(), {
        width: 220,
        height: 56,
        fontSize: 24,
        color: 0x3a8dde,
      });
    }

    this.add
      .text(GAME_WIDTH - 12, GAME_HEIGHT - 10, 'ขั้นที่ 1: ระบบยิง', { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#ffffff' })
      .setOrigin(1, 1)
      .setAlpha(0.7);
  }

  private goFullscreen() {
    if (!this.scale.isFullscreen) this.scale.startFullscreen();
    // Android Chrome allows locking to landscape once fullscreen; other browsers ignore it
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    orientation.lock?.('landscape').catch(() => {});
  }
}

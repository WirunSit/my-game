import * as Phaser from 'phaser';
import { FONT_FAMILY, GAME_WIDTH, TEXT_STROKE } from '../config';
import { addTextButton } from '../ui/TextButton';
import { drawArtBackground } from '../game/background';
import { logout } from '../net/account';
import { session } from '../net/session';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    drawArtBackground(this, 'backgrounds/menu_school', GAME_WIDTH, 0);
    // Soft dark band behind the buttons so they stay readable over the busy picture
    this.add.rectangle(GAME_WIDTH / 2, 420, 560, 300, 0x1b1d3a, 0.35).setStrokeStyle(0);

    const logo = this.add.image(GAME_WIDTH / 2, 115, 'ui/logo');
    logo.setScale(560 / logo.width);
    this.tweens.add({ targets: logo, scale: logo.scale * 1.04, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.add
      .text(GAME_WIDTH / 2, 228, 'บูมวิทย์ — เกมยิงวิทยาศาสตร์ ม.1', {
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
    addTextButton(this, GAME_WIDTH / 2, 420, 'ผจญภัย (ด่านบอส)', () => this.scene.start('WorldMap'), { width: 460, color: 0x8a5cf6 });
    addTextButton(this, GAME_WIDTH / 2, 510, 'เล่นกับเพื่อน (ออนไลน์)', () => this.scene.start('Lobby'), { width: 460, color: 0x2fbf5b });

    // Phones: fullscreen hides the browser bar and gives a bigger game
    if (this.sys.game.device.input.touch) {
      addTextButton(this, GAME_WIDTH / 2, 620, 'เต็มจอ', () => this.goFullscreen(), {
        width: 220,
        height: 56,
        fontSize: 24,
        color: 0x3a8dde,
      });
    }
    this.accountBox();
  }

  /** Top-left: who is playing, with log in / log out */
  private accountBox() {
    const style = { fontFamily: FONT_FAMILY, fontSize: '22px', fontStyle: '700', color: '#ffffff', stroke: TEXT_STROKE, strokeThickness: 4, padding: { top: 6 } };
    const p = session.profile;
    if (p && session.token) {
      this.add.text(24, 22, `สวัสดี ${p.nickname}`, { ...style, color: '#ffcc33' });
      this.add.text(24, 56, `${p.classroom.name} เลขที่ ${p.number}`, { ...style, fontSize: '18px' });
      addTextButton(this, 110, 118, 'ออกจากระบบ', () => void logout().then(() => this.scene.restart()), { width: 180, height: 46, fontSize: 18, color: 0x8a8fa8 });
    } else {
      this.add.text(24, 22, 'ยังไม่ได้เข้าสู่ระบบ', { ...style, fontSize: '18px' });
      addTextButton(this, 120, 80, 'เข้าสู่ระบบ', () => this.scene.start('Login'), { width: 200, height: 54, fontSize: 22, color: 0xff8a1f });
    }
  }

  private goFullscreen() {
    if (!this.scale.isFullscreen) this.scale.startFullscreen();
    // Android Chrome allows locking to landscape once fullscreen; other browsers ignore it
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    orientation.lock?.('landscape').catch(() => {});
  }
}

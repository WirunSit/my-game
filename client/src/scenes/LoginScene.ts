import * as Phaser from 'phaser';
import { startMusic } from '../audio/Sound';
import { PIN_LENGTH, defaultNickname } from '@sciboom/shared';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import { drawArtBackground } from '../game/background';
import { loginStudent, setNickname } from '../net/account';
import { session } from '../net/session';
import { addTextButton } from '../ui/TextButton';
import { addTextInput } from '../ui/TextInput';

const text = (size: number, color = '#ffffff'): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT_FAMILY,
  fontSize: `${size}px`,
  fontStyle: '700',
  color,
  stroke: TEXT_STROKE,
  strokeThickness: Math.max(3, size / 6),
  padding: { top: 6 },
});

/** Student login: classroom code + number + 4-digit PIN (from the teacher's PIN sheet), then a nickname */
export class LoginScene extends Phaser.Scene {
  private message!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('Login');
  }

  create() {
    startMusic('menu');
    this.busy = false;
    drawArtBackground(this, 'backgrounds/menu_school', GAME_WIDTH, 0);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0c1f, 0.5).setOrigin(0);
    const g = this.add.graphics();
    g.fillStyle(0x1b1d3a, 0.9).fillRoundedRect(GAME_WIDTH / 2 - 380, 70, 760, 560, 26);
    g.lineStyle(5, 0xffcc33, 1).strokeRoundedRect(GAME_WIDTH / 2 - 380, 70, 760, 560, 26);
    this.message = this.add.text(GAME_WIDTH / 2, 545, '', text(20, '#ff9a9a')).setOrigin(0.5);
    addTextButton(this, 150, GAME_HEIGHT - 44, 'กลับ', () => this.scene.start('Menu'), { width: 200, height: 58, fontSize: 24, color: 0x3a8dde });
    this.showLogin();
  }

  private clearForm() {
    this.children.list.filter((c) => c instanceof Phaser.GameObjects.DOMElement || c.getData?.('form')).forEach((c) => c.destroy());
    this.message.setText('');
  }

  private form<T extends Phaser.GameObjects.GameObject>(o: T): T {
    o.setData('form', true);
    return o;
  }

  private showLogin() {
    this.clearForm();
    const cx = GAME_WIDTH / 2;
    this.form(this.add.text(cx, 115, 'เข้าสู่ระบบนักเรียน', text(36, '#ffcc33')).setOrigin(0.5));
    this.form(this.add.text(cx, 160, 'ดูรหัสห้องเรียน เลขที่ และ PIN จากใบที่ครูให้', text(18, '#bfe8ff')).setOrigin(0.5));

    const row = (y: number, label: string) => this.form(this.add.text(cx - 330, y, label, text(24)).setOrigin(0, 0.5));
    row(235, 'รหัสห้องเรียน');
    const code = addTextInput(this, cx + 110, 235, { width: 360, maxLength: 20, uppercase: true, placeholder: 'เช่น M1-3-2569' });
    row(325, 'เลขที่');
    const number = addTextInput(this, cx + 110, 325, { width: 360, maxLength: 3, mode: 'numeric', placeholder: 'เช่น 12' });
    row(415, 'PIN 4 หลัก');
    const pin = addTextInput(this, cx + 110, 415, { width: 360, maxLength: PIN_LENGTH, mode: 'numeric', password: true, placeholder: '••••' });
    if (session.profile) code.value = session.profile.classroom.code;

    const submit = async () => {
      if (this.busy) return;
      const n = Number(number.value.trim());
      if (!code.value.trim() || !Number.isInteger(n) || n < 1 || pin.value.trim().length !== PIN_LENGTH) {
        this.message.setText('กรอกให้ครบ: รหัสห้องเรียน เลขที่ และ PIN 4 หลัก');
        return;
      }
      this.busy = true;
      this.message.setColor('#bfe8ff').setText('กำลังเข้าสู่ระบบ...');
      try {
        const profile = await loginStudent(code.value.trim(), n, pin.value.trim());
        // Still the automatic "นักเรียน #12"? Let them pick a nickname
        if (profile.nickname === defaultNickname(profile.number)) this.showNickname();
        else this.scene.start('Menu');
      } catch (e) {
        this.message.setColor('#ff9a9a').setText((e as Error).message);
      } finally {
        this.busy = false;
      }
    };
    for (const el of [code, number, pin]) el.addEventListener('keydown', (e) => e.key === 'Enter' && void submit());
    this.form(addTextButton(this, cx, 495, 'เข้าสู่ระบบ', () => void submit(), { width: 320, height: 64, fontSize: 28, color: 0x2fbf5b }));
    this.form(addTextButton(this, cx, 595, 'เล่นโดยไม่เข้าสู่ระบบ', () => this.scene.start('Menu'), { width: 320, height: 50, fontSize: 20, color: 0x8a8fa8 }));
  }

  private showNickname() {
    this.clearForm();
    const cx = GAME_WIDTH / 2;
    const p = session.profile!;
    this.form(this.add.text(cx, 125, `สวัสดี! ${p.classroom.name} เลขที่ ${p.number}`, text(32, '#ffcc33')).setOrigin(0.5));
    this.form(this.add.text(cx, 200, 'ตั้งชื่อเล่นที่เพื่อน ๆ จะเห็นในเกม', text(24)).setOrigin(0.5));
    this.form(this.add.text(cx, 240, 'ห้ามใช้คำไม่สุภาพ (ไม่ต้องใช้ชื่อจริง)', text(18, '#bfe8ff')).setOrigin(0.5));
    const name = addTextInput(this, cx, 320, { width: 420, maxLength: 16, placeholder: 'ชื่อเล่น' });
    const save = async () => {
      if (this.busy) return;
      this.busy = true;
      const problem = await setNickname(name.value);
      this.busy = false;
      if (problem) this.message.setColor('#ff9a9a').setText(problem);
      else this.scene.start('Menu');
    };
    name.addEventListener('keydown', (e) => e.key === 'Enter' && void save());
    this.form(addTextButton(this, cx, 430, 'บันทึกชื่อเล่น', () => void save(), { width: 320, height: 64, fontSize: 28, color: 0x2fbf5b }));
    this.form(addTextButton(this, cx, 510, `ใช้ "${p.nickname}" ไปก่อน`, () => this.scene.start('Menu'), { width: 320, height: 50, fontSize: 20, color: 0x8a8fa8 }));
  }
}

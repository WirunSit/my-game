import * as Phaser from 'phaser';
import { ROOM_CODE_LENGTH, weaponDef, type ServerMessage } from '@sciboom/shared';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import { drawArtBackground } from '../game/background';
import { Net } from '../net/Net';
import { equippedWeapon, loadSave, updateSave } from '../save';
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

/** Online PvP: make a room (get a code to give a friend) or join one with a code */
export class LobbyScene extends Phaser.Scene {
  private net: Net | null = null;
  private status!: Phaser.GameObjects.Text;
  private quizDuel = false;
  private panel: Phaser.GameObjects.GameObject[] = [];
  private leaving = false;

  constructor() {
    super('Lobby');
  }

  create() {
    this.net = null;
    this.leaving = false;
    this.panel = [];
    drawArtBackground(this, 'backgrounds/pvp_arena', GAME_WIDTH, 0);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0c1f, 0.55).setOrigin(0);
    this.add.text(GAME_WIDTH / 2, 50, 'เล่นกับเพื่อน (ออนไลน์)', text(40, '#ffcc33')).setOrigin(0.5);
    this.status = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 110, 'กำลังเชื่อมต่อ...', text(22, '#bfe8ff')).setOrigin(0.5);
    addTextButton(this, 120, GAME_HEIGHT - 44, 'กลับ', () => this.back(), { width: 180, height: 58, fontSize: 24, color: 0x3a8dde });
    this.events.once('shutdown', () => {
      // Leaving the lobby for anything but a match closes the connection
      if (this.leaving) this.net?.close();
    });
    void this.connect();
  }

  private async connect() {
    try {
      this.net = await Net.connect();
    } catch {
      this.status.setText('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง (ต้องเปิดด้วย npm run dev)').setColor('#ff9a9a');
      addTextButton(this, GAME_WIDTH / 2, GAME_HEIGHT - 180, 'ลองใหม่', () => this.scene.restart(), { width: 220, height: 58, fontSize: 24 });
      return;
    }
    const save = loadSave();
    this.net.send({
      t: 'hello',
      name: save.nickname || session.nickname || 'ผู้เล่น',
      character: save.character,
      outfit: save.outfit,
      level: save.level,
      weaponId: weaponDef(equippedWeapon(save).id).id,
      token: session.token ?? undefined,
    });
    this.net.onClose = () => this.status.setText('การเชื่อมต่อหลุด กด "กลับ" แล้วเข้าใหม่').setColor('#ff9a9a');
    this.status.setText('');
    this.showChoices();
    void this.listen();
  }

  /** Two cards: make a room, or join one */
  private showChoices() {
    this.clearPanel();
    const save = loadSave();
    const card = (x: number, title: string) => {
      const g = this.add.graphics();
      g.fillStyle(0x1b1d3a, 0.85).fillRoundedRect(x - 270, 120, 540, 420, 24);
      g.lineStyle(4, 0xffcc33, 1).strokeRoundedRect(x - 270, 120, 540, 420, 24);
      this.panel.push(g, this.add.text(x, 160, title, text(30, '#ffcc33')).setOrigin(0.5));
    };

    // Left: name + create
    card(340, 'สร้างห้องใหม่');
    this.panel.push(this.add.text(340, 220, 'ชื่อที่เพื่อนจะเห็น', text(20)).setOrigin(0.5));
    const name = addTextInput(this, 340, 270, { width: 360, maxLength: 16, value: save.nickname || session.nickname || '', placeholder: 'ชื่อเล่น' });
    const toggle = this.add.text(340, 350, '', text(22)).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const drawToggle = () => toggle.setText(`${this.quizDuel ? '[x]' : '[ ]'} Quiz Duel: ตอบคำถามก่อนยิงทุกตา`);
    drawToggle();
    toggle.on('pointerup', () => {
      this.quizDuel = !this.quizDuel;
      drawToggle();
    });
    this.panel.push(toggle, this.add.text(340, 385, 'ตอบถูก ยิงแรงขึ้น 15% และเติมเกจไม้ตาย', text(16, '#bfe8ff')).setOrigin(0.5));
    this.panel.push(
      addTextButton(this, 340, 470, 'สร้างห้อง', () => {
        this.saveName(name.value);
        this.net?.send({ t: 'create', quizDuel: this.quizDuel });
      }, { width: 300, color: 0x2fbf5b }),
    );

    // Right: join with a code
    card(940, 'เข้าห้องของเพื่อน');
    this.panel.push(this.add.text(940, 220, `ใส่รหัสห้อง ${ROOM_CODE_LENGTH} ตัว`, text(20)).setOrigin(0.5));
    const code = addTextInput(this, 940, 290, { width: 300, fontSize: 44, maxLength: ROOM_CODE_LENGTH, uppercase: true, placeholder: 'ABCDE' });
    const join = () => {
      if (code.value.trim().length !== ROOM_CODE_LENGTH) {
        this.status.setText(`รหัสห้องต้องมี ${ROOM_CODE_LENGTH} ตัว`).setColor('#ff9a9a');
        return;
      }
      this.saveName(name.value);
      this.net?.send({ t: 'join', code: code.value.trim() });
      this.status.setText('กำลังเข้าห้อง...').setColor('#bfe8ff');
    };
    code.addEventListener('keydown', (e) => e.key === 'Enter' && join());
    this.panel.push(addTextButton(this, 940, 470, 'เข้าห้อง', join, { width: 300, color: 0x8a5cf6 }));
  }

  private saveName(value: string) {
    const nickname = value.trim().slice(0, 16);
    updateSave((d) => (d.nickname = nickname));
    // The server reads the name from "hello": send it again with the new name
    const save = loadSave();
    this.net?.send({
      t: 'hello',
      name: nickname || session.nickname || 'ผู้เล่น',
      character: save.character,
      outfit: save.outfit,
      level: save.level,
      weaponId: weaponDef(equippedWeapon(save).id).id,
      token: session.token ?? undefined,
    });
  }

  /** Waiting for a friend: show the code big */
  private showWaiting(code: string, quizDuel: boolean) {
    this.clearPanel();
    const g = this.add.graphics();
    g.fillStyle(0x1b1d3a, 0.9).fillRoundedRect(GAME_WIDTH / 2 - 360, 130, 720, 420, 26);
    g.lineStyle(5, 0xffcc33, 1).strokeRoundedRect(GAME_WIDTH / 2 - 360, 130, 720, 420, 26);
    const codeText = this.add.text(GAME_WIDTH / 2, 290, code, text(110, '#ffffff')).setOrigin(0.5);
    this.panel.push(
      g,
      this.add.text(GAME_WIDTH / 2, 180, 'รหัสห้องของคุณ', text(28, '#ffcc33')).setOrigin(0.5),
      codeText,
      this.add.text(GAME_WIDTH / 2, 400, 'บอกรหัสนี้ให้เพื่อน แล้วรอเพื่อนเข้าห้อง...', text(24)).setOrigin(0.5),
      this.add.text(GAME_WIDTH / 2, 440, quizDuel ? 'โหมด Quiz Duel' : 'โหมดปกติ', text(20, '#bfe8ff')).setOrigin(0.5),
      addTextButton(this, GAME_WIDTH / 2, 505, 'ยกเลิก', () => {
        this.net?.send({ t: 'leave' });
        this.showChoices();
      }, { width: 220, height: 56, fontSize: 24, color: 0xe5484d }),
    );
    this.tweens.add({ targets: codeText, scale: 1.06, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  private async listen() {
    const net = this.net!;
    for (;;) {
      const msg: ServerMessage = await net.next();
      if (!this.scene.isActive()) return;
      if (msg.t === 'created') this.showWaiting(msg.code, msg.quizDuel);
      else if (msg.t === 'error') this.status.setText(msg.message).setColor('#ff9a9a');
      else if (msg.t === 'start') {
        this.scene.start('Online', { net, start: msg });
        return;
      }
    }
  }

  private clearPanel() {
    for (const o of this.panel) o.destroy();
    this.panel = [];
    // Text boxes live in Phaser DOM elements
    this.children.list.filter((c) => c instanceof Phaser.GameObjects.DOMElement).forEach((c) => c.destroy());
  }

  private back() {
    this.leaving = true;
    this.scene.start('Menu');
  }
}

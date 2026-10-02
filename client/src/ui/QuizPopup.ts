import * as Phaser from 'phaser';
import type { QuizItem } from '@sciboom/shared';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import { wrapThai } from './thaiWrap';

export interface QuizResult {
  correct: boolean;
  /** -1 if time ran out */
  chosen: number;
  timeMs: number;
}

const PANEL_W = 1060;
const PANEL_H = 620;
const LABELS = ['ก', 'ข', 'ค', 'ง'];
const COLORS = { normal: 0x3a8dde, right: 0x2fbf5b, wrong: 0xe5484d, dim: 0x8a8fa8 };

/**
 * Full-screen multiple-choice question. Tap/click a choice or press 1–4.
 * Wrong answers (or running out of time) show the correct answer and the
 * explanation, and wait for the student to tap "เข้าใจแล้ว".
 */
export function showQuiz(scene: Phaser.Scene, item: QuizItem, opts: { title: string; seconds?: number }): Promise<QuizResult> {
  const seconds = opts.seconds ?? 20;
  const cx = GAME_WIDTH / 2;
  const top = (GAME_HEIGHT - PANEL_H) / 2;
  const objects: Phaser.GameObjects.GameObject[] = [];
  const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(DEPTH.overlay + 10);
    objects.push(o);
    return o;
  };

  // Dim the battle and block taps on it
  keep(scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0c1f, 0.7).setOrigin(0).setInteractive());

  const panel = keep(scene.add.graphics());
  panel.fillStyle(0x000000, 0.3).fillRoundedRect(cx - PANEL_W / 2 + 6, top + 10, PANEL_W, PANEL_H, 28);
  panel.fillStyle(0xfff8e7, 1).fillRoundedRect(cx - PANEL_W / 2, top, PANEL_W, PANEL_H, 28);
  panel.lineStyle(6, 0x1b1d3a, 1).strokeRoundedRect(cx - PANEL_W / 2, top, PANEL_W, PANEL_H, 28);
  panel.fillStyle(0xff8a1f, 1).fillRoundedRect(cx - PANEL_W / 2, top, PANEL_W, 64, { tl: 28, tr: 28, bl: 0, br: 0 });

  keep(
    scene.add
      .text(cx, top + 32, opts.title, {
        fontFamily: FONT_FAMILY,
        fontSize: '30px',
        fontStyle: '700',
        color: '#ffffff',
        stroke: TEXT_STROKE,
        strokeThickness: 5,
        padding: { top: 6 },
      })
      .setOrigin(0.5),
  );
  const book = keep(scene.add.image(cx - PANEL_W / 2 + 46, top + 32, 'ui/book'));
  book.setScale(48 / book.height);

  // Timer bar
  const barW = PANEL_W - 80;
  keep(scene.add.rectangle(cx - barW / 2, top + 84, barW, 12, 0xd9d2c0).setOrigin(0, 0.5));
  const timerBar = keep(scene.add.rectangle(cx - barW / 2, top + 84, barW, 12, 0xffb020).setOrigin(0, 0.5));

  // Question text
  const qFont = { size: 30, weight: '700' };
  keep(
    scene.add
      .text(cx, top + 108, wrapThai(item.question.question, `${qFont.weight} ${qFont.size}px Kanit`, PANEL_W - 100), {
        fontFamily: FONT_FAMILY,
        fontSize: `${qFont.size}px`,
        fontStyle: qFont.weight,
        color: '#1b1d3a',
        align: 'center',
        lineSpacing: 6,
        padding: { top: 8 },
      })
      .setOrigin(0.5, 0),
  );

  // 2×2 choice buttons
  const btnW = 480;
  const btnH = 104;
  const gridTop = top + 250;
  const buttons = item.choices.map((choice, i) => {
    const bx = cx + (i % 2 === 0 ? -1 : 1) * (btnW / 2 + 12);
    const by = gridTop + Math.floor(i / 2) * (btnH + 18) + btnH / 2;
    const g = scene.add.graphics();
    const draw = (color: number) => {
      g.clear();
      g.fillStyle(0x000000, 0.25).fillRoundedRect(-btnW / 2 + 3, -btnH / 2 + 5, btnW, btnH, 18);
      g.fillStyle(color, 1).fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 18);
      g.lineStyle(4, 0x1b1d3a, 1).strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 18);
      g.fillStyle(0xffffff, 0.9).fillCircle(-btnW / 2 + 38, 0, 24);
    };
    draw(COLORS.normal);
    const letter = scene.add
      .text(-btnW / 2 + 38, 0, LABELS[i], { fontFamily: FONT_FAMILY, fontSize: '28px', fontStyle: '700', color: '#1b1d3a', padding: { top: 6 } })
      .setOrigin(0.5);
    const label = scene.add
      .text(-btnW / 2 + 76, 0, wrapThai(choice, '700 24px Kanit', btnW - 100), {
        fontFamily: FONT_FAMILY,
        fontSize: '24px',
        fontStyle: '700',
        color: '#ffffff',
        stroke: TEXT_STROKE,
        strokeThickness: 3,
        lineSpacing: 2,
        padding: { top: 6 },
      })
      .setOrigin(0, 0.5);
    const c = keep(scene.add.container(bx, by, [g, letter, label]).setSize(btnW, btnH));
    c.setInteractive({ useHandCursor: true });
    return { container: c, draw };
  });

  return new Promise<QuizResult>((resolve) => {
    const started = scene.time.now;
    let done = false;
    const keys = scene.input.keyboard!;

    const tick = scene.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => {
        const left = 1 - (scene.time.now - started) / (seconds * 1000);
        timerBar.width = barW * Math.max(0, left);
        timerBar.fillColor = left < 0.25 ? 0xe5484d : 0xffb020;
        if (left <= 0) answer(-1);
      },
    });

    const onKey = (e: KeyboardEvent) => {
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0 && i < buttons.length) answer(i);
    };
    keys.on('keydown', onKey);
    buttons.forEach((b, i) => b.container.on('pointerup', () => answer(i)));

    function answer(chosen: number) {
      if (done) return;
      done = true;
      tick.remove();
      keys.off('keydown', onKey);
      const correct = chosen === item.correctIndex;
      const timeMs = scene.time.now - started;
      buttons.forEach((b, i) => {
        b.container.disableInteractive();
        b.draw(i === item.correctIndex ? COLORS.right : i === chosen ? COLORS.wrong : COLORS.dim);
      });
      scene.tweens.add({ targets: buttons[item.correctIndex].container, scale: 1.05, duration: 160, yoyo: true, repeat: 1 });
      let closed = false;
      showFeedback(correct, chosen === -1, () => {
        if (closed) return;
        closed = true;
        objects.forEach((o) => o.destroy());
        resolve({ correct, chosen, timeMs });
      });
    }
  });

  /** Verdict + explanation, then a continue button */
  function showFeedback(correct: boolean, timedOut: boolean, close: () => void) {
    const fy = gridTop + 2 * (btnH + 18) + 6;
    const verdict = correct ? 'ถูกต้อง! เก่งมาก' : timedOut ? 'หมดเวลา!' : 'ยังไม่ถูกนะ';
    keep(
      scene.add
        .text(cx - PANEL_W / 2 + 40, fy, verdict, {
          fontFamily: FONT_FAMILY,
          fontSize: '28px',
          fontStyle: '700',
          color: correct ? '#1f9d4a' : '#d43b40',
          padding: { top: 6 },
        })
        .setOrigin(0, 0),
    );
    keep(
      scene.add
        .text(cx - PANEL_W / 2 + 40, fy + 40, wrapThai(item.question.explanation, '400 21px Kanit', PANEL_W - 330), {
          fontFamily: FONT_FAMILY,
          fontSize: '21px',
          color: '#33354d',
          lineSpacing: 2,
          padding: { top: 6 },
        })
        .setOrigin(0, 0),
    );

    // Continue button (wrong answers: short pause first so the explanation gets read)
    const bx = cx + PANEL_W / 2 - 140;
    const by = top + PANEL_H - 52;
    const g = scene.add.graphics();
    g.fillStyle(correct ? 0x2fbf5b : 0xff8a1f, 1).fillRoundedRect(-110, -32, 220, 64, 18);
    g.lineStyle(4, 0x1b1d3a, 1).strokeRoundedRect(-110, -32, 220, 64, 18);
    const t = scene.add
      .text(0, 0, correct ? 'ไปต่อ' : 'เข้าใจแล้ว', {
        fontFamily: FONT_FAMILY,
        fontSize: '26px',
        fontStyle: '700',
        color: '#ffffff',
        stroke: TEXT_STROKE,
        strokeThickness: 4,
        padding: { top: 6 },
      })
      .setOrigin(0.5);
    const btn = keep(scene.add.container(bx, by, [g, t]).setSize(220, 64).setAlpha(0));
    const enable = () => {
      btn.setAlpha(1).setInteractive({ useHandCursor: true });
      btn.once('pointerup', close);
      scene.input.keyboard!.once('keydown-SPACE', close);
    };
    scene.time.delayedCall(correct ? 400 : 1800, enable);
  }
}

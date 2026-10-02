// Automated smoke test for online PvP: two separate browsers make and join a
// room, take turns shooting, check both screens agree, then one leaves.
// Needs `npm run dev` running (game + server). Usage: npm run playtest:online -w tools
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const URL = 'http://localhost:8080/';
const out = process.argv[2] ?? '../art/debug/playtest-online';
mkdirSync(out, { recursive: true });

// --disable-gpu: see playtest.mjs
const browser = await chromium.launch({ args: ['--disable-gpu'] });
const errors = [];
const isViteNoise = (t) => /websocket|\[vite\]/i.test(t);

async function player(name, character) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => isViteNoise(e.message) || errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !isViteNoise(m.text()) && errors.push(`${name} console: ${m.text()}`));
  await page.addInitScript(([n, c]) => localStorage.setItem('sciboom.save.v1', JSON.stringify({ nickname: n, character: c, level: 1 })), [name, character]);
  await page.goto(URL);
  await page.waitForFunction(() => window.game?.scene.isActive('Menu'));
  await page.mouse.click(640, 510); // "เล่นกับเพื่อน (ออนไลน์)"
  await page.waitForFunction(() => window.game.scene.getScene('Lobby')?.net?.isOpen, null, { timeout: 15_000 });
  await page.waitForTimeout(300);
  return page;
}

const shot = async (page, name) => {
  const dataUrl = await page.evaluate(() => {
    window.game.loop.pause();
    const url = window.game.canvas.toDataURL('image/jpeg', 0.85);
    window.game.loop.resume();
    return url;
  });
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`saved ${out}/${name}.jpg`);
};
const online = (page, expr) => page.evaluate(`(() => { const s = window.game.scene.getScene('Online'); return ${expr}; })()`);
const myTurn = (page) =>
  page.waitForFunction(() => {
    const s = window.game.scene.getScene('Online');
    return s?.phase === 'aiming' && s.human === s.me;
  }, null, { timeout: 60_000 });
const idle = (page) =>
  page.waitForFunction(() => {
    const s = window.game.scene.getScene('Online');
    return s && s.phase !== 'flying' && !s.human;
  }, null, { timeout: 60_000 });
const fire = async (page, ms = 900) => {
  await page.keyboard.down('Space');
  await page.waitForTimeout(ms);
  await page.keyboard.up('Space');
};

const a = await player('เอ', 'boy');
const b = await player('บี', 'girl');
await shot(a, '1-lobby');

// A makes a room
await a.mouse.click(340, 470);
await a.waitForFunction(() => window.game.scene.getScene('Lobby').children.list.some((o) => o.type === 'Text' && /^[A-Z2-9]{5}$/.test(o.text)));
const code = await a.evaluate(() => window.game.scene.getScene('Lobby').children.list.find((o) => o.type === 'Text' && /^[A-Z2-9]{5}$/.test(o.text)).text);
console.log('room code', code);
await shot(a, '2-waiting');

// B joins with the code
await b.fill('input[placeholder="ABCDE"]', code);
await b.mouse.click(940, 470);
await Promise.all([a, b].map((p) => p.waitForFunction(() => window.game.scene.isActive('Online'))));
await myTurn(a);
await shot(a, '3-a-turn');
await shot(b, '4-b-watching');

// A walks a bit (B should see it), then shoots
const bx0 = await online(b, 's.them.x');
await a.keyboard.down('ArrowRight');
await a.waitForTimeout(500);
await a.keyboard.up('ArrowRight');
await b.waitForFunction((x0) => Math.abs(window.game.scene.getScene('Online').them.x - x0) > 10, bx0, { timeout: 10_000 });
await fire(a);
await myTurn(b);
await shot(b, '5-b-turn');

// B camouflages, then shoots back with a triple shot
await b.keyboard.press('5');
await a.waitForFunction(() => window.game.scene.getScene('Online').them.hidden === true, null, { timeout: 10_000 });
await shot(a, '6-a-sees-camouflage');
await myTurn(b); // still B's turn
await b.keyboard.press('2');
await fire(b, 1100);
await myTurn(a);
await idle(b);

// Both screens agree on health and positions
const state = (page) => online(page, '[...s.fighters.values()].map((f) => ({ id: f.id, hp: f.hp, x: Math.round(f.x) })).sort((p, q) => p.id.localeCompare(q.id))');
const sa = await state(a);
const sb = await state(b);
assert.deepEqual(sa.map((f) => f.hp), sb.map((f) => f.hp), 'same health on both screens');
sa.forEach((f, i) => assert.ok(Math.abs(f.x - sb[i].x) <= 3, `same position for ${f.id}: ${f.x} vs ${sb[i].x}`));
assert.equal(await online(a, 's.them.hidden'), true, 'B stays camouflaged through A’s turn');

// B leaves: A wins
await b.mouse.click(790, 30); // "☰ ออก"
await a.waitForFunction(() => window.game.scene.getScene('Online').phase === 'over', null, { timeout: 15_000 });
await a.waitForTimeout(1200);
await shot(a, '7-a-wins');
const texts = await online(a, 's.children.list.filter((o) => o.type === "Text").map((o) => o.text)');
assert.ok(texts.some((t) => t.includes('คุณชนะ')), 'A sees the win');
assert.ok(texts.some((t) => t.includes('เพื่อนออกจากเกม')), 'A is told why');

// Round 2, Quiz Duel: both back in the lobby, A makes a Quiz Duel room
await a.mouse.click(640, 410); // "กลับห้องรอ" (the only button: no rematch after leaving)
await Promise.all([a, b].map((p) => p.waitForFunction(() => window.game.scene.getScene('Lobby')?.net?.isOpen, null, { timeout: 15_000 })));
await a.waitForTimeout(300);
await a.mouse.click(340, 350); // Quiz Duel toggle
await a.mouse.click(340, 470);
await a.waitForFunction(() => window.game.scene.getScene('Lobby').children.list.some((o) => o.type === 'Text' && /^[A-Z2-9]{5}$/.test(o.text)));
const code2 = await a.evaluate(() => window.game.scene.getScene('Lobby').children.list.find((o) => o.type === 'Text' && /^[A-Z2-9]{5}$/.test(o.text)).text);
await b.fill('input[placeholder="ABCDE"]', code2);
await b.mouse.click(940, 470);
await a.waitForFunction(() => window.game.scene.getScene('Online')?.phase === 'quiz', null, { timeout: 15_000 });
await a.waitForTimeout(600);
await shot(a, '8-quiz-duel');
await a.keyboard.press('1');
// Continue button of the quiz popup, then A can aim
await a.waitForFunction(() => window.game.scene.getScene('Online').children.list.some((o) => o.type === 'Container' && o.alpha === 1 && o.list?.some((t) => t.text === 'ไปต่อ' || t.text === 'เข้าใจแล้ว')));
// Hover first like a real player: with two games running, a same-frame press+release can be missed
await a.mouse.move(1030, 618);
await a.waitForTimeout(150);
await a.mouse.click(1030, 618);
await myTurn(a);
await fire(a);
// B gets a question on their turn too
await b.waitForFunction(() => window.game.scene.getScene('Online')?.phase === 'quiz', null, { timeout: 30_000 });
await shot(b, '9-b-quiz');
const answers = await a.evaluate(() => JSON.parse(localStorage.getItem('sciboom.save.v1')).answers.length);
assert.equal(answers, 1, 'the Quiz Duel answer is saved for the teacher');

await browser.close();
if (errors.length) {
  console.error('\nErrors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nOnline playtest passed, no JavaScript errors');

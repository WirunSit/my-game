// Automated smoke test for accounts (phase 6): the teacher pages and a student
// logging into the game, with progress reaching the teacher's statistics.
// Needs `npm run dev` running. Usage: npm run playtest:accounts -w tools
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = 'http://localhost:8080/';
const out = process.argv[2] ?? '../art/debug/playtest-accounts';
mkdirSync(out, { recursive: true });

// --disable-gpu: see playtest.mjs
const browser = await chromium.launch({ args: ['--disable-gpu'] });
const errors = [];
const watch = (page, who) => {
  page.on('pageerror', (e) => errors.push(`${who} pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/websocket|\[vite\]|401/i.test(m.text()) && errors.push(`${who} console: ${m.text()}`));
};
const snap = async (page, name) => {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log(`saved ${out}/${name}.png`);
};

// ---- Teacher ----------------------------------------------------------------------------
const teacher = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
watch(teacher, 'teacher');
await teacher.goto(BASE + 'teacher.html');
await teacher.getByText('สมัครบัญชีครู').waitFor();
await snap(teacher, '1-teacher-login');
const user = `kru${Date.now().toString(36)}`;
const reg = teacher.locator('form', { hasText: 'สมัครบัญชีครู' });
await reg.getByLabel('ชื่อผู้ใช้ (ภาษาอังกฤษ)').fill(user);
await reg.getByLabel('ชื่อที่แสดง').fill('ครูทดสอบ');
await reg.getByLabel('รหัสผ่าน').fill('password123');
await reg.getByRole('button', { name: 'สมัคร' }).click();
await teacher.getByText('สร้างห้องเรียนใหม่').waitFor();

const code = `T${Date.now().toString(36).toUpperCase().slice(-6)}`;
await teacher.getByLabel('ชื่อห้อง').fill('ม.1/9 ทดสอบ');
await teacher.getByLabel('รหัสห้องเรียน').fill(code);
await teacher.getByLabel('จำนวนนักเรียน').fill('3');
await teacher.getByRole('button', { name: 'สร้างห้อง' }).click();
await teacher.getByText('นักเรียนและ PIN').waitFor();
await snap(teacher, '2-students');
const pin = (await teacher.locator('tbody tr').first().locator('.pin').textContent()).trim();
assert.match(pin, /^\d{4}$/);

await teacher.getByRole('button', { name: 'พิมพ์ใบ PIN' }).click();
await teacher.locator('.pin-card').nth(2).waitFor();
assert.equal(await teacher.locator('.pin-card').count(), 3);
await snap(teacher, '3-pin-sheet');

// ---- Student logs into the game ------------------------------------------------------------
const student = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
watch(student, 'student');
await student.goto(BASE);
await student.waitForFunction(() => window.game?.scene.isActive('Menu'));
await student.mouse.move(120, 80);
await student.mouse.click(120, 80); // "เข้าสู่ระบบ"
await student.waitForFunction(() => window.game.scene.isActive('Login'));
await student.fill('input[placeholder="เช่น M1-3-2569"]', code.toLowerCase());
await student.fill('input[placeholder="เช่น 12"]', '1');
await student.fill('input[placeholder="••••"]', pin);
await student.keyboard.press('Enter');
await student.waitForFunction(() => window.game.scene.getScene('Login').children.list.some((o) => o.type === 'Text' && o.text.includes('ตั้งชื่อเล่น')), null, { timeout: 15_000 });
await snap(student, '4-nickname');
// A rude name is refused, a polite one is kept
await student.fill('input[placeholder="ชื่อเล่น"]', 'ค ว ย');
await student.keyboard.press('Enter');
await student.waitForFunction(() => window.game.scene.getScene('Login').message.text.includes('ไม่สุภาพ'));
await student.fill('input[placeholder="ชื่อเล่น"]', 'ต้นกล้า');
await student.keyboard.press('Enter');
await student.waitForFunction(() => window.game.scene.isActive('Menu'));
await student.waitForTimeout(500);
await snap(student, '5-menu-logged-in');

// Play: pretend a few questions were answered (as the stage would record them)
await student.evaluate(async () => {
  const save = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('sciboom.save.s.'))) ?? '{}');
  const now = Date.now();
  save.answers = [
    { id: 'u1-003', ok: false, ms: 8000, at: now - 3000 },
    { id: 'u1-003', ok: true, ms: 5000, at: now - 2000 },
    { id: 'u1-004', ok: true, ms: 4000, at: now - 1000 },
  ];
  save.level = 3;
  const key = Object.keys(localStorage).find((k) => k.startsWith('sciboom.save.s.'));
  localStorage.setItem(key, JSON.stringify(save));
  localStorage.setItem(key.replace('save.s.', 'dirty.'), '1');
});
// Any change in the game triggers a sync; use the real code path
await student.evaluate(() => window.game.scene.getScene('Menu').scene.start('Wardrobe', { from: 'Menu' }));
await student.waitForTimeout(400);
await student.mouse.move(486 + 68, 196 + 78);
await student.mouse.click(486 + 68, 196 + 78); // "ไม่ใส่" card: no change needed, so press a hat instead
await student.mouse.click(486 + 148 + 68, 196 + 78);
await student.waitForTimeout(2500);

// ---- Teacher sees it ----------------------------------------------------------------------------
await teacher.goto(BASE + 'teacher.html#/classes');
await teacher.getByText('ม.1/9 ทดสอบ').click();
await teacher.getByText('ต้นกล้า').waitFor({ timeout: 10_000 });
const row = teacher.locator('tbody tr').first();
assert.match(await row.textContent(), /2\/3/, 'answers counted');
await snap(teacher, '6-students-after-play');
await teacher.getByRole('link', { name: 'สถิติ' }).click();
await teacher.getByText('ข้อที่ผิดบ่อยที่สุด').waitFor();
await snap(teacher, '7-stats');
assert.equal((await teacher.locator('tbody tr').first().locator('td').first().textContent()).trim(), 'u1-003');

// Teacher closes world 1: the student can't start its stages
await teacher.getByRole('link', { name: 'ตั้งค่า' }).click();
await teacher.getByText('เปิดโลกตามบทเรียนที่สอนถึง').waitFor();
await teacher.getByLabel(/โลก 1:/).uncheck();
await teacher.getByRole('button', { name: 'บันทึก', exact: true }).click();
await teacher.getByText('บันทึกแล้ว').waitFor();
await snap(teacher, '8-settings');
await teacher.goto(BASE + 'teacher.html#/questions');
await teacher.getByText('เฉพาะที่ยังไม่ตรวจ').waitFor();
await snap(teacher, '9-questions');

await student.reload();
await student.waitForFunction(() => window.game?.scene.isActive('Menu'));
const open = await student.evaluate(() => JSON.parse(localStorage.getItem('sciboom.session.v1')).profile.classroom.openWorlds);
assert.deepEqual(open, [], 'world 1 closed for the student');
await student.evaluate(() => window.game.scene.getScene('Menu').scene.start('WorldMap'));
await student.waitForTimeout(800);
await snap(student, '10-world-closed');

await browser.close();
if (errors.length) {
  console.error('\nErrors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nAccounts playtest passed, no JavaScript errors');

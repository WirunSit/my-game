// Automated smoke test for the armory (phase 3): upgrade a weapon, fuse three
// copies, equip, and check the saved data. Needs `npm run dev` running.
// Usage: npm run playtest:inventory -w tools
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const URL = 'http://localhost:8080/';
const out = process.argv[2] ?? '../art/debug/playtest-inventory';
mkdirSync(out, { recursive: true });

// --disable-gpu: see playtest.mjs
const browser = await chromium.launch({ args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const isViteNoise = (t) => /websocket|\[vite\]/i.test(t);
page.on('pageerror', (e) => isViteNoise(e.message) || errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !isViteNoise(m.text()) && errors.push(`console: ${m.text()}`));

const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  const dataUrl = await page.evaluate(() => {
    window.game.loop.pause();
    const url = window.game.canvas.toDataURL('image/jpeg', 0.85);
    window.game.loop.resume();
    return url;
  });
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`saved ${out}/${name}.jpg`);
};
const save = async () => JSON.parse(await page.evaluate(() => localStorage.getItem('sciboom.save.v1')));

await page.addInitScript(() => {
  if (localStorage.getItem('sciboom.save.v1')) return; // keep changes across reloads
  const w = (uid, id, rarity = 1, level = 1) => ({ uid, id, rarity, level });
  localStorage.setItem(
    'sciboom.save.v1',
    JSON.stringify({
      character: 'boy',
      stars: { '1-1': 3 },
      crystals: 10,
      coins: 500,
      level: 4,
      exp: 120,
      weapons: [w('starter', 'starter_cannon'), w('b1', 'beaker_gun'), w('b2', 'beaker_gun'), w('b3', 'beaker_gun'), w('a1', 'atom_launcher', 3, 4)],
      equipped: 'starter',
      answers: [],
    }),
  );
});
await page.goto(URL);
await page.waitForFunction(() => window.game?.scene.isActive('Menu'));
await page.evaluate(() => window.game.scene.getScene('Menu').scene.start('Inventory', { from: 'Menu' }));
await page.waitForFunction(() => window.game.scene.isActive('Inventory'));
await wait(600);
await shot('1-inventory');

// Upgrade the equipped starter cannon once
await page.mouse.click(1010, 526);
await wait(600);
let s = await save();
assert.equal(s.weapons.find((w) => w.uid === 'starter').level, 2, 'starter should be Lv 2');
assert.ok(s.coins < 500 && s.crystals < 10, 'upgrade should cost coins and crystals');
await shot('2-upgraded');

// Select a beaker gun (cards: starter, atom ★3, then the beakers) and fuse
await page.mouse.click(40 + 2 * 180 + 84, 120 + 78);
await wait(500);
await shot('3-beaker-selected');
await page.mouse.click(1010, 610);
await wait(600);
s = await save();
const beakers = s.weapons.filter((w) => w.id === 'beaker_gun');
assert.equal(beakers.length, 1, 'three beakers should fuse into one');
assert.equal(beakers[0].rarity, 2, 'fused beaker should be 2 stars');
await shot('4-fused');

// Equip the fused weapon
await page.mouse.click(1010, 450);
await wait(500);
s = await save();
assert.equal(s.equipped, beakers[0].uid, 'fused beaker should be equipped');
await shot('5-equipped');
console.log('weapons:', s.weapons.map((w) => `${w.id} ★${w.rarity} Lv${w.level}`).join(', '), '| coins', s.coins, 'crystals', s.crystals);

await browser.close();
if (errors.length) {
  console.log('\nERRORS:\n' + errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('\nNo JavaScript errors 👍');
}

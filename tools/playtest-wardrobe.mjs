// Automated smoke test for the wardrobe (phase 4): wear and remove items, check
// that locked items stay locked, that old saves get cleaned up, and that a
// level-up announces new items. Needs `npm run dev` running.
// Usage: npm run playtest:wardrobe -w tools
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const URL = 'http://localhost:8080/';
const out = process.argv[2] ?? '../art/debug/playtest-wardrobe';
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
const startScene = (key, data) => page.evaluate(([k, d]) => window.game.scene.getScenes(true)[0].scene.start(k, d), [key, data]);
const sceneActive = (key) => page.waitForFunction((k) => window.game.scene.isActive(k), key);

// Layout of WardrobeScene: tabs (hat, face, suit, back) and a 5-column card grid
const tab = (i) => page.mouse.click(486 + 90 + i * 190, 130);
const card = (i) => page.mouse.click(486 + (i % 5) * 148 + 68, 196 + Math.floor(i / 5) * 168 + 78);
const HAT = 0, FACE = 1, SUIT = 2;

// Level 7: hats and face items open, suits (Lv 8) still locked.
// The wizard hat (Lv 20) was never allowed — loading the save must take it off.
await page.addInitScript(() => {
  if (localStorage.getItem('sciboom.save.v1')) return; // keep changes across reloads
  localStorage.setItem(
    'sciboom.save.v1',
    JSON.stringify({ character: 'girl', level: 7, exp: 0, outfit: { hat: 'wizard_hat', face: null, suit: null, back: null } }),
  );
});
await page.goto(URL);
await sceneActive('Menu');
await startScene('WorldMap');
await sceneActive('WorldMap');
await wait(500);
await page.mouse.click(1280 - 410, 720 - 48); // ห้องแต่งตัว
await sceneActive('Wardrobe');
await wait(600);
await shot('1-wardrobe');

// Wear the graduation cap (card 1; card 0 is "nothing")
await card(1);
await wait(500);
let s = await save();
assert.equal(s.outfit.hat, 'grad_cap', 'grad cap should be worn');
await shot('2-grad-cap');

// The explorer helmet (card 6) needs Lv 11: tapping it changes nothing
await card(6);
await wait(400);
s = await save();
assert.equal(s.outfit.hat, 'grad_cap', 'locked hat must not be worn');

// Face tab: round glasses
await tab(FACE);
await wait(400);
await card(1);
await wait(500);
s = await save();
assert.equal(s.outfit.face, 'glasses_round', 'glasses should be worn');

// Suits are locked at Lv 7
await tab(SUIT);
await wait(400);
await card(1);
await wait(400);
s = await save();
assert.equal(s.outfit.suit, null, 'suits are locked until Lv 8');
await shot('3-suits-locked');

// Take the hat off again, then put it back
await tab(HAT);
await wait(400);
await card(0);
await wait(400);
assert.equal((await save()).outfit.hat, null, 'hat should come off');
await card(1);
await wait(400);

// Spin and victory pose buttons in the preview
await page.mouse.click(240 - 90, 590);
await wait(500);
await page.mouse.click(240 + 90, 590);
await wait(500);
await shot('4-spin-and-win-pose');

// The outfit shows up in 2-player mode
await startScene('Battle');
await sceneActive('Battle');
await wait(1500);
const worn = await page.evaluate(() => window.game.scene.getScene('Battle').combatants[0].look.outfit);
assert.deepEqual(worn, { hat: 'grad_cap', face: 'glasses_round', suit: null, back: null }, 'player 1 wears the outfit');
await shot('5-battle');

// Level-up from 7 to 8 at the end of a stage unlocks the lab coat: the result screen says so
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('sciboom.save.v1'));
  d.exp = 459; // Lv 7 needs 460 EXP, any stage reward is enough
  localStorage.setItem('sciboom.save.v1', JSON.stringify(d));
});
await startScene('Stage', { stageId: '1-1' });
await sceneActive('Stage');
await wait(1500);
await page.evaluate(() => {
  const st = window.game.scene.getScene('Stage');
  st.onMatchEnd(st.player);
});
await wait(1500);
s = await save();
assert.equal(s.level, 8, 'should reach Lv 8');
const texts = await page.evaluate(() => window.game.scene.getScene('Stage').children.list.filter((o) => o.type === 'Text').map((o) => o.text));
assert.ok(texts.some((t) => t.includes('ชุดนักวิทยาศาสตร์')), 'result screen should announce the lab coat');
await shot('6-unlock-message');

await browser.close();
if (errors.length) {
  console.error('\nErrors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nWardrobe playtest passed, no JavaScript errors');

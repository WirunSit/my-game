// Automated smoke test for skills: stamina, skill combos (+1 with +2, three shells
// with +2), every item skill, the weapon special and the Ultimate in a real stage,
// plus the skill bar in 2-player mode.
// Needs `npm run dev` running. Usage: npm run playtest:skills -w tools
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const URL = 'http://localhost:8080/';
const out = process.argv[2] ?? '../art/debug/playtest-skills';
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
const scene = (expr) => page.evaluate(`(() => { const s = window.game.scene.getScene('Stage'); return ${expr}; })()`);
const skills = () => scene('(() => { const k = s.skills.get(s.player); return { uses: { ...k.uses }, cooldown: k.specialCooldown, gauge: k.gauge }; })()');
/** Wait until it's the player's turn to aim again */
const myTurn = () => page.waitForFunction(() => {
  const s = window.game.scene.getScene('Stage');
  return s.phase === 'aiming' && s.human === s.player;
}, null, { timeout: 90_000 });
const fire = async (holdMs = 700) => {
  await page.keyboard.down('Space');
  await wait(holdMs);
  await page.keyboard.up('Space');
};

// Lv 1 player with a ★3 lightning gun (special: strike)
await page.addInitScript(() => {
  localStorage.setItem(
    'sciboom.save.v1',
    JSON.stringify({ character: 'girl', level: 1, weapons: [{ uid: 'L', id: 'lightning_gun', rarity: 3, level: 1 }], equipped: 'L' }),
  );
});
await page.goto(URL);
await page.waitForFunction(() => window.game?.scene.isActive('Menu'));
await page.evaluate(() => window.game.scene.getScene('Menu').scene.start('Stage', { stageId: '1-1' }));
await page.waitForFunction(() => window.game.scene.getScene('Stage')?.phase === 'aiming', null, { timeout: 30_000 });
// Keep the match going: the enemy can't hurt and can't die, and no question crates pop up
await scene('(() => { s.enemy.weapon = { ...s.enemy.weapon, damage: 0 }; s.enemy.hp = 1e6; s.stage = { ...s.stage, crates: 0 }; s.crates.forEach((c) => (c.opened = true)); return 1; })()');
await wait(600);
await shot('1-skill-bar');

// Count the player's rounds (each call of shoot() by the player is one round)
await scene('(() => { s.rounds = 0; const o = s.shoot.bind(s); s.shoot = (who, ...a) => { if (who === s.player) s.rounds++; return o(who, ...a); }; return 1; })()');
const rounds = async () => {
  const n = await scene('s.rounds');
  await scene('(() => { s.rounds = 0; return 1; })()');
  return n;
};
const armed = () => scene('[...s.skills.get(s.player).armed]');
const stamina = () => scene('s.skills.get(s.player).stamina');

// 1 + 2 = "+1 with +2": four rounds; 4 (power) no longer fits in the stamina
await page.keyboard.press('1');
await page.keyboard.press('2');
await wait(200);
assert.equal(await stamina(), 5);
await page.keyboard.press('4');
await wait(200);
assert.deepEqual(await armed(), ['plus1', 'plus2'], 'power refused: not enough stamina');
await shot('2-combo-armed');
await fire();
await wait(400);
await shot('3-combo-flying');
await myTurn();
assert.equal(await rounds(), 4, '+1 and +2 together fire four rounds');
assert.equal(await stamina(), 100, 'stamina is full again on the next turn');

// 3 + 2 = three shells with +2: the whole bar, so walking does nothing
await page.keyboard.press('3');
await page.keyboard.press('2');
await wait(200);
assert.equal(await stamina(), 0);
const xStill = await scene('s.player.x');
await page.keyboard.down('ArrowRight');
await wait(500);
await page.keyboard.up('ArrowRight');
assert.equal(await scene('s.player.x'), xStill, 'no stamina left to walk');
// Tap 2 again to put +2 back: stamina returns and walking works
await page.keyboard.press('2');
await wait(100);
assert.equal(await stamina(), 55);
await fire();
await myTurn();
assert.equal(await rounds(), 1);

// 9 = heal and 8 = shield (instant), together in one turn
await scene('(() => { s.player.hp = 500; s.hud.refreshHp(); return 1; })()');
await page.keyboard.press('9');
await wait(300);
assert.equal(await scene('s.player.hp'), 800, 'heal +300');
await page.keyboard.press('8');
await wait(300);
assert.equal(await scene('s.shielded.has(s.player)'), true, 'shield is up');
assert.equal(await stamina(), 5);
await shot('4-heal-shield');
await fire();
await myTurn();
assert.equal(await scene('s.shielded.has(s.player)'), false, 'shield wears off on our next turn');
assert.equal((await skills()).uses.heal, 1, 'heal has one use left');

// 0 = camouflage: hidden through the enemy turn, visible again on our turn
await page.keyboard.press('0');
await wait(500);
assert.equal(await scene('s.player.hidden'), true, 'player is camouflaged');
await shot('5-stealth');
await fire();
await myTurn();
assert.equal(await scene('s.player.hidden'), false, 'camouflage wears off on our next turn');

// 7 = paper plane: goes alone (1 is refused), and we move to where it lands
const x0 = await scene('s.player.x');
await page.keyboard.press('7');
await page.keyboard.press('1');
await wait(200);
assert.deepEqual(await armed(), ['plane'], '+1 does not go with the plane');
await shot('6-plane-armed');
await fire(1150); // about power 52 (charging takes ~2.2 s to 100)
await page.waitForFunction(() => window.game.scene.getScene('Stage').phase !== 'flying', null, { timeout: 30_000 });
await wait(300);
const x1 = await scene('s.player.x');
assert.ok(Math.abs(x1 - x0) > 50, `paper plane should move the player (from ${x0} to ${x1})`);
await myTurn();
await rounds();

// 5 + 1 = weapon special (lightning strike) twice, then it rests
await page.keyboard.press('5');
await page.keyboard.press('1');
await wait(200);
await shot('7-special-armed');
await fire();
await wait(1500);
await shot('8-special-strike');
await myTurn();
assert.equal(await rounds(), 2);
assert.ok((await skills()).cooldown > 0, 'special is resting');

// 6 + 4 = Ultimate with power, once the gauge is full
await scene('(() => { s.addGauge(s.player, 100); return 1; })()');
await page.keyboard.press('6');
await page.keyboard.press('4');
await wait(200);
assert.deepEqual(await armed(), ['ultimate', 'power']);
await shot('9-ultimate-armed');
await fire();
await wait(1200);
await shot('10-ultimate');
await myTurn();
assert.equal((await skills()).gauge < 100, true, 'ultimate empties the gauge');

// 2-player mode shows the skill bar for each player
await page.evaluate(() => window.game.scene.getScene('Stage').scene.start('Battle'));
await page.waitForFunction(() => window.game.scene.getScene('Battle')?.phase === 'aiming', null, { timeout: 30_000 });
await wait(500);
await page.keyboard.press('1');
await wait(200);
assert.deepEqual(await page.evaluate(() => { const b = window.game.scene.getScene('Battle'); return b.skills.get(b.human).armed; }), ['plus1']);
await shot('11-battle');

await browser.close();
if (errors.length) {
  console.error('\nErrors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nSkills playtest passed, no JavaScript errors');

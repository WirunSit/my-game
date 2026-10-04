// Automated smoke test: opens the game in headless Chromium, plays one shot,
// saves screenshots and reports any JavaScript errors.
// Needs the dev server running first:  npm run dev   (in another terminal)
// Usage: npm run playtest -w tools  [-- outDir]
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = 'http://localhost:8080/';
const out = process.argv[2] ?? '../art/debug/playtest';
mkdirSync(out, { recursive: true });

// --disable-gpu: Cloud Shell's software GPU (SwiftShader) sometimes stops delivering frames for
// tens of seconds, which freezes the game in the test browser only. The game uses Canvas here anyway.
const browser = await chromium.launch({ args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
// Vite's auto-reload socket is set up for Cloud Shell's proxy, so it can't connect here — ignore it
const isViteNoise = (t) => /websocket|\[vite\]/i.test(t);
page.on('pageerror', (e) => isViteNoise(e.message) || errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !isViteNoise(m.text()) && errors.push(`console: ${m.text()}`));

const wait = (ms) => page.waitForTimeout(ms);
// Grab the game canvas directly (more reliable than a page screenshot on a busy machine)
const shot = async (name) => {
  // Pause the game while encoding so the turn timer doesn't run on during a slow capture
  const dataUrl = await page.evaluate(() => {
    window.game.loop.pause();
    const url = window.game.canvas.toDataURL('image/jpeg', 0.85);
    window.game.loop.resume();
    return url;
  });
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`saved ${out}/${name}.jpg`);
};
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
};

const battle = (fn) => page.evaluate(fn);
await page.goto(URL);
await page.waitForFunction(() => window.game?.scene.isActive('Menu'));
await wait(500);
await shot('1-menu');

await page.mouse.click(640, 330); // "เล่น 2 คน"
await page.waitForFunction(() => window.game.scene.isActive('Battle'));
await wait(1500);
await shot('2-battle-start');

await hold('ArrowRight', 600); // walk
await hold('ArrowUp', 300); // aim higher
await page.keyboard.down('Space'); // charge...
await wait(700);
await shot('3-charging');
await page.keyboard.up('Space'); // ...and fire
await wait(900);
await shot('4-flying');
// Wait until it's player 2's turn
await page.waitForFunction(() => window.game.scene.getScene('Battle').turn === 1, null, { timeout: 30000, polling: 200 });
await wait(300);
await shot('5-player2-turn');

// Player 2 fires a strong shot back
await page.keyboard.down('Space');
await wait(1650);
await page.keyboard.up('Space');
// Wait for the shot to land (phase leaves 'flying')
await page.waitForFunction(() => window.game.scene.getScene('Battle').phase === 'flying', null, { timeout: 30000, polling: 100 });
await page.waitForFunction(() => window.game.scene.getScene('Battle').phase !== 'flying', null, { timeout: 30000, polling: 100 });
await wait(150);
await shot('6-player2-explosion');
await page.waitForFunction(() => window.game.scene.getScene('Battle').turn === 2, null, { timeout: 30000, polling: 200 });
await page.waitForFunction(() => window.game.scene.getScene('Battle').phase === 'aiming', null, { timeout: 30000, polling: 100 });

// Last 5 seconds: a big countdown number in the middle of the screen
await battle(() => { window.game.scene.getScene('Battle').timeLeft = 5.5; });
await page.waitForFunction(() => window.game.scene.getScene('Battle').hud.countdownText?.active, null, { timeout: 5000, polling: 50 });
assert.equal(await battle(() => window.game.scene.getScene('Battle').hud.countdownText.text), '5');
await wait(150);
await shot('7-countdown');

// Holding fire past 100: the bar runs back down instead of firing
await battle(() => { window.game.scene.getScene('Battle').timeLeft = 20; });
await page.keyboard.down('Space');
const powers = [];
for (let i = 0; i < 30; i++) {
  powers.push(await battle(() => window.game.scene.getScene('Battle').power));
  await wait(100);
}
assert.equal(await battle(() => window.game.scene.getScene('Battle').phase), 'charging', 'still charging after reaching 100');
const top = Math.max(...powers);
assert.ok(top > 90, `power reached ${top}`);
assert.ok(powers.at(-1) < top - 10, `power came back down (${powers.map((p) => Math.round(p)).join(' ')})`);
assert.ok(powers.indexOf(top) > 15, 'slower charging: about 2 s to the top');
await shot('8-power-coming-back');
await page.keyboard.up('Space');

// Settings: switch to the slingshot (gear button next to "ออก", then the slingshot card, then close)
await page.waitForFunction(() => window.game.scene.getScene('Battle').phase === 'aiming', null, { timeout: 30000, polling: 100 });
await page.mouse.click(752, 30);
await wait(400);
await shot('9-settings');
await page.mouse.click(830, 320);
await wait(200);
assert.equal(await battle(() => localStorage.getItem('sciboom.aim')), 'drag', 'slingshot chosen in the settings');
await page.mouse.click(640, 570);
await wait(300);
assert.equal(await battle(() => window.game.scene.getScene('Battle').controls.aimButtons[0].visible), false, 'aim buttons hidden');

// Let go where it started: nothing is fired
await page.mouse.move(700, 300);
await page.mouse.down();
await page.mouse.move(708, 306, { steps: 2 });
await page.mouse.up();
await wait(200);
assert.equal(await battle(() => window.game.scene.getScene('Battle').phase), 'aiming', 'tiny drag = cancelled');

// Pull back down-left: the shot goes up-right at about 40 degrees with about 77 power
await page.mouse.move(700, 300);
await page.mouse.down();
await page.mouse.move(560, 420, { steps: 8 });
await wait(300);
const aim = await battle(() => {
  const s = window.game.scene.getScene('Battle');
  return { phase: s.phase, power: s.power, angle: s.human.angle, facing: s.human.facing };
});
await shot('10-slingshot');
assert.equal(aim.phase, 'charging');
assert.ok(Math.abs(aim.angle - 40.6) < 2, `angle from the pull (${aim.angle})`);
assert.ok(Math.abs(aim.power - 76.7) < 3, `power from the pull length (${aim.power})`);
assert.equal(aim.facing, 1, 'pulled left = shoots right');
await page.mouse.up();
await page.waitForFunction(() => window.game.scene.getScene('Battle').phase === 'flying', null, { timeout: 5000, polling: 50 });
const fired = await battle(() => window.game.scene.getScene('Battle').combatants.find((c) => c.lastPower !== null && Math.abs(c.lastPower - 76.7) < 3) !== undefined);
assert.ok(fired, 'fired with the slingshot power');

console.log('state:', await battle(() => {
  const s = window.game.scene.getScene('Battle');
  return s.combatants.map((f) => `${f.name} hp=${f.hp} alive=${f.alive}`).join(' | ');
}));

await browser.close();
if (errors.length) {
  console.log('\nERRORS:\n' + errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('\nNo JavaScript errors 👍');
}

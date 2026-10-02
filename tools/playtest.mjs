// Automated smoke test: opens the game in headless Chromium, plays one shot,
// saves screenshots and reports any JavaScript errors.
// Needs the dev server running first:  npm run dev   (in another terminal)
// Usage: npm run playtest -w tools  [-- outDir]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = 'http://localhost:8080/';
const out = process.argv[2] ?? '../art/debug/playtest';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
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
    window.game.loop.sleep();
    const url = window.game.canvas.toDataURL('image/jpeg', 0.85);
    window.game.loop.wake();
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
await wait(1150);
await page.keyboard.up('Space');
await page.waitForFunction(() => window.game.scene.getScene('Battle').phase === 'resolving', null, { timeout: 30000, polling: 200 });
await wait(250);
await shot('6-player2-explosion');
await page.waitForFunction(() => window.game.scene.getScene('Battle').turn === 2, null, { timeout: 30000, polling: 200 });
console.log('state:', await battle(() => {
  const s = window.game.scene.getScene('Battle');
  return s.fighters.map((f) => `${f.name} hp=${f.hp} alive=${f.alive}`).join(' | ');
}));

await browser.close();
if (errors.length) {
  console.log('\nERRORS:\n' + errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('\nNo JavaScript errors 👍');
}

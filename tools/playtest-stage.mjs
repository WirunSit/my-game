// Automated smoke test for a boss stage (phase 2): map → stage 1-3 → shoot →
// crate question → boss ultimate question → victory screen.
// Needs the dev server running first:  npm run dev
// Usage: npm run playtest:stage -w tools
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = 'http://localhost:8080/';
const out = process.argv[2] ?? '../art/debug/playtest-stage';
mkdirSync(out, { recursive: true });

// --disable-gpu: Cloud Shell's software GPU (SwiftShader) sometimes stops delivering frames for
// tens of seconds, which freezes the game in the test browser only. The game uses Canvas here anyway.
const browser = await chromium.launch({ args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const isViteNoise = (t) => /websocket|\[vite\]/i.test(t);
page.on('pageerror', (e) => isViteNoise(e.message) || errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !isViteNoise(m.text()) && errors.push(`console: ${m.text()}`));

const wait = (ms) => page.waitForTimeout(ms);
const until = async (fn, timeout = 40000) => {
  try {
    await page.waitForFunction(fn, null, { timeout, polling: 200 });
  } catch (e) {
    // Print what the game was doing, to make a stuck test easy to diagnose
    const state = await page.evaluate(() => {
      const s = window.game.scene.getScene('Stage');
      if (!s?.combatants) return 'no stage';
      return JSON.stringify({ phase: s.phase, turn: s.turn, hp: s.combatants.map((c) => [c.name, c.hp, c.alive]) });
    });
    console.log('STUCK waiting for:', fn.toString().slice(0, 120), '\nstate:', state, '\nerrors so far:', errors.join('\n'));
    throw e;
  }
};
const stage = (fn) => page.evaluate(fn);
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

/** Wait for the quiz's "ไปต่อ / เข้าใจแล้ว" button to appear, then click it */
const clickContinue = async () => {
  await until(() =>
    window.game.scene
      .getScene('Stage')
      .children.list.some((o) => o.type === 'Container' && o.alpha === 1 && o.list?.some((t) => t.text === 'ไปต่อ' || t.text === 'เข้าใจแล้ว')),
  );
  await page.mouse.click(1030, 618);
};
/** Answer whatever quiz is open (first choice) and continue */
const answerQuiz = async (choiceX = 388, choiceY = 352) => {
  await page.mouse.click(choiceX, choiceY);
  await clickContinue();
};

// Start with stages 1-1 and 1-2 already cleared so the boss is unlocked
await page.addInitScript(() => {
  localStorage.setItem('sciboom.save.v1', JSON.stringify({ character: 'girl', stars: { '1-1': 3, '1-2': 2 }, crystals: 5, answers: [] }));
});
await page.goto(URL);
await until(() => window.game?.scene.isActive('Menu'));
await wait(400);
await page.mouse.click(640, 420); // "ผจญภัย"
await until(() => window.game.scene.isActive('WorldMap'));
await wait(800);
await shot('1-world-map');

await page.mouse.click(960, 390); // stage 1-3 badge
await until(() => window.game.scene.isActive('Stage'));
await until(() => window.game.scene.getScene('Stage').phase === 'aiming');
await wait(300);
await shot('2-boss-stage');

// Player shoots; pretend the shot also broke a question crate
await page.keyboard.down('Space');
await wait(1000);
await page.keyboard.up('Space');
await stage(() => {
  const s = window.game.scene.getScene('Stage');
  s.pendingCrates = 1;
  s.enemyTurns = 1; // the boss's next turn will be its ultimate
});
await until(() => window.game.scene.getScene('Stage').phase === 'quiz');
await wait(500);
await shot('3-crate-quiz');

await page.mouse.click(388, 352); // choice ก
await wait(700);
await shot('4-quiz-feedback');
await clickContinue();

// More crate questions may follow (the real shot can break a crate too), then the boss's ultimate question
let ultimateShots = 0;
for (let i = 0; i < 4; i++) {
  await until(() => {
    const s = window.game.scene.getScene('Stage');
    return s.phase === 'quiz' || s.phase === 'aiming' || s.phase === 'over';
  });
  const state = await stage(() => {
    const s = window.game.scene.getScene('Stage');
    return { phase: s.phase, enemyTurn: s.turn % 2 === 1 };
  });
  if (state.phase !== 'quiz') break;
  await wait(400);
  const capture = state.enemyTurn && ultimateShots++ === 0; // screenshots are slow here: only the first time
  if (capture) await shot('5-ultimate-quiz');
  await answerQuiz(892, 474); // choice ง
  if (capture) {
    await wait(2500);
    await shot('6-after-ultimate');
  }
}

// Finish the boss off and check the victory screen
await until(() => window.game.scene.getScene('Stage').phase === 'aiming', 60000);
await stage(() => {
  const s = window.game.scene.getScene('Stage');
  s.enemy.takeDamage(1e6);
  s.hud.refreshHp();
});
await page.keyboard.down('Space');
await wait(300);
await page.keyboard.up('Space');
await until(() => window.game.scene.getScene('Stage').phase === 'over');
await wait(1500);
await shot('7-victory');
console.log(
  'save:',
  await stage(() => localStorage.getItem('sciboom.save.v1')),
);

await browser.close();
if (errors.length) {
  console.log('\nERRORS:\n' + errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('\nNo JavaScript errors 👍');
}

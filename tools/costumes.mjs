// Screenshot every page of the costume sheet (?costumes&p=N) so you can check
// that hats, glasses and back items sit right on every body picture.
// Needs `npm run dev` running. Usage: npm run costumes -w tools
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '../art/debug/costumes';
const pages = Number(process.argv[3] ?? 9);
mkdirSync(out, { recursive: true });

// --disable-gpu: see playtest.mjs
const browser = await chromium.launch({ args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error(`pageerror: ${e.message}`));
for (let p = 0; p < pages; p++) {
  await page.goto(`http://localhost:8080/?costumes&p=${p}`);
  await page.waitForFunction(() => window.game?.scene.isActive('CostumeSheet'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/p${p}.png` });
  console.log(`saved ${out}/p${p}.png`);
}
await browser.close();

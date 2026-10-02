// Slice AI-generated sprite sheets (art/raw/*.png) into individual game assets.
//
// How it works: find every non-transparent blob. The N biggest blobs (N = number
// of names) are the items; every smaller blob (sparks, bubbles, smoke puffs) is
// attached to the nearest item. `merge` px of mask growth first joins pieces that
// almost touch. Items are ordered top-to-bottom by row, then left-to-right — the same order as
// in docs/ART_PROMPTS.md — and saved under client/public/assets/<dir>/<name>.png.
// A manifest.json listing every asset is written for the game's preloader.
//
// Usage: npm run art         (from ~/my-game)
//        npm run art:debug   (also writes labelled previews to art/debug/)
import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const RAW = '../art/raw';
const OUT = '../client/public/assets';
const DEBUG_DIR = '../art/debug';
const debug = process.argv.includes('--debug');

// maxSize = longest side of the saved image (keeps files small; ~2x in-game size)
const SHEETS = [
  { file: '01.png', dir: 'characters', maxSize: 320, names: ['boy_side', 'girl_side', 'boy_front', 'girl_front'] },
  { file: '02.png', dir: 'characters', maxSize: 320, names: ['boy_hurt', 'boy_win', 'girl_hurt', 'girl_win'] },
  {
    file: '03.png', dir: 'outfits', maxSize: 320,
    names: ['boy_lab', 'boy_explorer', 'boy_firefighter', 'girl_lab', 'girl_explorer', 'girl_firefighter'],
  },
  {
    file: '04.png', dir: 'hats', maxSize: 160,
    names: ['grad_cap', 'beaker_helmet', 'leaf_crown', 'flame_hat', 'rain_cloud', 'wizard_hat', 'cat_ears', 'pith_helmet', 'propeller_cap'],
  },
  {
    file: '05.png', dir: 'accessories', maxSize: 160,
    names: ['glasses_round', 'goggles', 'star_glasses', 'face_mask', 'wings_angel', 'cape_red', 'jetpack', 'wings_leaf'],
  },
  {
    file: '06.png', dir: 'weapons', maxSize: 200,
    names: [
      'starter_cannon', 'beaker_gun', 'atom_launcher', 'distill_gun',
      'microscope_gun', 'osmosis_bazooka', 'nucleus_blaster', 'chlorophyll_cannon',
      'seed_slingshot', 'pollen_gun', 'thermo_gun', 'convection_rocket',
      'lava_blaster', 'barometer_gun', 'lightning_gun', 'tornado_cannon',
    ],
  },
  {
    file: '07.png', dir: 'fx', maxSize: 256,
    names: [
      'proj_cannonball', 'proj_beaker', 'proj_atom', 'proj_slime', 'proj_seed', 'proj_pollen', 'proj_fireball', 'proj_lightning',
      'explosion_0', 'explosion_1', 'explosion_2', 'explosion_3', 'explosion_4', 'explosion_5',
      'fx_spark', 'fx_dust', 'fx_heal', 'fx_shield',
    ],
  },
  {
    file: '08.png', dir: 'ui', maxSize: 320, merge: 0, alphaMin: 128, // gear and trophy almost touch
    names: [
      'crate', 'coin', 'crystal', 'star',
      'heart', 'wind_arrow', 'btn_fire', 'btn_arrow',
      'gauge', 'bar_power', 'bar_hp', 'gear',
      'sound', 'book', 'chest', 'trophy',
    ],
  },
  { file: '09a.png', dir: 'bosses', maxSize: 640, names: ['mixtron'] },
  { file: '09b.png', dir: 'bosses', maxSize: 640, names: ['amoebox'] },
  { file: '09c.png', dir: 'bosses', maxSize: 640, names: ['venomroot'] },
  { file: '09d.png', dir: 'bosses', maxSize: 640, names: ['magmadon'] },
  { file: '09e.png', dir: 'bosses', maxSize: 640, names: ['stormlord'] },
  {
    file: '10.png', dir: 'minions', maxSize: 256,
    names: ['test_tube', 'bacteria', 'mushroom', 'fire_spirit', 'storm_cloud'],
  },
];

const ALPHA_MIN = 16; // pixels fainter than this count as background

// Grow the mask by r px in every direction (square max-filter, done as two 1-D passes)
function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -Infinity;
    for (let x = 0; x < w; x++) if (mask[y * w + x]) last = x; else if (x - last <= r) tmp[y * w + x] = 1;
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) if (mask[y * w + x]) { last = x; tmp[y * w + x] = 1; } else if (last - x <= r) tmp[y * w + x] = 1;
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) if (tmp[y * w + x]) last = y; else if (y - last <= r) out[y * w + x] = 1;
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) if (tmp[y * w + x]) { last = y; out[y * w + x] = 1; } else if (last - y <= r) out[y * w + x] = 1;
  }
  return out;
}

// Label 4-connected blobs; returns label map + bounding box per blob
function components(mask, w, h) {
  const labels = new Int32Array(w * h);
  const boxes = [];
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = boxes.length + 1;
    const box = { id, x0: w, y0: h, x1: 0, y1: 0, area: 0, edge: [] };
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p - x) / w;
      box.area++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[p - 1] || !mask[p + 1] || !mask[p - w] || !mask[p + w]) box.edge.push(x, y);
      if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        if (mask[q] && !labels[q]) { labels[q] = id; stack.push(q); }
      }
    }
    boxes.push(box);
  }
  return { labels, boxes };
}

// Distance between two boxes (0 if they overlap)
function boxGap(a, b) {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  return Math.hypot(dx, dy);
}

// Closest distance between the outlines of two blobs (outlines sampled for speed)
function edgeGap(a, b) {
  const sample = (e) => { const step = Math.max(1, Math.floor(e.length / 2 / 400)) * 2; const out = []; for (let i = 0; i < e.length; i += step) out.push(e[i], e[i + 1]); return out; };
  const ea = a.sampled ??= sample(a.edge), eb = b.sampled ??= sample(b.edge);
  let best = Infinity;
  for (let i = 0; i < ea.length; i += 2) {
    for (let j = 0; j < eb.length; j += 2) {
      const d = (ea[i] - eb[j]) ** 2 + (ea[i + 1] - eb[j + 1]) ** 2;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

// Order items like reading text: group into rows by their main blob, then left→right
function readingOrder(items) {
  const sorted = [...items].sort((a, b) => (a.core.y0 + a.core.y1) - (b.core.y0 + b.core.y1));
  const rows = [];
  for (const it of sorted) {
    const cy = (it.core.y0 + it.core.y1) / 2;
    const row = rows.find((r) => cy >= r.y0 && cy <= r.y1);
    if (row) { row.items.push(it); row.y0 = Math.min(row.y0, it.core.y0); row.y1 = Math.max(row.y1, it.core.y1); }
    else rows.push({ y0: it.core.y0, y1: it.core.y1, items: [it] });
  }
  rows.sort((a, b) => a.y0 - b.y0);
  return rows.flatMap((r) => r.items.sort((a, b) => a.core.x0 - b.core.x0));
}

const manifest = [];
let problems = 0;

for (const sheet of SHEETS) {
  const src = `${RAW}/${sheet.file}`;
  if (!existsSync(src)) { console.log(`- ${sheet.file}: not uploaded yet, skipped`); continue; }

  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = data[i * 4 + 3] >= (sheet.alphaMin ?? ALPHA_MIN) ? 1 : 0;

  const grown = dilate(solid, w, h, sheet.merge ?? 3);
  const { labels, boxes } = components(grown, w, h);

  // The N biggest blobs are the items; every leftover speck joins the nearest item
  const n = sheet.names.length;
  const bySize = [...boxes].sort((a, b) => b.area - a.area);
  const mains = bySize.slice(0, n).map((b) => ({ ...b, core: b, members: new Set([b.id]) }));
  for (const speck of bySize.slice(n)) {
    let best = mains[0], bestGap = Infinity;
    for (const m of mains) {
      if (boxGap(speck, m.core) >= bestGap) continue; // can't beat the current best
      const gap = edgeGap(speck, m.core);
      if (gap < bestGap) { bestGap = gap; best = m; }
    }
    speck.gap = bestGap;
    best.members.add(speck.id);
    best.x0 = Math.min(best.x0, speck.x0); best.y0 = Math.min(best.y0, speck.y0);
    best.x1 = Math.max(best.x1, speck.x1); best.y1 = Math.max(best.y1, speck.y1);
  }
  const items = readingOrder(mains);

  // A big loose piece far from every item probably means two items got mixed up
  const smallestItem = mains.length ? mains[mains.length - 1].area : 0;
  const suspicious = bySize.slice(n).filter((s) => s.area > smallestItem * 0.35 && s.gap > w * 0.03);
  if (items.length < n) {
    problems++;
    console.log(`✗ ${sheet.file}: found only ${items.length} items, expected ${n} — items touch each other, regenerate with more space`);
  } else if (suspicious.length) {
    problems++;
    console.log(`? ${sheet.file}: ${n} items, but a loose piece is unusually big — check art/debug/${sheet.file.replace('.png', '.jpg')}`);
  } else {
    console.log(`✓ ${sheet.file}: ${n} items`);
  }

  mkdirSync(`${OUT}/${sheet.dir}`, { recursive: true });
  const overlay = [];
  for (const [i, b] of items.entries()) {
    const name = sheet.names[i] ?? `extra_${i}`;
    // Copy only this blob's pixels (so a neighbour poking into the box is not included), then trim
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    const buf = Buffer.alloc(bw * bh * 4);
    let tx0 = bw, ty0 = bh, tx1 = 0, ty1 = 0;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const p = (b.y0 + y) * w + (b.x0 + x);
        if (!b.members.has(labels[p]) || !solid[p]) continue;
        data.copy(buf, (y * bw + x) * 4, p * 4, p * 4 + 4);
        if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; if (y < ty0) ty0 = y; if (y > ty1) ty1 = y;
      }
    }
    const tw = tx1 - tx0 + 1, th = ty1 - ty0 + 1;
    const scale = Math.min(1, sheet.maxSize / Math.max(tw, th));
    const outW = Math.round(tw * scale), outH = Math.round(th * scale);
    const rel = `${sheet.dir}/${name}.png`;
    await sharp(buf, { raw: { width: bw, height: bh, channels: 4 } })
      .extract({ left: tx0, top: ty0, width: tw, height: th })
      .resize(outW, outH)
      .png({ compressionLevel: 9, palette: false })
      .toFile(`${OUT}/${rel}`);
    manifest.push({ key: `${sheet.dir}/${name}`, path: `assets/${rel}`, width: outW, height: outH });
    overlay.push({ ...b, name });
  }

  if (debug) {
    mkdirSync(DEBUG_DIR, { recursive: true });
    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${overlay
      .map((b, i) => `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="none" stroke="red" stroke-width="4"/>
        <text x="${b.x0 + 6}" y="${b.y0 + 34}" font-size="32" font-family="sans-serif" fill="red" stroke="white" stroke-width="1">${i + 1}. ${b.name}</text>`)
      .join('')}</svg>`;
    await sharp({ create: { width: w, height: h, channels: 3, background: '#7a8a9a' } })
      .composite([{ input: src }, { input: Buffer.from(svg) }])
      .jpeg({ quality: 70 })
      .toFile(`${DEBUG_DIR}/${sheet.file.replace('.png', '.jpg')}`);
  }
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1) + '\n');
console.log(`\nSaved ${manifest.length} images + assets/manifest.json`);
if (problems) {
  console.log(`${problems} sheet(s) need attention (see messages above)`);
  process.exitCode = 1;
}

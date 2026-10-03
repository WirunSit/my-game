// List the recorded sounds in client/public/assets/audio/ in its manifest.json,
// so the game plays them instead of the made-in-code ones (see docs/AUDIO.md).
// A file's name (without .ogg/.mp3/.wav/.m4a) is the sound it replaces, e.g.
// explode.ogg, music_boss.mp3, amb_forest.ogg.
// Usage (from the project folder): npm run audio
import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../client/public/assets/audio/', import.meta.url));
const KNOWN = [
  'click', 'pick', 'deny', 'fire', 'plane', 'explode', 'hit', 'hit_direct', 'turn', 'tick', 'step',
  'heal', 'shield', 'stealth', 'teleport', 'burn', 'ultimate', 'boss_charge',
  'lava', 'roots', 'swell', 'thunder', 'quiz', 'correct', 'wrong', 'crate', 'item', 'coin',
  'win', 'lose', 'levelup',
  'music_menu', 'music_map', 'music_battle', 'music_boss', 'music_pvp',
  'amb_lab', 'amb_cell', 'amb_forest', 'amb_lava', 'amb_storm', 'amb_arena',
];

const files = {};
for (const f of readdirSync(dir).sort()) {
  const m = /^(.+)\.(ogg|mp3|wav|m4a)$/i.exec(f);
  if (!m) continue;
  const name = m[1].toLowerCase();
  if (!KNOWN.includes(name)) {
    console.log(`? ${f}: no sound is called "${name}" (see docs/AUDIO.md), skipped`);
    continue;
  }
  if (files[name]) console.log(`! ${f}: "${name}" already uses ${files[name]}, skipped`);
  else files[name] = f;
}
writeFileSync(`${dir}manifest.json`, JSON.stringify({ files }, null, 2) + '\n');
const n = Object.keys(files).length;
console.log(n ? Object.entries(files).map(([k, f]) => `✓ ${k} ← ${f}`).join('\n') : 'No recorded sounds: everything stays made in code.');
console.log(`\nSaved ${n} sound(s) to client/public/assets/audio/manifest.json`);

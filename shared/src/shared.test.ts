// Run with: npm test -w shared
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Terrain, simulateShot, blastDamage, WORLD_WIDTH } from './index';

test('same seed makes the same map', () => {
  const a = Terrain.generate(42);
  const b = Terrain.generate(42);
  const c = Terrain.generate(43);
  assert.deepEqual(a.mask, b.mask);
  assert.notDeepEqual(a.mask, c.mask);
});

test('map edges are bottomless cliffs, the middle has ground', () => {
  const t = Terrain.generate(1);
  assert.equal(t.groundBelow(10, 0), null);
  assert.equal(t.groundBelow(WORLD_WIDTH - 10, 0), null);
  assert.notEqual(t.groundBelow(WORLD_WIDTH / 2, 0), null);
});

test('carving removes ground', () => {
  const t = Terrain.generate(1);
  const x = 500;
  const top = t.groundBelow(x, 0)!;
  assert.ok(t.isSolid(x, top + 5));
  t.carve(x, top + 5, 30);
  assert.ok(!t.isSolid(x, top + 5));
});

test('a shot lands on the ground and the path is deterministic', () => {
  const t = Terrain.generate(7);
  const x = 300;
  const y = t.groundBelow(x, 0)! - 40;
  const input = { x, y, angleDeg: 45, facing: 1 as const, power: 50, wind: 0 };
  const r1 = simulateShot(input, t, [], 'p1');
  const r2 = simulateShot(input, t, [], 'p1');
  assert.ok(r1.impact, 'shot should hit something');
  assert.deepEqual(r1.path, r2.path);
  assert.ok(r1.impact!.x > x, 'facing right should land to the right');
});

test('wind pushes the shot', () => {
  const t = Terrain.generate(7);
  const x = 300;
  const y = t.groundBelow(x, 0)! - 40;
  const calm = simulateShot({ x, y, angleDeg: 60, facing: 1, power: 45, wind: 0 }, t, [], 'p1');
  const tail = simulateShot({ x, y, angleDeg: 60, facing: 1, power: 45, wind: 10 }, t, [], 'p1');
  assert.ok(tail.impact!.x > calm.impact!.x);
});

test('a direct hit on a player is detected', () => {
  const t = new Terrain(1000, 600); // empty sky
  const shot = { x: 100, y: 100, angleDeg: 30, facing: 1 as const, power: 60, wind: 0 };
  // Put the target's body right on the free-flight path
  const free = simulateShot(shot, t, [], 'p1');
  const p = free.path.find((q) => q.x >= 600)!;
  const target = { id: 'p2', x: p.x, y: p.y + 38 };
  const r = simulateShot(shot, t, [target], 'p1');
  assert.equal(r.directHitId, 'p2');
  // ...and a target far away is not hit
  const miss = simulateShot(shot, t, [{ id: 'p3', x: 900, y: 50 }], 'p1');
  assert.equal(miss.directHitId, null);
});

test('blast damage fades with distance', () => {
  const target = { id: 'p', x: 0, y: 38 }; // body centre at (0,0)
  const near = blastDamage({ x: 0, y: 0 }, target, 55, 260, false);
  const mid = blastDamage({ x: 50, y: 0 }, target, 55, 260, false);
  const far = blastDamage({ x: 200, y: 0 }, target, 55, 260, false);
  assert.equal(near, 260);
  assert.ok(mid > 0 && mid < near);
  assert.equal(far, 0);
});

// ---- Questions -------------------------------------------------------------
import { QuizDeck, Rng, planShot, type Question } from './index';
import { readFileSync } from 'node:fs';

const unit1 = JSON.parse(readFileSync(new URL('../../content/questions/unit1_pure_substances.json', import.meta.url), 'utf8'));

test('quiz deck shuffles choices but keeps the right answer', () => {
  const deck = new QuizDeck(unit1.questions, new Rng(5));
  for (let i = 0; i < 40; i++) {
    const item = deck.next();
    assert.equal(item.choices[item.correctIndex], item.question.choices[item.question.answer]);
    assert.equal(new Set(item.choices).size, item.question.choices.length);
  }
});

test('quiz deck does not repeat until every question was asked', () => {
  const deck = new QuizDeck(unit1.questions, new Rng(9));
  const seen = new Set<string>();
  for (let i = 0; i < deck.size; i++) seen.add(deck.next().question.id);
  assert.equal(seen.size, deck.size);
});

test('a wrongly answered question comes back soon', () => {
  const deck = new QuizDeck(unit1.questions, new Rng(3));
  const first = deck.next().question;
  deck.report(first, false);
  const upcoming = [deck.next(), deck.next(), deck.next(), deck.next()].map((x) => x.question.id);
  assert.ok(upcoming.includes(first.id));
});

test('difficulty filter keeps only easy questions', () => {
  const deck = new QuizDeck(unit1.questions as Question[], new Rng(1), 1);
  for (let i = 0; i < 20; i++) assert.equal(deck.next().question.difficulty, 1);
});

// ---- AI --------------------------------------------------------------------
test('a perfect-skill AI lands close to its target', () => {
  const t = Terrain.generate(11);
  const sx = 1700;
  const shooterY = t.groundBelow(sx, 0)! - 60;
  const tx = 400;
  const target = { id: 'p1', x: tx, y: t.groundBelow(tx, 0)! };
  const plan = planShot({ x: sx, y: shooterY }, -1, target, 3, t, [target], 'boss', 1, new Rng(1));
  const r = simulateShot({ x: sx, y: shooterY, angleDeg: plan.angle, facing: -1, power: plan.power, wind: 3 }, t, [target], 'boss');
  assert.ok(r.impact);
  assert.ok(Math.abs(r.impact!.x - tx) < 120, `landed at ${r.impact!.x}, target ${tx}`);
});

// ---- Progression -------------------------------------------------------------
import { addExp, canFuse, expToNext, rollDrop, upgradeCost, weaponStats, MAX_LEVEL, WEAPON_CATALOG } from './index';

test('EXP levels up, possibly several times, and stops at the max level', () => {
  const one = addExp({ level: 1, exp: 0 }, expToNext(1));
  assert.deepEqual([one.level, one.exp, one.levelsGained], [2, 0, 1]);
  const many = addExp({ level: 1, exp: 0 }, expToNext(1) + expToNext(2) + 5);
  assert.deepEqual([many.level, many.exp], [3, 5]);
  const capped = addExp({ level: MAX_LEVEL - 1, exp: 0 }, 1e9);
  assert.deepEqual([capped.level, capped.exp], [MAX_LEVEL, 0]);
});

test('higher rarity and level mean more damage', () => {
  const base = weaponStats({ id: 'beaker_gun', rarity: 1, level: 1 }).damage;
  assert.ok(weaponStats({ id: 'beaker_gun', rarity: 1, level: 5 }).damage > base);
  assert.ok(weaponStats({ id: 'beaker_gun', rarity: 3, level: 1 }).damage > base);
});

test('upgrade costs grow with level and rarity', () => {
  assert.ok(upgradeCost(1, 5).coins > upgradeCost(1, 1).coins);
  assert.ok(upgradeCost(3, 1).crystals > upgradeCost(1, 1).crystals);
});

test('fusing needs three copies of the same weapon and rarity', () => {
  const w = (uid: string, rarity = 1, id = 'beaker_gun') => ({ uid, id, rarity, level: 1 });
  assert.equal(canFuse([w('a'), w('b')], w('a')), false);
  assert.equal(canFuse([w('a'), w('b'), w('c')], w('a')), true);
  assert.equal(canFuse([w('a'), w('b'), w('c', 2)], w('a')), false);
  assert.equal(canFuse([w('a', 5), w('b', 5), w('c', 5)], w('a', 5)), false);
});

test('drops follow the table', () => {
  const rng = new Rng(1);
  const table = { weapons: ['beaker_gun', 'atom_launcher'], chance: 1, rarityWeights: [0, 0, 1, 0, 0] as [number, number, number, number, number] };
  for (let i = 0; i < 20; i++) {
    const d = rollDrop(table, rng)!;
    assert.ok(table.weapons.includes(d.id));
    assert.equal(d.rarity, 3);
  }
  assert.equal(rollDrop({ ...table, chance: 0 }, rng), null);
});

test('every catalogue weapon has art', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../client/public/assets/manifest.json', import.meta.url), 'utf8')) as { key: string }[];
  for (const w of WEAPON_CATALOG) assert.ok(manifest.some((m) => m.key === `weapons/${w.id}`), w.id);
});

// ---- Cosmetics -----------------------------------------------------------------
import { COSMETIC_CATALOG, COSMETIC_SLOTS, SLOT_UNLOCK_LEVEL, cosmeticArt, newlyUnlocked, sanitizeOutfit } from './index';

test('every cosmetic has art for both characters', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../client/public/assets/manifest.json', import.meta.url), 'utf8')) as { key: string }[];
  for (const c of COSMETIC_CATALOG) {
    for (const ch of ['boy', 'girl'] as const) assert.ok(manifest.some((m) => m.key === cosmeticArt(c, ch)), `${c.id} (${ch})`);
  }
});

test('each slot opens at its design level and nothing unlocks earlier', () => {
  for (const slot of COSMETIC_SLOTS) {
    const levels = COSMETIC_CATALOG.filter((c) => c.slot === slot).map((c) => c.level);
    assert.equal(Math.min(...levels), SLOT_UNLOCK_LEVEL[slot], slot);
  }
  assert.equal(new Set(COSMETIC_CATALOG.map((c) => c.id)).size, COSMETIC_CATALOG.length, 'ids are unique');
});

test('outfits drop locked, unknown and wrong-slot items', () => {
  const o = sanitizeOutfit({ hat: 'wizard_hat', face: 'glasses_round', suit: 'grad_cap', back: 'nope' }, 5);
  assert.deepEqual(o, { hat: null, face: 'glasses_round', suit: null, back: null });
  assert.deepEqual(sanitizeOutfit(undefined, 30), { hat: null, face: null, suit: null, back: null });
});

test('level-ups report the items they unlock', () => {
  assert.deepEqual(newlyUnlocked(2, 3).map((c) => c.id), ['grad_cap']);
  assert.equal(newlyUnlocked(1, 2).length, 0);
  assert.equal(newlyUnlocked(0, 30).length, COSMETIC_CATALOG.length);
});

// ---- Beginner assist ---------------------------------------------------------------
import { aimGuideLength, pathPrefix, windFactor } from './index';

test('the aim guide gets shorter and the wind stronger as the player levels up', () => {
  assert.ok(aimGuideLength(1) > aimGuideLength(10));
  assert.ok(aimGuideLength(10) > aimGuideLength(20));
  assert.equal(aimGuideLength(20), aimGuideLength(30), 'stays short after Lv20');
  assert.ok(aimGuideLength(30) > 0, 'always a short aiming hint');
  assert.ok(windFactor(1) < windFactor(8));
  assert.equal(windFactor(15), 1);
  assert.equal(windFactor(30), 1);
});

test('path prefix cuts a path to a length along the curve', () => {
  const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  assert.deepEqual(pathPrefix(path, 15), [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]);
  assert.deepEqual(pathPrefix(path, 100), path);
});

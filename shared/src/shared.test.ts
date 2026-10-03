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

test('the deck deals questions the student has not seen before first, then the oldest ones', () => {
  const qs = unit1.questions as Question[];
  // The student saw every question except the last 5; the first one longest ago
  const lastSeen = new Map(qs.slice(0, -5).map((q, i) => [q.id, 1_000 + i]));
  const deck = new QuizDeck(qs, new Rng(4), 3, { lastSeen });
  const unseen = new Set(qs.slice(-5).map((q) => q.id));
  const first5 = Array.from({ length: 5 }, () => deck.next().question.id);
  assert.deepEqual(new Set(first5), unseen);
  assert.equal(deck.next().question.id, qs[0].id, 'then the one seen longest ago');
});

test('every question in content/questions is well-formed, and each unit has plenty at every difficulty', () => {
  const ids = new Set<string>();
  const texts = new Set<string>();
  for (const file of ['unit1_pure_substances', 'unit2_cells', 'unit3_plants', 'unit4_heat', 'unit5_weather']) {
    const unit = JSON.parse(readFileSync(new URL(`../../content/questions/${file}.json`, import.meta.url), 'utf8')) as { unit: number; questions: Question[] };
    for (const q of unit.questions) {
      const where = `${file} ${q.id}`;
      assert.ok(q.id.startsWith(`u${unit.unit}-`), `${where}: id should start with u${unit.unit}-`);
      assert.ok(!ids.has(q.id), `${where}: duplicate id`);
      ids.add(q.id);
      assert.ok(!texts.has(q.question), `${where}: same question twice`);
      texts.add(q.question);
      assert.equal(q.choices.length, 4, `${where}: needs 4 choices`);
      assert.equal(new Set(q.choices).size, 4, `${where}: choices must differ`);
      assert.ok(q.choices.every((c) => c.trim().length > 0), `${where}: empty choice`);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3, `${where}: answer must be 0-3`);
      assert.ok([1, 2, 3].includes(q.difficulty), `${where}: difficulty 1-3`);
      assert.ok(q.explanation.trim().length > 10, `${where}: needs an explanation`);
      assert.ok(q.topic.trim().length > 0, `${where}: needs a topic`);
    }
    assert.ok(unit.questions.length >= 50, `${file}: at least 50 questions (has ${unit.questions.length})`);
    for (const d of [1, 2, 3]) {
      const n = unit.questions.filter((q) => q.difficulty === d).length;
      assert.ok(n >= 10, `${file}: at least 10 questions of difficulty ${d} (has ${n})`);
    }
  }
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

// ---- Skills -------------------------------------------------------------------------
import { WEAPON_SPECIALS, flightOptions, planVolley, strikeBolt, type ShotInput } from './index';

const testMap = () => Terrain.generate(5);
const aim = (wind = 0): ShotInput => ({ x: 400, y: 200, angleDeg: 55, facing: 1, power: 70, wind });

test('every catalogue weapon has a special', () => {
  for (const w of WEAPON_CATALOG) assert.ok(WEAPON_SPECIALS[w.id], w.id);
});

test('triple shot fires three spread shells', () => {
  const v = planVolley('triple', null, aim(), testMap(), [], 'me');
  assert.equal(v.length, 3);
  const xs = v.map((p) => p.result.impact!.x);
  assert.ok(xs[0] !== xs[1] && xs[1] !== xs[2]);
  assert.ok(v.every((p) => p.damageMul < 1 && p.explodes));
});

test('split special breaks into three at the top of the arc', () => {
  const v = planVolley('special', 'split', aim(), testMap(), [], 'me');
  assert.equal(v.length, 4);
  assert.equal(v[0].explodes, false, 'the carrier does not explode');
  assert.ok(v.slice(1).every((p) => p.delay > 0 && p.delay === v[1].delay));
});

test('no-wind special and the ultimate ignore wind; the paper plane feels more', () => {
  const t = testMap();
  const calm = planVolley('normal', null, aim(0), t, [], 'me')[0].result.impact!.x;
  const windy = planVolley('normal', null, aim(10), t, [], 'me')[0].result.impact!.x;
  assert.equal(planVolley('special', 'nowind', aim(10), t, [], 'me')[0].result.impact!.x, calm);
  assert.equal(planVolley('ultimate', null, aim(10), t, [], 'me')[0].result.impact!.x, calm);
  const plane = planVolley('plane', null, aim(10), t, [], 'me')[0];
  assert.ok(plane.result.impact!.x > windy, 'paper drifts further downwind');
  assert.equal(plane.explodes, false);
  assert.equal(flightOptions('special', 'bounce', 0).bounces, 1);
});

test('bouncing shells travel further than plain ones', () => {
  const t = testMap();
  const plain = planVolley('normal', null, aim(), t, [], 'me')[0].result;
  const bounce = planVolley('special', 'bounce', aim(), t, [], 'me')[0].result;
  assert.ok(bounce.path.length > plain.path.length);
});

test('a lightning bolt falls straight onto the impact point', () => {
  const t = testMap();
  const bolt = strikeBolt({ x: 900, y: 0 }, t, [], 'me');
  assert.ok(Math.abs(bolt.result.impact!.x - 900) < 1);
  assert.ok(Math.abs(bolt.result.impact!.y - t.groundBelow(900, 0)!) < 3);
});

// ---- Battle engine ---------------------------------------------------------------------
import {
  STAMINA_MAX,
  fighterMuzzle,
  fireSkills,
  gaugeGains,
  loadoutOf,
  newFighterUnit,
  newSkillState,
  pickSkill,
  resolveShot,
  skillBlocker,
  spendWalk,
  startSkillTurn,
  tickBurn,
  unpickSkill,
  walkAllowance,
  type ShotRequest,
} from './index';

const duel = () => {
  const t = Terrain.generate(9);
  const a = newFighterUnit('a', 400, t.groundBelow(400, 0)!);
  const b = newFighterUnit('b', 1500, t.groundBelow(1500, 0)!);
  return { t, a, b };
};
/** Aim from a at b by trying powers until a shell lands on b */
const aimAt = (t: Terrain, a: ReturnType<typeof newFighterUnit>, b: ReturnType<typeof newFighterUnit>, mode: ShotRequest['mode'] = 'normal', special: ShotRequest['special'] = null): ShotRequest => {
  let best: ShotRequest | null = null;
  let bestD = Infinity;
  for (let power = 30; power <= 100; power += 0.5) {
    const m = fighterMuzzle(a.x, a.y, 1, 50);
    const req: ShotRequest = { shooterId: 'a', input: { ...m, angleDeg: 50, facing: 1, power, wind: 0 }, mode: 'normal', special: null, damage: 240, radius: 52, damageMul: 1 };
    const r = resolveShot(t, [{ ...a }, { ...b }], req);
    const ex = r.events.find((e) => e.kind === 'explode');
    if (ex && ex.kind === 'explode') {
      const d = Math.abs(ex.at.x - b.x);
      if (d < bestD) {
        bestD = d;
        best = req;
      }
    }
  }
  return { ...best!, mode, special };
};

test('a shot on target damages, carves a copy of the map, and fills the gauge', () => {
  const { t, a, b } = duel();
  const req = aimAt(t, a, b);
  const r = resolveShot(t, [a, b], req);
  assert.ok(b.hp < 1000, 'b took damage');
  const gains = gaugeGains([r, r], 'a');
  assert.equal(gains.get('a'), 20, 'firing + one hit, counted once per turn');
  assert.equal(gains.get('b'), 15, 'getting hit, counted once even if hit twice');
  assert.equal(gaugeGains([], 'a').get('a'), 10, 'firing alone');
  // Without b in the way the same shell lands on the ground: the crater goes on a copy only
  const before = t.mask.reduce((s, v) => s + v, 0);
  const ground = resolveShot(t, [a], req);
  assert.equal(t.mask.reduce((s, v) => s + v, 0), before, 'original map untouched');
  assert.ok(ground.terrain.mask.reduce((s, v) => s + v, 0) < before, 'copy has a crater');
});

test('burn special sets the target on fire; burning hurts at turn start', () => {
  const { t, a, b } = duel();
  resolveShot(t, [a, b], aimAt(t, a, b, 'special', 'burn'));
  assert.equal(b.burn, 2);
  const hp = b.hp;
  assert.equal(tickBurn(b), 60);
  assert.equal(b.hp, hp - 60);
  assert.equal(b.burn, 1);
});

test('the paper plane moves the shooter to where it lands', () => {
  const { t, a, b } = duel();
  const r = resolveShot(t, [a, b], aimAt(t, a, b, 'plane'));
  const tp = r.events.find((e) => e.kind === 'teleport');
  assert.ok(tp && Math.abs(a.x - 400) > 100);
  assert.equal(b.hp, 1000, 'no damage');
});

test('lightning strike adds a bolt after the first blast', () => {
  const { t, a, b } = duel();
  const r = resolveShot(t, [a, b], aimAt(t, a, b, 'special', 'strike'));
  assert.equal(r.flights.length, 2);
  assert.equal(r.events.filter((e) => e.kind === 'explode').length, 2);
});

test('shields can lower damage through the hook', () => {
  const { t, a, b } = duel();
  const r = resolveShot(t, [a, b], aimAt(t, a, b), { modifyDamage: (id, d) => (id === 'b' ? Math.round(d / 2) : d) });
  const hit = r.events.flatMap((e) => (e.kind === 'explode' ? e.hits : [])).find((h) => h.id === 'b')!;
  assert.ok(hit.reduced);
});

test('skills: stamina pays for walking and skills; pick, put back, combine', () => {
  const s = newSkillState(true);
  assert.equal(s.stamina, STAMINA_MAX);
  // +1 with +2: four rounds
  pickSkill(s, 'plus1');
  pickSkill(s, 'plus2');
  assert.equal(s.stamina, 5);
  assert.deepEqual(loadoutOf(s.armed), { mode: 'normal', rounds: 4, damageMul: 0.4 });
  assert.equal(skillBlocker(s, 'power', false), 'stamina');
  unpickSkill(s, 'plus1');
  assert.equal(s.stamina, 45);
  // Three shells with +2 uses the whole bar
  pickSkill(s, 'triple');
  assert.equal(s.stamina, 0);
  assert.equal(walkAllowance(s), 0, 'no stamina left to walk');
  assert.equal(loadoutOf(s.armed).mode, 'triple');
  assert.equal(loadoutOf(s.armed).rounds, 3);
});

test('skills: what cannot go together', () => {
  const s = newSkillState(true);
  pickSkill(s, 'triple');
  assert.equal(skillBlocker(s, 'special', false), 'clash', 'one shell shape per shot');
  assert.equal(skillBlocker(s, 'plane', false), 'clash', 'the plane goes alone');
  assert.equal(skillBlocker(s, 'triple', false), 'used');
  assert.equal(skillBlocker(s, 'shield', false), null, 'instant skills go with anything');
  s.gauge = 100;
  unpickSkill(s, 'triple');
  pickSkill(s, 'ultimate');
  assert.equal(skillBlocker(s, 'plus1', false), 'clash', 'no extra rounds of the Ultimate');
  assert.equal(skillBlocker(s, 'power', false), null);
  pickSkill(s, 'power');
  const l = fireSkills(s);
  assert.equal(l.mode, 'ultimate');
  assert.ok(Math.abs(l.damageMul - 1.3) < 1e-9);
  assert.equal(s.gauge, 0, 'the Ultimate empties the gauge');
});

test('skills: limited uses, heal needs lost health, special cooldown and lock', () => {
  const s = newSkillState(true);
  assert.equal(skillBlocker(s, 'heal', true), 'full');
  pickSkill(s, 'heal');
  assert.equal(skillBlocker(s, 'heal', false), 'used', 'once per turn');
  startSkillTurn(s);
  pickSkill(s, 'heal');
  startSkillTurn(s);
  assert.equal(skillBlocker(s, 'heal', false), 'empty', 'two per match');
  // Walking uses stamina too
  spendWalk(s, 150);
  assert.equal(s.stamina, 50);
  assert.equal(skillBlocker(s, 'plus2', false), 'stamina');
  startSkillTurn(s);
  pickSkill(s, 'special');
  fireSkills(s);
  startSkillTurn(s);
  assert.equal(skillBlocker(s, 'special', false), 'cooldown');
  startSkillTurn(s);
  assert.equal(skillBlocker(s, 'special', false), null);
  assert.equal(skillBlocker(s, 'ultimate', false), 'gauge');
  assert.equal(skillBlocker(newSkillState(false), 'special', false), 'locked');
});

test('terrain encodes and decodes exactly', () => {
  const t = Terrain.generate(3);
  t.carve(700, 400, 60);
  const back = Terrain.decode(t.encode());
  assert.deepEqual(back.mask, t.mask);
});

// ---- Accounts ---------------------------------------------------------------------------
import { nicknameProblem, parseCsv, toCsv } from './index';

test('nicknames: polite Thai/English names pass, rude ones and odd symbols do not', () => {
  for (const ok of ['ต้นกล้า', 'Mint', 'บอส_2', 'น้ำ ใส']) assert.equal(nicknameProblem(ok), null, ok);
  for (const bad of ['ค ว ย', 'fuuuck', 'อีดอก123', '', 'a'.repeat(17), '<script>']) assert.notEqual(nicknameProblem(bad), null, bad);
});

test('CSV round-trips quotes, commas and new lines', () => {
  const rows = [['id', 'question'], ['u1-001', 'ข้อใด "ถูก", ไม่ใช่\nบรรทัดใหม่']];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});

// Balance check: simulate many fights of a "typical student" against every
// stage with the real shared rules, and print win rates.
// Usage (from the project folder): npx tsx tools/balance.ts [matches per stage] [--skills]
//
// The student: aims like a beginner using the guide (gets better after each
// miss, like real players), answers 65% of questions right, uses no items.
// Without --skills they use no skills either; with --skills they fire "+1 with
// +2" (four rounds, same aim) every turn, the usual stamina choice.
import {
  BODY_OFFSET_Y,
  ENEMY_AIM,
  MAX_WIND,
  Rng,
  Terrain,
  WORLD_WIDTH,
  fighterMuzzle,
  newFighterUnit,
  nextEnemySkill,
  planShot,
  resolveShot,
  weaponStats,
  loadoutOf,
  windFactor,
  type Unit,
  type WeaponStats,
} from '../shared/src/index';
import { STAGES, type StageConfig } from '../client/src/game/stages';

const MATCHES = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 60);
const SKILLS = process.argv.includes('--skills');
const COMBO = SKILLS ? loadoutOf(['plus1', 'plus2']) : loadoutOf([]);
/** Per-stage totals for the report: shots fired, shots that hit, damage dealt */
const tally = { p: { shots: 0, hits: 0, dmg: 0 }, e: { shots: 0, hits: 0, dmg: 0 } };
const CORRECT_RATE = 0.65;
const MAX_TURNS = 30;

/** What a student has by the time they reach a world */
function kit(world: number): { level: number; weapon: WeaponStats } {
  const level = [1, 4, 7, 10, 13][world - 1];
  const weapon = world === 1 ? weaponStats({ id: 'starter_cannon', rarity: 1, level: 1 }) : weaponStats({ id: 'beaker_gun', rarity: Math.min(3, world), level: 3 + world });
  return { level, weapon };
}

function fight(stage: StageConfig, seed: number): { won: boolean; turns: number } {
  const rng = new Rng(seed);
  let terrain = Terrain.generate(rng.int(0, 1e9));
  const { level, weapon } = kit(stage.world);
  const px = 260 + rng.int(0, 100);
  const ex = WORLD_WIDTH - 300;
  const player = newFighterUnit('p', px, terrain.groundBelow(px, 0)!);
  const e = stage.enemy;
  const enemy: Unit = { id: 'e', x: ex, y: terrain.groundBelow(ex, 0)!, hp: e.hp, maxHp: e.hp, alive: true, radius: e.hitRadius, offsetY: e.hitOffsetY, burn: 0 };
  const units = [player, enemy];
  let playerSkill = 0.45;
  let enemySkill = e.skill;
  let enemyTurns = 0;
  let bonus = 1;
  let split: Unit | null = null;

  const shoot = (from: Unit, muzzle: { x: number; y: number }, facing: 1 | -1, target: Unit, skill: number, w: WeaponStats, wind: number, mul = 1, rounds = 1) => {
    const plan = planShot(muzzle, facing, { id: target.id, x: target.x, y: target.y, radius: target.radius, offsetY: target.offsetY }, wind, terrain, units.filter((u) => u.alive), from.id, skill, rng);
    let dmg = 0;
    for (let k = 0; k < rounds && target.alive; k++) {
      const r = resolveShot(terrain, units, { shooterId: from.id, input: { ...muzzle, angleDeg: plan.angle, facing, power: plan.power, wind }, mode: 'normal', special: null, damage: w.damage, radius: w.radius, damageMul: mul });
      terrain = r.terrain;
      dmg += r.events.flatMap((ev) => (ev.kind === 'explode' ? ev.hits : [])).filter((h) => h.id === target.id).reduce((a, h) => a + h.damage, 0);
    }
    const t = from.id === 'p' ? tally.p : tally.e;
    t.shots++;
    t.dmg += dmg;
    if (dmg > 0) t.hits++;
    return dmg > 0;
  };
  const wind = () => {
    const base = rng.range(-MAX_WIND, MAX_WIND) * (stage.gimmick === 'storm' ? Math.max(0.7, windFactor(level)) * 1.4 : windFactor(level));
    return Math.round(base);
  };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // Student
    if (stage.gimmick === 'lava' && turn > 6 && rng.next() < 0.25) player.hp -= 80;
    const target = split?.alive && !enemy.alive ? split : enemy;
    const hit = shoot(player, fighterMuzzle(player.x, player.y, 1, 45), 1, target, playerSkill, weapon, wind(), bonus * COMBO.damageMul, COMBO.rounds);
    bonus = 1;
    playerSkill = hit ? playerSkill : Math.min(0.85, playerSkill + 0.1);
    if (stage.gimmick === 'split' && !split && enemy.alive && enemy.hp <= enemy.maxHp / 2) {
      split = { id: 's', x: enemy.x - 230, y: terrain.groundBelow(enemy.x - 230, 0) ?? enemy.y, hp: 700, maxHp: 700, alive: true, radius: 45, offsetY: 61, burn: 0 };
      units.push(split);
    }
    if (!enemy.alive && !split?.alive) return { won: true, turns: turn + 1 };
    if (player.hp <= 0 || !player.alive) return { won: false, turns: turn + 1 };

    // Enemy (and Mixtron's second body)
    for (const foe of [enemy, split]) {
      if (!foe?.alive || !player.alive) continue;
      const muzzle = { x: foe.x + 60, y: foe.y - foe.offsetY * 1.6 };
      if (foe === enemy) {
        enemyTurns++;
        // Roots: the warning circle shows where; most students walk away in time
        if (stage.gimmick === 'roots' && rng.next() < 0.15) player.hp = Math.max(0, player.hp - 150);
        if (stage.ultimateEvery > 0 && stage.ultimate && enemyTurns % stage.ultimateEvery === 0) {
          if (rng.next() < CORRECT_RATE) {
            bonus = 1.3;
          } else {
            for (let k = 0; k < stage.ultimate.shots && player.alive; k++) shoot(enemy, muzzle, -1, player, Math.min(ENEMY_AIM.max, enemySkill + 0.15), stage.ultimate.weapon, wind());
          }
          continue;
        }
        if (stage.gimmick === 'swell' && enemyTurns % 3 === 1 && enemyTurns > 1) {
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + 150);
          continue;
        }
        const hitP = shoot(enemy, muzzle, -1, player, enemySkill, e.weapon, wind());
        enemySkill = nextEnemySkill(enemySkill, e.skill, hitP);
      } else {
        shoot(foe, muzzle, -1, player, 0.45, stage.splitInto!.weapon, wind());
      }
    }
    if (player.hp <= 0) player.alive = false;
    if (!player.alive) return { won: false, turns: turn + 1 };
  }
  return { won: false, turns: MAX_TURNS };
}

console.log(`${MATCHES} fights per stage (student answers ${CORRECT_RATE * 100}% right, no items, ${SKILLS ? '+1 with +2 every turn' : 'no skills'})\n`);
console.log('stage  win%  avg turns  student hit%/dmg  enemy hit%/dmg  enemy');
for (const s of STAGES) {
  tally.p = { shots: 0, hits: 0, dmg: 0 };
  tally.e = { shots: 0, hits: 0, dmg: 0 };
  let wins = 0;
  let turns = 0;
  for (let i = 0; i < MATCHES; i++) {
    const r = fight(s, 1000 + i * 7919);
    if (r.won) wins++;
    turns += r.turns;
  }
  const rate = (t: typeof tally.p) => `${Math.round((100 * t.hits) / Math.max(1, t.shots))}%/${Math.round(t.dmg / Math.max(1, t.hits))}`.padStart(9);
  console.log(`${s.id.padEnd(5)}  ${String(Math.round((100 * wins) / MATCHES)).padStart(3)}%  ${(turns / MATCHES).toFixed(1).padStart(9)}  ${rate(tally.p).padStart(16)}  ${rate(tally.e).padStart(14)}  ${s.enemy.name} (HP ${s.enemy.hp})`);
}
void BODY_OFFSET_Y;

// One PvP match between two players. The server owns the truth: the map,
// positions, health, wind, skills and every shot (worked out with the same
// shared rules the game uses), so nobody can cheat by changing their game.
import {
  CLIMB,
  GAUGE_CORRECT_ANSWER,
  HEAL_AMOUNT,
  MAX_WIND,
  QUIZ_DUEL_BONUS,
  QuizDeck,
  Rng,
  TURN_SECONDS,
  Terrain,
  SHIELD_FACTOR,
  WALK_PX_PER_STAMINA,
  WORLD_WIDTH,
  addGauge,
  fireSkills,
  baseWeaponStats,
  fighterMuzzle,
  gaugeGains,
  isInstantSkill,
  isSkillSlot,
  newFighterUnit,
  newSkillState,
  pickSkill,
  resolveShot,
  sanitizeOutfit,
  skillBlocker,
  startSkillTurn,
  tickBurn,
  weaponDef,
  weaponSpecial,
  windFactor,
  type ClientMessage,
  type PlayerInfo,
  type Question,
  type QuizItem,
  type ServerMessage,
  type ShotTimeline,
  type SkillSlot,
  type SkillState,
  type Unit,
} from '@sciboom/shared';

type Hello = Extract<ClientMessage, { t: 'hello' }>;

export interface RoomOptions {
  send: (playerId: string, msg: ServerMessage) => void;
  questions: Question[];
  /** Shorter in tests */
  turnSeconds?: number;
  quizSeconds?: number;
  /** Extra wait for slow networks before a turn is skipped */
  graceMs?: number;
  /** Speed up the pauses while clients animate (tests) */
  animationScale?: number;
  seed?: number;
}

interface Seat {
  id: string;
  info: PlayerInfo;
  unit: Unit;
  skills: SkillState;
  /** Shield skill: takes half damage until their next turn */
  shield: boolean;
  angle: number;
  wantsRematch: boolean;
}

type Phase = 'waiting' | 'quiz' | 'aiming' | 'resolving' | 'over';

const QUIZ_SECONDS = 20;
/** Steps per second of the shot simulation (shared physics STEP = 1/60) */
const STEPS_PER_SECOND = 60;

export class PvpRoom {
  readonly seats: Seat[] = [];
  phase: Phase = 'waiting';
  private terrain!: Terrain;
  private rng: Rng;
  private deck: QuizDeck;
  private turnIndex = 0;
  private wind = 0;
  private damageMul = 1;
  private walkFromX = 0;
  private quizItem: QuizItem | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly turnSeconds: number;
  private readonly quizSeconds: number;
  private readonly graceMs: number;
  private readonly animationScale: number;

  constructor(
    readonly code: string,
    readonly quizDuel: boolean,
    private readonly opts: RoomOptions,
  ) {
    this.rng = new Rng(opts.seed ?? Math.floor(Math.random() * 1e9));
    this.deck = new QuizDeck(opts.questions, this.rng, 2);
    this.turnSeconds = opts.turnSeconds ?? TURN_SECONDS;
    this.quizSeconds = opts.quizSeconds ?? QUIZ_SECONDS;
    this.graceMs = opts.graceMs ?? 8000;
    this.animationScale = opts.animationScale ?? 1;
  }

  get full(): boolean {
    return this.seats.length >= 2;
  }

  addPlayer(id: string, hello: Hello) {
    const weaponId = weaponDef(hello.weaponId).id;
    const level = Math.max(1, Math.min(30, Math.round(hello.level) || 1));
    this.seats.push({
      id,
      info: {
        id,
        name: String(hello.name).slice(0, 24) || 'ผู้เล่น',
        character: hello.character === 'girl' ? 'girl' : 'boy',
        outfit: sanitizeOutfit(hello.outfit, level),
        level,
        weaponId,
        x: 0,
        y: 0,
        facing: 1,
      },
      unit: newFighterUnit(id, 0, 0),
      skills: newSkillState(true),
      shield: false,
      angle: 45,
      wantsRematch: false,
    });
  }

  /** New match: fresh map, full health, player 1 starts */
  start() {
    const seed = this.rng.int(0, 1e9);
    this.terrain = Terrain.generate(seed);
    const xs = [260 + this.rng.int(0, 120), WORLD_WIDTH - 260 - this.rng.int(0, 120)];
    this.seats.forEach((s, i) => {
      const x = xs[i];
      const y = this.terrain.groundBelow(x, 0) ?? 400;
      s.unit = newFighterUnit(s.id, x, y);
      s.skills = newSkillState(true);
      s.shield = false;
      s.angle = 45;
      s.wantsRematch = false;
      s.info = { ...s.info, x, y, facing: i === 0 ? 1 : -1 };
    });
    this.turnIndex = 0;
    const map = this.terrain.encode();
    for (const s of this.seats) {
      this.opts.send(s.id, { t: 'start', you: s.id, code: this.code, seed, map, players: this.seats.map((o) => o.info), quizDuel: this.quizDuel });
    }
    this.beginTurn();
  }

  handle(id: string, msg: ClientMessage) {
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return;
    const isActor = this.actor === seat;
    switch (msg.t) {
      case 'answer':
        if (this.phase === 'quiz' && isActor) this.answer(seat, msg.chosen);
        break;
      case 'move':
        if (this.phase === 'aiming' && isActor) {
          this.place(seat, msg.x, msg.y, msg.facing, msg.angle);
          this.sendOther(seat, { t: 'moved', id, x: seat.unit.x, y: seat.unit.y, facing: seat.info.facing, angle: seat.angle });
        }
        break;
      case 'skill':
        if (this.phase === 'aiming' && isActor) this.instantSkill(seat, msg.slot);
        break;
      case 'fire':
        if (this.phase === 'aiming' && isActor) {
          this.place(seat, msg.x, msg.y, msg.facing, msg.angle);
          this.fire(seat, msg.power, Array.isArray(msg.armed) ? msg.armed.filter(isSkillSlot) : []);
        }
        break;
      case 'pass':
        if ((this.phase === 'aiming' || this.phase === 'quiz') && isActor) this.skip();
        break;
      case 'rematch':
        if (this.phase !== 'over') break;
        seat.wantsRematch = true;
        this.sendOther(seat, { t: 'rematchWanted', id });
        if (this.full && this.seats.every((s) => s.wantsRematch)) this.start();
        break;
    }
  }

  /** A player left or lost their connection: the other one wins */
  removePlayer(id: string) {
    const idx = this.seats.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const wasPlaying = this.phase !== 'waiting' && this.phase !== 'over';
    this.seats.splice(idx, 1);
    this.clearTimer();
    if (wasPlaying && this.seats.length === 1) this.finish(this.seats[0].id, 'left');
    else if (this.phase === 'over') for (const s of this.seats) this.opts.send(s.id, { t: 'over', winner: s.id, reason: 'left' });
  }

  dispose() {
    this.clearTimer();
  }

  // ---- Turns ---------------------------------------------------------------------

  private get actor(): Seat | undefined {
    return this.seats[this.turnIndex % this.seats.length];
  }

  private other(seat: Seat): Seat | undefined {
    return this.seats.find((s) => s !== seat);
  }

  private beginTurn() {
    const actor = this.actor;
    if (!actor) return;
    // Wind for the least experienced player, so both face the same weather
    const level = Math.min(...this.seats.map((s) => s.info.level));
    this.wind = Math.round(this.rng.range(-MAX_WIND, MAX_WIND) * windFactor(level));
    this.damageMul = 1;
    this.walkFromX = actor.unit.x;
    startSkillTurn(actor.skills);
    actor.shield = false;
    const burn = tickBurn(actor.unit);
    const hp = Object.fromEntries(this.seats.map((s) => [s.id, s.unit.hp]));
    for (const s of this.seats) {
      this.opts.send(s.id, { t: 'turn', actor: actor.id, wind: this.wind, seconds: this.turnSeconds, burn, hp, skills: s.skills });
    }
    if (!actor.unit.alive) {
      this.later(1500, () => this.endTurn());
      return;
    }
    if (this.quizDuel) {
      this.phase = 'quiz';
      this.quizItem = this.deck.next();
      this.opts.send(actor.id, { t: 'quiz', item: this.quizItem, seconds: this.quizSeconds });
      this.setTimer(this.quizSeconds * 1000 + this.graceMs, () => this.answer(actor, -1));
    } else {
      this.startAiming();
    }
  }

  private answer(seat: Seat, chosen: number) {
    const item = this.quizItem!;
    const correct = chosen === item.correctIndex;
    this.deck.report(item.question, correct);
    if (correct) {
      this.damageMul = QUIZ_DUEL_BONUS;
      addGauge(seat.skills, GAUGE_CORRECT_ANSWER);
    }
    this.broadcast({ t: 'quizResult', id: seat.id, correct });
    this.startAiming();
  }

  private startAiming() {
    this.phase = 'aiming';
    this.setTimer(this.turnSeconds * 1000 + this.graceMs, () => this.skip());
  }

  private skip() {
    const actor = this.actor;
    this.clearTimer();
    if (!actor) return;
    this.phase = 'resolving';
    this.broadcast({ t: 'skipped', id: actor.id });
    this.later(800, () => this.endTurn());
  }

  /** Stamina the player's walk this turn has used (judged by how far they got, with a little slack) */
  private walkCost(seat: Seat): number {
    return Math.max(0, Math.abs(seat.unit.x - this.walkFromX) - 8) / WALK_PX_PER_STAMINA;
  }

  /** The player's skills as if their walking were paid for, to check what they can still afford */
  private budget(seat: Seat): SkillState {
    return { ...seat.skills, stamina: seat.skills.stamina - this.walkCost(seat) };
  }

  /** Accept the player's position if they didn't walk further than their stamina allows, then stand them on the ground */
  private place(seat: Seat, x: number, y: number, facing: number, angle: number) {
    if (Number.isFinite(x)) {
      const reach = Math.max(0, seat.skills.stamina) * WALK_PX_PER_STAMINA + 8;
      const nx = Math.max(this.walkFromX - reach, Math.min(this.walkFromX + reach, x));
      const ground = this.terrain.groundBelow(nx, (Number.isFinite(y) ? y : seat.unit.y) - CLIMB);
      if (ground !== null) {
        seat.unit.x = Math.max(0, Math.min(WORLD_WIDTH - 1, nx));
        seat.unit.y = ground;
      }
    }
    seat.info.facing = facing === -1 ? -1 : 1;
    if (Number.isFinite(angle)) seat.angle = Math.max(0, Math.min(90, angle));
  }

  private instantSkill(seat: Seat, slot: SkillSlot) {
    if (!isSkillSlot(slot) || !isInstantSkill(slot) || skillBlocker(this.budget(seat), slot, seat.unit.hp >= seat.unit.maxHp) !== null) return;
    pickSkill(seat.skills, slot);
    if (slot === 'heal') seat.unit.hp = Math.min(seat.unit.maxHp, seat.unit.hp + HEAL_AMOUNT);
    if (slot === 'shield') seat.shield = true;
    for (const s of this.seats) this.opts.send(s.id, { t: 'skillUsed', id: seat.id, slot, hp: seat.unit.hp, skills: s.skills });
  }

  private fire(seat: Seat, power: number, wanted: SkillSlot[]) {
    this.clearTimer();
    this.phase = 'resolving';
    // Take the shot skills the player picked, as far as their stamina (after walking) reaches
    const budget = this.budget(seat);
    budget.armed = [];
    for (const slot of wanted) if (!isInstantSkill(slot) && skillBlocker(budget, slot, true) === null) pickSkill(budget, slot);
    const armed = [...budget.armed];
    seat.skills.armed = budget.armed;
    seat.skills.stamina = Math.max(0, budget.stamina);
    const loadout = fireSkills(seat.skills);

    const weapon = baseWeaponStats(seat.info.weaponId);
    const mode = loadout.mode;
    const units = this.seats.map((s) => s.unit);
    const timelines: ShotTimeline[] = [];
    for (let k = 0; k < loadout.rounds; k++) {
      if (k > 0 && !units.some((u) => u !== seat.unit && u.alive)) break;
      if (!seat.unit.alive) break;
      const m = fighterMuzzle(seat.unit.x, seat.unit.y, seat.info.facing, seat.angle);
      const result = resolveShot(this.terrain, units, {
        shooterId: seat.id,
        input: { x: m.x, y: m.y, angleDeg: seat.angle, facing: seat.info.facing, power: Math.max(0, Math.min(100, Number(power) || 0)), wind: this.wind },
        mode,
        special: mode === 'special' ? weaponSpecial(weapon.id).kind : null,
        damage: weapon.damage,
        radius: weapon.radius,
        damageMul: loadout.damageMul * this.damageMul,
      }, {
        modifyDamage: (id, dmg) => (this.seats.find((o) => o.id === id)?.shield ? Math.round(dmg * SHIELD_FACTOR) : dmg),
      });
      this.terrain = result.terrain;
      timelines.push(compact(result));
    }
    for (const [id, n] of gaugeGains(timelines, seat.id)) {
      const s = this.seats.find((o) => o.id === id);
      if (s) addGauge(s.skills, n);
    }

    const unitsOut = this.seats.map((s) => ({ id: s.id, x: s.unit.x, y: s.unit.y, hp: s.unit.hp, alive: s.unit.alive }));
    for (const s of this.seats) {
      this.opts.send(s.id, {
        t: 'shot',
        id: seat.id,
        x: seat.unit.x,
        y: seat.unit.y,
        facing: seat.info.facing,
        angle: seat.angle,
        armed,
        timelines,
        units: unitsOut,
        skills: s.skills,
      });
    }
    // Give both games time to show the shot before the next turn's clock starts
    const steps = timelines.reduce((a, tl) => a + tl.end, 0);
    const ms = (steps / STEPS_PER_SECOND) * 1000 + 1500 + (timelines.length - 1) * 900;
    this.later(ms, () => this.endTurn());
  }

  private endTurn() {
    const alive = this.seats.filter((s) => s.unit.alive);
    if (alive.length <= 1) {
      this.finish(alive[0]?.id ?? null, 'win');
      return;
    }
    this.turnIndex++;
    this.beginTurn();
  }

  private finish(winner: string | null, reason: 'win' | 'left') {
    this.clearTimer();
    this.phase = 'over';
    this.broadcast({ t: 'over', winner, reason });
  }

  // ---- Helpers --------------------------------------------------------------------

  private broadcast(msg: ServerMessage) {
    for (const s of this.seats) this.opts.send(s.id, msg);
  }

  private sendOther(seat: Seat, msg: ServerMessage) {
    const o = this.other(seat);
    if (o) this.opts.send(o.id, msg);
  }

  private setTimer(ms: number, fn: () => void) {
    this.clearTimer();
    this.timer = setTimeout(fn, ms);
  }

  /** Pause while the games animate (shortened in tests) */
  private later(ms: number, fn: () => void) {
    this.clearTimer();
    this.timer = setTimeout(fn, ms * this.animationScale);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** Round path points to 0.1 px: about a third of the bytes, no visible difference */
function compact(tl: ShotTimeline): ShotTimeline {
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    flights: tl.flights.map((f) => ({ ...f, path: f.path.map((p) => ({ x: r(p.x), y: r(p.y) })) })),
    events: tl.events,
    end: tl.end,
  };
}

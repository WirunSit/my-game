// Run with: npm test -w server
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY_OFFSET_Y, EMPTY_OUTFIT, ROOM_CODE_ALPHABET, Terrain, fighterMuzzle, simulateShot, type ClientMessage, type ServerMessage } from '@sciboom/shared';
import { loadQuestionUnits } from '../src/content';
import { Lobby } from '../src/lobby';

const questions = loadQuestionUnits().flatMap((u) => u.questions);
const tick = () => new Promise((r) => setTimeout(r, 5));

/** A pretend game connected to the lobby */
class FakePlayer {
  readonly inbox: ServerMessage[] = [];
  id = '';
  constructor(
    private readonly lobby: Lobby,
    readonly name: string,
  ) {
    this.id = lobby.connect({ send: (text) => this.inbox.push(JSON.parse(text)), close: () => {} });
  }
  send(msg: ClientMessage) {
    return this.lobby.receive(this.id, JSON.stringify(msg));
  }
  hello(token?: string) {
    return this.send({ t: 'hello', name: this.name, character: 'boy', outfit: { ...EMPTY_OUTFIT }, level: 1, weaponId: 'starter_cannon', token });
  }
  /** Wait for the next message of a type (and drop everything before it) */
  async next<T extends ServerMessage['t']>(t: T, ms = 3000): Promise<Extract<ServerMessage, { t: T }>> {
    const until = Date.now() + ms;
    for (;;) {
      const i = this.inbox.findIndex((m) => m.t === t);
      if (i >= 0) return this.inbox.splice(0, i + 1)[i] as Extract<ServerMessage, { t: T }>;
      if (Date.now() > until) throw new Error(`${this.name}: no "${t}" message (got ${this.inbox.map((m) => m.t).join(', ')})`);
      await tick();
    }
  }
}

const lobbies: Lobby[] = [];
const fastLobby = (extra: Partial<ConstructorParameters<typeof Lobby>[0]> = {}) => {
  const lobby = new Lobby({ questions: () => questions, room: { animationScale: 0, graceMs: 50, turnSeconds: 1, quizSeconds: 1 }, ...extra });
  lobbies.push(lobby);
  return lobby;
};
// Rooms keep turn timers running: stop them so the test run can finish
afterEach(() => lobbies.splice(0).forEach((l) => l.shutdown()));

async function startMatch(lobby: Lobby, quizDuel = false) {
  const a = new FakePlayer(lobby, 'A');
  const b = new FakePlayer(lobby, 'B');
  await a.hello();
  await b.hello();
  await a.send({ t: 'create', quizDuel });
  const { code } = await a.next('created');
  await b.send({ t: 'join', code });
  const sa = await a.next('start');
  const sb = await b.next('start');
  return { a, b, code, sa, sb };
}

/** Find the power that drops a shell from `me` onto `them` on this map */
function aimPower(map: number[], me: { x: number; y: number }, them: { x: number; y: number }, facing: 1 | -1, wind = 0) {
  const t = Terrain.decode(map);
  let best = 50;
  let bestD = Infinity;
  const target = { id: 'them', x: them.x, y: them.y };
  for (let power = 20; power <= 100; power += 0.5) {
    const m = fighterMuzzle(me.x, me.y, facing, 45);
    const r = simulateShot({ ...m, angleDeg: 45, facing, power, wind }, t, [target], 'me');
    const d = r.impact ? Math.hypot(r.impact.x - them.x, r.impact.y - (them.y - BODY_OFFSET_Y)) : Infinity;
    if (d < bestD) {
      bestD = d;
      best = power;
    }
  }
  return best;
}

test('rooms have 5-character codes; joining shares the same map and starts player 1', async () => {
  const lobby = fastLobby();
  const { a, b, code, sa, sb } = await startMatch(lobby);
  assert.equal(code.length, 5);
  assert.ok([...code].every((c) => ROOM_CODE_ALPHABET.includes(c)));
  assert.deepEqual(sa.map, sb.map);
  assert.equal(sa.you, a.id);
  const turn = await a.next('turn');
  assert.equal(turn.actor, a.id);
  assert.equal((await b.next('turn')).actor, a.id);
});

test('a wrong code is refused', async () => {
  const lobby = fastLobby();
  const p = new FakePlayer(lobby, 'P');
  await p.hello();
  await p.send({ t: 'join', code: 'ZZZZZ' });
  assert.match((await p.next('error')).message, /ไม่พบห้อง/);
});

test('shots are worked out by the server and sent to both players; turns alternate', async () => {
  const lobby = fastLobby();
  const { a, b, sa } = await startMatch(lobby);
  const { wind } = await a.next('turn');
  const [pa, pb] = sa.players;
  const power = aimPower(sa.map, pa, pb, 1, wind);
  await a.send({ t: 'fire', x: pa.x, y: pa.y, facing: 1, angle: 45, power, armed: [] });
  const shotA = await a.next('shot');
  const shotB = await b.next('shot');
  assert.deepEqual(shotA.timelines, shotB.timelines);
  const hpB = shotA.units.find((u) => u.id === b.id)!.hp;
  assert.ok(hpB < 1000, `B should be hit (hp ${hpB})`);
  assert.equal((await b.next('turn')).actor, b.id, 'then it is B’s turn');
});

test('walking further than allowed is cut short; moves are relayed to the other player', async () => {
  const lobby = fastLobby();
  const { a, b, sa } = await startMatch(lobby);
  await a.next('turn');
  const start = sa.players[0];
  await a.send({ t: 'move', x: start.x + 900, y: start.y, facing: 1, angle: 60 });
  const moved = await b.next('moved');
  assert.ok(moved.x <= start.x + 310, `moved to ${moved.x}`);
  assert.equal(moved.angle, 60);
});

test('skills: heal is refused at full health; +1 with +2 fires four rounds; stamina is checked', async () => {
  const lobby = fastLobby();
  const { a, b, sa } = await startMatch(lobby);
  const { wind } = await a.next('turn');
  await a.send({ t: 'skill', slot: 'heal' });
  await tick();
  assert.equal(b.inbox.some((m) => m.t === 'skillUsed'), false, 'heal refused at full health');
  const [pa, pb] = sa.players;
  await a.send({ t: 'fire', x: pa.x, y: pa.y, facing: 1, angle: 45, power: aimPower(sa.map, pa, pb, 1, wind), armed: ['plus1', 'plus2', 'power'] });
  const shot = await a.next('shot');
  // power did not fit in the stamina left after +1 and +2
  assert.deepEqual(shot.armed, ['plus1', 'plus2']);
  assert.equal(shot.timelines.length, 4);
});

test('skills: the shield halves damage until the shielded player’s next turn', async () => {
  const lobby = fastLobby();
  const { a, b, sa } = await startMatch(lobby);
  const [pa, pb] = sa.players;
  // A raises a shield and passes; B's shot at A then only does half damage
  await a.next('turn');
  await a.send({ t: 'skill', slot: 'shield' });
  assert.equal((await b.next('skillUsed')).slot, 'shield');
  await a.send({ t: 'pass' });
  const t2 = await b.next('turn');
  await b.send({ t: 'fire', x: pb.x, y: pb.y, facing: -1, angle: 45, power: aimPower(sa.map, pb, pa, -1, t2.wind), armed: [] });
  const shot = await a.next('shot');
  const hits = shot.timelines.flatMap((tl) => tl.events.flatMap((e) => (e.kind === 'explode' ? e.hits : []))).filter((h) => h.id === a.id);
  assert.ok(hits.length > 0 && hits.every((h) => h.reduced), 'A took reduced damage');
});

test('a turn with no shot is skipped after the time limit', async () => {
  const lobby = fastLobby();
  const { a, b } = await startMatch(lobby);
  await a.next('turn');
  assert.equal((await b.next('skipped')).id, a.id);
  assert.equal((await b.next('turn')).actor, b.id);
});

test('Quiz Duel: only the shooter gets the question; the result is shared', async () => {
  const lobby = fastLobby();
  const { a, b } = await startMatch(lobby, true);
  const quiz = await a.next('quiz');
  await tick();
  assert.equal(b.inbox.some((m) => m.t === 'quiz'), false);
  await a.send({ t: 'answer', chosen: quiz.item.correctIndex });
  const res = await b.next('quizResult');
  assert.equal(res.correct, true);
});

test('leaving in the middle of a match gives the other player the win', async () => {
  const lobby = fastLobby();
  const { a, b } = await startMatch(lobby);
  await a.send({ t: 'leave' });
  const over = await b.next('over');
  assert.equal(over.winner, b.id);
  assert.equal(over.reason, 'left');
});

test('a full match ends with a winner, and both can ask for a rematch', async () => {
  const lobby = fastLobby();
  const { a, b, sa } = await startMatch(lobby);
  const players = [a, b];
  let pos = sa.players.map((p) => ({ x: p.x, y: p.y }));
  let map = sa.map;
  for (let turn = 0; turn < 40; turn++) {
    const t = await a.next('turn');
    await b.next('turn');
    const me = t.actor === a.id ? 0 : 1;
    const facing = me === 0 ? 1 : -1;
    await players[me].send({ t: 'fire', x: pos[me].x, y: pos[me].y, facing, angle: 45, power: aimPower(map, pos[me], pos[1 - me], facing, t.wind), armed: [] });
    const shot = await a.next('shot');
    await b.next('shot');
    pos = [a.id, b.id].map((id) => shot.units.find((u) => u.id === id)!);
    // Keep our copy of the map in step with the server's craters
    const t2 = Terrain.decode(map);
    for (const tl of shot.timelines) for (const e of tl.events) if (e.kind === 'explode') t2.carve(e.at.x, e.at.y, e.radius);
    map = t2.encode();
    if (shot.units.some((u) => !u.alive)) break;
  }
  const over = await a.next('over');
  assert.ok(over.winner === a.id || over.winner === b.id);
  await a.send({ t: 'rematch' });
  assert.equal((await b.next('rematchWanted')).id, a.id);
  await b.send({ t: 'rematch' });
  await a.next('start');
});

test('with accounts, players from different classrooms cannot join each other', async () => {
  const lobby = fastLobby({ identify: async (token) => (token ? { group: token } : undefined) });
  const a = new FakePlayer(lobby, 'A');
  const b = new FakePlayer(lobby, 'B');
  await a.hello('class-1');
  await b.hello('class-2');
  await a.send({ t: 'create', quizDuel: false });
  const { code } = await a.next('created');
  await b.send({ t: 'join', code });
  assert.match((await b.next('error')).message, /ห้องเรียนเดียวกัน/);
});

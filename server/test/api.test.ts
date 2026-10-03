// Run with: npm test -w server
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApi } from '../src/api';
import { Store } from '../src/store';

let server: Server;
let store: Store;
let base = '';

before(async () => {
  // SQLite by default; api.pglite.test.ts runs the same tests on PostgreSQL (PGlite)
  store = await Store.open(process.env.TEST_DB ?? ':memory:');
  const api = createApi(store, { teacherSignupCode: 'school-2569' });
  server = createServer(async (req, res) => {
    if (!(await api(req, res))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.close();
  await store.close();
});

async function call(method: string, path: string, body?: unknown, token?: string, raw?: string) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(raw !== undefined ? { 'content-type': 'text/csv' } : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

let teacherToken = '';
let classId = '';
let classCode = '';

test('teachers need the signup code, then can log in', async () => {
  assert.equal((await call('POST', '/api/teacher/register', { username: 'kru.a', password: 'secret123', displayName: 'ครูเอ' })).status, 403);
  const reg = await call('POST', '/api/teacher/register', { username: 'Kru.A', password: 'secret123', displayName: 'ครูเอ', signupCode: 'school-2569' });
  assert.equal(reg.status, 200);
  assert.equal(reg.data.teacher.username, 'kru.a');
  assert.equal((await call('POST', '/api/teacher/register', { username: 'kru.a', password: 'secret123', signupCode: 'school-2569' })).status, 409);
  assert.equal((await call('POST', '/api/teacher/login', { username: 'kru.a', password: 'wrong-pass' })).status, 401);
  const login = await call('POST', '/api/teacher/login', { username: 'KRU.A', password: 'secret123' });
  teacherToken = login.data.token;
  assert.equal((await call('GET', '/api/teacher/me', undefined, teacherToken)).data.teacher.displayName, 'ครูเอ');
  assert.equal((await call('GET', '/api/teacher/classrooms')).status, 401, 'needs a login');
});

test('a classroom gets numbered students with 4-digit PINs', async () => {
  const made = await call('POST', '/api/teacher/classrooms', { name: 'ม.1/3', students: 3, code: 'm1-3-2569' }, teacherToken);
  assert.equal(made.status, 200);
  classId = made.data.classroom.id;
  classCode = made.data.classroom.code;
  assert.equal(classCode, 'M1-3-2569');
  assert.deepEqual(made.data.classroom.openWorlds, [1]);
  const detail = await call('GET', `/api/teacher/classrooms/${classId}`, undefined, teacherToken);
  assert.deepEqual(detail.data.students.map((s: any) => s.number), [1, 2, 3]);
  for (const s of detail.data.students) assert.match(s.pin, /^\d{4}$/);
  assert.equal(detail.data.students[0].nickname, 'นักเรียน #1');
  assert.equal((await call('POST', '/api/teacher/classrooms', { name: 'x', students: 3, code: 'M1-3-2569' }, teacherToken)).status, 409);
});

async function pinOf(number: number) {
  const d = await call('GET', `/api/teacher/classrooms/${classId}`, undefined, teacherToken);
  return d.data.students.find((s: any) => s.number === number);
}

test('students log in with classroom code + number + PIN, and keep their progress', async () => {
  const s1 = await pinOf(1);
  assert.equal((await call('POST', '/api/student/login', { classCode, number: 1, pin: '0000' === s1.pin ? '1111' : '0000' })).status, 401);
  const login = await call('POST', '/api/student/login', { classCode: classCode.toLowerCase(), number: 1, pin: s1.pin });
  assert.equal(login.status, 200);
  assert.equal(login.data.save, null);
  assert.equal(login.data.profile.classroom.name, 'ม.1/3');
  const token = login.data.token;

  const save = { level: 4, stars: { '1-1': 3, '1-2': 2 }, crystals: 5, answers: [{ id: 'u1-001', ok: true, ms: 4000, at: 1000 }, { id: 'u1-002', ok: false, ms: 9000, at: 2000 }] };
  assert.equal((await call('PUT', '/api/student/save', { save }, token)).status, 200);
  // Sending the same answers again doesn't count them twice
  await call('PUT', '/api/student/save', { save: { ...save, answers: [...save.answers, { id: 'u1-002', ok: true, ms: 3000, at: 3000 }] } }, token);
  const me = await call('GET', '/api/student/me', undefined, token);
  assert.equal(me.data.save.level, 4);

  const detail = await call('GET', `/api/teacher/classrooms/${classId}`, undefined, teacherToken);
  const row = detail.data.students.find((s: any) => s.number === 1);
  assert.deepEqual([row.level, row.stars, row.answered, row.correct], [4, 5, 3, 2]);

  const stats = await call('GET', `/api/teacher/classrooms/${classId}/stats`, undefined, teacherToken);
  const q2 = stats.data.questions.find((q: any) => q.id === 'u1-002');
  assert.deepEqual([q2.asked, q2.wrong], [2, 1]);
  assert.equal(stats.data.questions[0].id, 'u1-002', 'most-missed question first');
  assert.equal(stats.data.units.find((u: any) => u.unit === 1).asked, 3);
});

test('nicknames are checked on the server', async () => {
  const s2 = await pinOf(2);
  const token = (await call('POST', '/api/student/login', { classCode, number: 2, pin: s2.pin })).data.token;
  assert.equal((await call('PUT', '/api/student/nickname', { nickname: 'ค ว ย' }, token)).status, 400);
  const ok = await call('PUT', '/api/student/nickname', { nickname: 'ต้นกล้า' }, token);
  assert.equal(ok.data.profile.nickname, 'ต้นกล้า');
});

test('resetting a PIN logs the student out; too many wrong PINs lock the account for a while', async () => {
  const s3 = await pinOf(3);
  const token = (await call('POST', '/api/student/login', { classCode, number: 3, pin: s3.pin })).data.token;
  const reset = await call('POST', `/api/teacher/students/${s3.id}/reset-pin`, undefined, teacherToken);
  assert.match(reset.data.pin, /^\d{4}$/);
  assert.equal((await call('GET', '/api/student/me', undefined, token)).status, 401);
  for (let i = 0; i < 8; i++) await call('POST', '/api/student/login', { classCode, number: 3, pin: 'x' });
  assert.equal((await call('POST', '/api/student/login', { classCode, number: 3, pin: reset.data.pin })).status, 429);
});

test('teachers open worlds and allow PvP with other classrooms', async () => {
  const p = await call('PATCH', `/api/teacher/classrooms/${classId}`, { openWorlds: [1, 2, 9], pvpOpen: true }, teacherToken);
  assert.deepEqual(p.data.classroom.openWorlds, [1, 2]);
  assert.equal(p.data.classroom.pvpOpen, true);
});

test('another teacher cannot see or change this classroom', async () => {
  const other = (await call('POST', '/api/teacher/register', { username: 'kru.b', password: 'secret123', signupCode: 'school-2569' })).data.token;
  assert.equal((await call('GET', `/api/teacher/classrooms/${classId}`, undefined, other)).status, 404);
  const s1 = await pinOf(1);
  assert.equal((await call('POST', `/api/teacher/students/${s1.id}/reset-pin`, undefined, other)).status, 404);
  assert.equal((await call('GET', '/api/teacher/classrooms', undefined, other)).data.classrooms.length, 0);
});

test('question bank: seeded from content, editable, disable hides it from the game', async () => {
  const pub = await call('GET', '/api/questions');
  assert.equal(pub.data.units.length, 5);
  const total = pub.data.units.reduce((a: number, u: any) => a + u.questions.length, 0);
  assert.ok(total >= 80);

  const bank = await call('GET', '/api/teacher/questions', undefined, teacherToken);
  const q = bank.data.questions.find((x: any) => x.id === 'u1-001');
  assert.equal((await call('PUT', '/api/teacher/questions/u1-001', { ...q, disabled: true, reviewed: true }, teacherToken)).status, 200);
  const after = await call('GET', '/api/questions');
  assert.ok(!after.data.units[0].questions.some((x: any) => x.id === 'u1-001'));

  const added = await call('POST', '/api/teacher/questions', { unit: 2, topic: 'เซลล์', difficulty: 1, question: 'ข้อใดเป็นเซลล์พืช', choices: ['ก', 'ข', 'ค', 'ง'], answer: 2, explanation: 'เพราะ...' }, teacherToken);
  assert.match(added.data.id, /^u2-k\d{3}$/, 'teacher questions have their own numbering');
  assert.equal((await call('POST', '/api/teacher/questions', { unit: 2, question: 'x', choices: ['a', 'b'], answer: 0 }, teacherToken)).status, 400);
});

test('CSV import adds and updates questions and reports bad rows; export gives the same columns', async () => {
  const csv = [
    'id,unit,topic,difficulty,question,choice1,choice2,choice3,choice4,answer,explanation,reviewed',
    'u1-001,1,สาร,2,"คำถามแก้ไข, มีจุลภาค",a,b,c,d,2,อธิบาย,1',
    ',3,พืช,1,คำถามใหม่,a,b,c,d,4,อธิบาย,',
    ',9,ผิด,1,หน่วยผิด,a,b,c,d,1,,',
  ].join('\n');
  const r = await call('POST', '/api/teacher/questions/import', undefined, teacherToken, csv);
  assert.equal(r.data.updated, 1);
  assert.equal(r.data.added, 1);
  assert.equal(r.data.errors.length, 1);
  const out = await call('GET', '/api/teacher/questions/export', undefined, teacherToken);
  assert.match(out.data, /^﻿?id,unit,topic/);
  assert.match(out.data, /"คำถามแก้ไข, มีจุลภาค"/);
});

test('deleting a classroom removes its students and logs them out', async () => {
  const s2 = await pinOf(2);
  const token = (await call('POST', '/api/student/login', { classCode, number: 2, pin: s2.pin })).data.token;
  assert.equal((await call('DELETE', `/api/teacher/classrooms/${classId}`, undefined, teacherToken)).status, 200);
  assert.equal((await call('GET', '/api/student/me', undefined, token)).status, 401);
});

test('questions added to the project later reach an existing database, without undoing teachers’ edits', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  if (process.env.TEST_DB) return; // file databases only (the PGlite run is in memory)
  const dir = mkdtempSync(join(tmpdir(), 'sciboom-'));
  const file = join(dir, 'test.db');
  try {
    const first = await Store.open(file);
    await first.db.run('UPDATE questions SET question = ? WHERE id = ?', ['คำถามที่ครูแก้แล้ว', 'u1-001']);
    await first.db.run('DELETE FROM questions WHERE id = ?', ['u1-050']); // as if u1-050 were new in the project
    await first.close();
    const again = await Store.open(file);
    const { questions } = await again.bank();
    assert.ok(questions.some((q) => q.id === 'u1-050'), 'the missing question is added');
    assert.equal(questions.find((q) => q.id === 'u1-001')!.question, 'คำถามที่ครูแก้แล้ว', 'the teacher’s edit stays');
    await again.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

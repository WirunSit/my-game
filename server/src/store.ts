// Everything the server keeps: teachers, classrooms, students (with their
// saved progress), login sessions, the question bank and every answer given.
import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  PIN_LENGTH,
  QUESTION_CSV_HEADER,
  defaultNickname,
  parseCsv,
  toCsv,
  type ClassroomInfo,
  type Question,
  type QuestionUnit,
  type StudentProfile,
  type TeacherInfo,
} from '@sciboom/shared';
import { loadQuestionUnits } from './content';
import { openDb, type Db } from './db';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const DAY = 24 * 60 * 60 * 1000;
export const TEACHER_SESSION_DAYS = 14;
/** Students stay logged in on their device for a whole term */
export const STUDENT_SESSION_DAYS = 120;
export const MAX_STUDENTS = 60;
/** Biggest save we accept (bytes of JSON) */
const MAX_SAVE = 300_000;

interface ClassroomRow {
  id: string;
  teacher_id: string;
  code: string;
  name: string;
  open_worlds: string;
  pvp_open: number;
  created_at: number;
}

interface StudentRow {
  id: string;
  classroom_id: string;
  number: number;
  pin: string;
  nickname: string;
  save: string | null;
  last_seen: number;
}

interface QuestionRow {
  id: string;
  unit: number;
  topic: string;
  difficulty: number;
  question: string;
  choices: string;
  answer: number;
  explanation: string;
  reviewed: number;
  disabled: number;
}

/** A question as the teacher pages see it */
export interface BankQuestion extends Question {
  unit: number;
  reviewed: boolean;
  disabled: boolean;
}

export interface StudentSummary {
  id: string;
  number: number;
  nickname: string;
  pin: string;
  level: number;
  stars: number;
  crystals: number;
  answered: number;
  correct: number;
  lastSeen: number;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url')}`;
const newPin = () => String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function classroomInfo(r: ClassroomRow): ClassroomInfo {
  return { id: r.id, code: r.code, name: r.name, openWorlds: JSON.parse(r.open_worlds) as number[], pvpOpen: !!r.pvp_open };
}

function bankQuestion(r: QuestionRow): BankQuestion {
  return {
    id: r.id,
    unit: r.unit,
    topic: r.topic,
    difficulty: r.difficulty,
    question: r.question,
    choices: JSON.parse(r.choices) as string[],
    answer: r.answer,
    explanation: r.explanation,
    reviewed: !!r.reviewed,
    disabled: !!r.disabled,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export class Store {
  private constructor(readonly db: Db) {}

  static async open(target?: string): Promise<Store> {
    const store = new Store(await openDb(target));
    await store.seedQuestions();
    return store;
  }

  close() {
    return this.db.close();
  }

  // ---- Sessions ------------------------------------------------------------------------

  async newSession(kind: 'teacher' | 'student', userId: string): Promise<string> {
    const token = randomBytes(24).toString('base64url');
    const days = kind === 'teacher' ? TEACHER_SESSION_DAYS : STUDENT_SESSION_DAYS;
    await this.db.run('INSERT INTO sessions (token, kind, user_id, expires_at) VALUES (?, ?, ?, ?)', [token, kind, userId, Date.now() + days * DAY]);
    return token;
  }

  async session(token: string | undefined): Promise<{ kind: 'teacher' | 'student'; userId: string } | undefined> {
    if (!token) return undefined;
    const row = await this.db.get<{ kind: 'teacher' | 'student'; user_id: string; expires_at: number }>('SELECT kind, user_id, expires_at FROM sessions WHERE token = ?', [token]);
    if (!row || row.expires_at < Date.now()) return undefined;
    return { kind: row.kind, userId: row.user_id };
  }

  async endSession(token: string) {
    await this.db.run('DELETE FROM sessions WHERE token = ?', [token]);
  }

  // ---- Teachers ----------------------------------------------------------------------------

  async createTeacher(username: string, password: string, displayName: string): Promise<TeacherInfo> {
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(u)) throw new HttpError(400, 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3–30 ตัว');
    if (password.length < 8) throw new HttpError(400, 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัว');
    const name = displayName.trim().slice(0, 60) || u;
    if (await this.db.get('SELECT id FROM teachers WHERE username = ?', [u])) throw new HttpError(409, 'ชื่อผู้ใช้นี้มีคนใช้แล้ว');
    const id = newId('t');
    await this.db.run('INSERT INTO teachers (id, username, display_name, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)', [id, u, name, await hashPassword(password), Date.now()]);
    return { id, username: u, displayName: name };
  }

  async checkTeacher(username: string, password: string): Promise<TeacherInfo | undefined> {
    const row = await this.db.get<{ id: string; username: string; display_name: string; pass_hash: string }>(
      'SELECT id, username, display_name, pass_hash FROM teachers WHERE username = ?',
      [username.trim().toLowerCase()],
    );
    if (!row || !(await checkPassword(password, row.pass_hash))) return undefined;
    return { id: row.id, username: row.username, displayName: row.display_name };
  }

  async teacher(id: string): Promise<TeacherInfo | undefined> {
    const row = await this.db.get<{ id: string; username: string; display_name: string }>('SELECT id, username, display_name FROM teachers WHERE id = ?', [id]);
    return row && { id: row.id, username: row.username, displayName: row.display_name };
  }

  // ---- Classrooms --------------------------------------------------------------------------

  async createClassroom(teacherId: string, name: string, count: number, code?: string): Promise<ClassroomInfo> {
    const n = Math.round(count);
    if (!(n >= 1 && n <= MAX_STUDENTS)) throw new HttpError(400, `จำนวนนักเรียนต้องอยู่ระหว่าง 1–${MAX_STUDENTS}`);
    let c = (code ?? '').trim().toUpperCase();
    if (c && !/^[A-Z0-9-]{3,20}$/.test(c)) throw new HttpError(400, 'รหัสห้องเรียนใช้ได้เฉพาะ A-Z 0-9 และ - ยาว 3–20 ตัว');
    if (c && (await this.db.get('SELECT id FROM classrooms WHERE code = ?', [c]))) throw new HttpError(409, 'รหัสห้องเรียนนี้มีอยู่แล้ว');
    while (!c) {
      const guess = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      if (!(await this.db.get('SELECT id FROM classrooms WHERE code = ?', [guess]))) c = guess;
    }
    const id = newId('c');
    const row: ClassroomRow = { id, teacher_id: teacherId, code: c, name: name.trim().slice(0, 60) || c, open_worlds: '[1]', pvp_open: 0, created_at: Date.now() };
    await this.db.tx(async (db) => {
      await db.run('INSERT INTO classrooms (id, teacher_id, code, name, open_worlds, pvp_open, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        row.id,
        row.teacher_id,
        row.code,
        row.name,
        row.open_worlds,
        row.pvp_open,
        row.created_at,
      ]);
      for (let k = 1; k <= n; k++) await this.insertStudent(db, id, k);
    });
    return classroomInfo(row);
  }

  private async insertStudent(db: Db, classroomId: string, number: number) {
    await db.run('INSERT INTO students (id, classroom_id, number, pin, nickname) VALUES (?, ?, ?, ?, ?)', [newId('s'), classroomId, number, newPin(), defaultNickname(number)]);
  }

  async classroomsOf(teacherId: string): Promise<(ClassroomInfo & { students: number })[]> {
    const rows = await this.db.all<ClassroomRow & { students: number }>(
      `SELECT c.*, (SELECT COUNT(*) FROM students s WHERE s.classroom_id = c.id) AS students
       FROM classrooms c WHERE c.teacher_id = ? ORDER BY c.created_at`,
      [teacherId],
    );
    return rows.map((r) => ({ ...classroomInfo(r), students: Number(r.students) }));
  }

  /** A classroom, only if it belongs to this teacher */
  async ownedClassroom(teacherId: string, id: string): Promise<ClassroomInfo> {
    const row = await this.db.get<ClassroomRow>('SELECT * FROM classrooms WHERE id = ? AND teacher_id = ?', [id, teacherId]);
    if (!row) throw new HttpError(404, 'ไม่พบห้องเรียนนี้');
    return classroomInfo(row);
  }

  async classroom(id: string): Promise<ClassroomInfo | undefined> {
    const row = await this.db.get<ClassroomRow>('SELECT * FROM classrooms WHERE id = ?', [id]);
    return row && classroomInfo(row);
  }

  async updateClassroom(id: string, change: { name?: string; openWorlds?: number[]; pvpOpen?: boolean }) {
    if (change.name !== undefined) await this.db.run('UPDATE classrooms SET name = ? WHERE id = ?', [change.name.trim().slice(0, 60), id]);
    if (change.openWorlds !== undefined) {
      const worlds = [...new Set(change.openWorlds.map(Number).filter((w) => Number.isInteger(w) && w >= 1 && w <= 5))].sort();
      await this.db.run('UPDATE classrooms SET open_worlds = ? WHERE id = ?', [JSON.stringify(worlds), id]);
    }
    if (change.pvpOpen !== undefined) await this.db.run('UPDATE classrooms SET pvp_open = ? WHERE id = ?', [change.pvpOpen ? 1 : 0, id]);
  }

  async deleteClassroom(id: string) {
    await this.db.tx(async (db) => {
      await db.run("DELETE FROM sessions WHERE kind = 'student' AND user_id IN (SELECT id FROM students WHERE classroom_id = ?)", [id]);
      await db.run('DELETE FROM answers WHERE student_id IN (SELECT id FROM students WHERE classroom_id = ?)', [id]);
      await db.run('DELETE FROM students WHERE classroom_id = ?', [id]);
      await db.run('DELETE FROM classrooms WHERE id = ?', [id]);
    });
  }

  async addStudents(classroomId: string, count: number) {
    const n = Math.round(count);
    const row = await this.db.get<{ m: number | null; c: number }>('SELECT MAX(number) AS m, COUNT(*) AS c FROM students WHERE classroom_id = ?', [classroomId]);
    const have = Number(row?.c ?? 0);
    if (!(n >= 1 && have + n <= MAX_STUDENTS)) throw new HttpError(400, `ห้องหนึ่งมีนักเรียนได้ไม่เกิน ${MAX_STUDENTS} คน`);
    const start = Number(row?.m ?? 0);
    await this.db.tx(async (db) => {
      for (let k = 1; k <= n; k++) await this.insertStudent(db, classroomId, start + k);
    });
  }

  async students(classroomId: string): Promise<StudentSummary[]> {
    const rows = await this.db.all<StudentRow>('SELECT * FROM students WHERE classroom_id = ? ORDER BY number', [classroomId]);
    const counts = await this.db.all<{ student_id: string; answered: number; correct: number }>(
      `SELECT a.student_id, COUNT(*) AS answered, SUM(a.ok) AS correct FROM answers a
       JOIN students s ON s.id = a.student_id WHERE s.classroom_id = ? GROUP BY a.student_id`,
      [classroomId],
    );
    const byId = new Map(counts.map((c) => [c.student_id, c]));
    return rows.map((r) => {
      let level = 1;
      let stars = 0;
      let crystals = 0;
      try {
        const save = r.save ? (JSON.parse(r.save) as { level?: number; stars?: Record<string, number>; crystals?: number }) : {};
        level = Number(save.level) || 1;
        stars = Object.values(save.stars ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
        crystals = Number(save.crystals) || 0;
      } catch {
        // unreadable save: show defaults
      }
      const c = byId.get(r.id);
      return {
        id: r.id,
        number: r.number,
        nickname: r.nickname,
        pin: r.pin,
        level,
        stars,
        crystals,
        answered: Number(c?.answered ?? 0),
        correct: Number(c?.correct ?? 0),
        lastSeen: Number(r.last_seen),
      };
    });
  }

  /** The student's classroom id, only if the teacher owns it */
  async studentClassroomOf(teacherId: string, studentId: string): Promise<string> {
    const row = await this.db.get<{ classroom_id: string }>(
      'SELECT s.classroom_id FROM students s JOIN classrooms c ON c.id = s.classroom_id WHERE s.id = ? AND c.teacher_id = ?',
      [studentId, teacherId],
    );
    if (!row) throw new HttpError(404, 'ไม่พบนักเรียนคนนี้');
    return row.classroom_id;
  }

  async resetPin(studentId: string): Promise<string> {
    const pin = newPin();
    await this.db.run('UPDATE students SET pin = ? WHERE id = ?', [pin, studentId]);
    // Anyone logged in with the old PIN has to log in again
    await this.db.run("DELETE FROM sessions WHERE kind = 'student' AND user_id = ?", [studentId]);
    return pin;
  }

  // ---- Students -----------------------------------------------------------------------------

  async studentLogin(classCode: string, number: number, pin: string): Promise<string | undefined> {
    const row = await this.db.get<{ id: string; pin: string }>(
      'SELECT s.id, s.pin FROM students s JOIN classrooms c ON c.id = s.classroom_id WHERE c.code = ? AND s.number = ?',
      [classCode.trim().toUpperCase(), Math.round(number)],
    );
    if (!row) return undefined;
    const a = Buffer.from(row.pin);
    const b = Buffer.from(String(pin).trim());
    return a.length === b.length && timingSafeEqual(a, b) ? row.id : undefined;
  }

  async studentProfile(studentId: string): Promise<StudentProfile> {
    const row = await this.db.get<StudentRow & { c_id: string; c_code: string; c_name: string; c_worlds: string; c_pvp: number }>(
      `SELECT s.*, c.id AS c_id, c.code AS c_code, c.name AS c_name, c.open_worlds AS c_worlds, c.pvp_open AS c_pvp
       FROM students s JOIN classrooms c ON c.id = s.classroom_id WHERE s.id = ?`,
      [studentId],
    );
    if (!row) throw new HttpError(401, 'กรุณาเข้าสู่ระบบใหม่');
    return {
      id: row.id,
      number: row.number,
      nickname: row.nickname,
      classroom: { id: row.c_id, code: row.c_code, name: row.c_name, openWorlds: JSON.parse(row.c_worlds) as number[], pvpOpen: !!row.c_pvp },
    };
  }

  async setNickname(studentId: string, nickname: string) {
    await this.db.run('UPDATE students SET nickname = ? WHERE id = ?', [nickname.trim(), studentId]);
  }

  async loadSave(studentId: string): Promise<unknown> {
    const row = await this.db.get<{ save: string | null }>('SELECT save FROM students WHERE id = ?', [studentId]);
    await this.db.run('UPDATE students SET last_seen = ? WHERE id = ?', [Date.now(), studentId]);
    return row?.save ? JSON.parse(row.save) : null;
  }

  /** Keep the student's progress, and file new answers for the teacher's statistics */
  async storeSave(studentId: string, save: unknown) {
    const text = JSON.stringify(save);
    if (text.length > MAX_SAVE) throw new HttpError(413, 'ข้อมูลใหญ่เกินไป');
    const answers = Array.isArray((save as { answers?: unknown })?.answers) ? ((save as { answers: unknown[] }).answers as Record<string, unknown>[]) : [];
    await this.db.tx(async (db) => {
      await db.run('UPDATE students SET save = ?, last_seen = ? WHERE id = ?', [text, Date.now(), studentId]);
      const last = await db.get<{ m: number | null }>('SELECT MAX(at) AS m FROM answers WHERE student_id = ?', [studentId]);
      const after = Number(last?.m ?? 0);
      for (const a of answers) {
        const at = Number(a.at);
        if (!(at > after) || typeof a.id !== 'string' || a.id.length > 40) continue;
        await db.run('INSERT INTO answers (student_id, question_id, ok, ms, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING', [
          studentId,
          a.id,
          a.ok ? 1 : 0,
          Math.max(0, Math.min(600_000, Math.round(Number(a.ms) || 0))),
          at,
        ]);
      }
    });
  }

  // ---- Question bank -------------------------------------------------------------------------

  /**
   * Every start: copy questions from content/questions that the database doesn't
   * have yet (new questions added to the project reach existing websites too).
   * Questions already in the database are left alone, so teachers' edits stay.
   */
  private async seedQuestions() {
    const units = loadQuestionUnits();
    const have = new Set((await this.db.all<{ id: string }>('SELECT id FROM questions')).map((r) => r.id));
    await this.db.tx(async (db) => {
      for (const u of units) await db.run('INSERT INTO units (unit, title) VALUES (?, ?) ON CONFLICT DO NOTHING', [u.unit, u.title]);
      for (const u of units) {
        for (const q of u.questions) {
          if (!have.has(q.id)) await this.writeQuestion(db, { ...q, unit: u.unit, reviewed: !!q.reviewed, disabled: false });
        }
      }
    });
  }

  private async writeQuestion(db: Db, q: BankQuestion) {
    await db.run(
      `INSERT INTO questions (id, unit, topic, difficulty, question, choices, answer, explanation, reviewed, disabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET unit = excluded.unit, topic = excluded.topic, difficulty = excluded.difficulty,
         question = excluded.question, choices = excluded.choices, answer = excluded.answer, explanation = excluded.explanation,
         reviewed = excluded.reviewed, disabled = excluded.disabled, updated_at = excluded.updated_at`,
      [q.id, q.unit, q.topic, q.difficulty, q.question, JSON.stringify(q.choices), q.answer, q.explanation, q.reviewed ? 1 : 0, q.disabled ? 1 : 0, Date.now()],
    );
  }

  async bank(): Promise<{ units: { unit: number; title: string }[]; questions: BankQuestion[] }> {
    const units = await this.db.all<{ unit: number; title: string }>('SELECT unit, title FROM units ORDER BY unit');
    const rows = await this.db.all<QuestionRow>('SELECT * FROM questions ORDER BY unit, id');
    return { units, questions: rows.map(bankQuestion) };
  }

  /** What the game plays with: enabled questions, grouped by unit */
  async playableUnits(): Promise<QuestionUnit[]> {
    const { units, questions } = await this.bank();
    return units.map((u) => ({
      unit: u.unit,
      title: u.title,
      questions: questions.filter((q) => q.unit === u.unit && !q.disabled).map(({ unit: _u, disabled: _d, ...q }) => q),
    }));
  }

  /** Check a question from the teacher pages or a CSV row; returns it cleaned up */
  validateQuestion(q: Partial<BankQuestion>): BankQuestion {
    const unit = Number(q.unit);
    if (!(Number.isInteger(unit) && unit >= 1 && unit <= 5)) throw new HttpError(400, 'หน่วยต้องเป็น 1–5');
    const choices = (q.choices ?? []).map((c) => String(c).trim());
    if (choices.length !== 4 || choices.some((c) => !c)) throw new HttpError(400, 'ต้องมีตัวเลือกครบ 4 ข้อ');
    const answer = Number(q.answer);
    if (!(Number.isInteger(answer) && answer >= 0 && answer <= 3)) throw new HttpError(400, 'คำตอบที่ถูกต้องต้องเป็นข้อ ก–ง');
    const question = String(q.question ?? '').trim();
    if (!question) throw new HttpError(400, 'ยังไม่ได้ใส่คำถาม');
    const difficulty = Math.max(1, Math.min(3, Math.round(Number(q.difficulty) || 1)));
    return {
      id: String(q.id ?? '').trim(),
      unit,
      topic: String(q.topic ?? '').trim().slice(0, 80) || 'ทั่วไป',
      difficulty,
      question: question.slice(0, 500),
      choices: choices.map((c) => c.slice(0, 200)),
      answer,
      explanation: String(q.explanation ?? '').trim().slice(0, 800),
      reviewed: !!q.reviewed,
      disabled: !!q.disabled,
    };
  }

  /** Add (no id) or change a question. Returns its id. */
  async saveQuestion(input: Partial<BankQuestion>): Promise<string> {
    const q = this.validateQuestion(input);
    if (!q.id) q.id = await this.nextQuestionId(q.unit);
    else if (!/^[A-Za-z0-9_-]{1,40}$/.test(q.id)) throw new HttpError(400, 'รหัสคำถามใช้ได้เฉพาะ A-Z 0-9 _ -');
    await this.writeQuestion(this.db, q);
    return q.id;
  }

  /** Teachers' questions get their own numbering (u2-k001...), so they never clash with questions added to the project later */
  private async nextQuestionId(unit: number): Promise<string> {
    const prefix = `u${unit}-k`;
    const rows = await this.db.all<{ id: string }>('SELECT id FROM questions WHERE id LIKE ?', [`${prefix}%`]);
    const max = rows.reduce((m, r) => Math.max(m, Number(r.id.slice(prefix.length)) || 0), 0);
    return `${prefix}${String(max + 1).padStart(3, '0')}`;
  }

  async importCsv(text: string): Promise<{ added: number; updated: number; errors: string[] }> {
    const rows = parseCsv(text);
    const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const missing = QUESTION_CSV_HEADER.filter((h) => h !== 'id' && h !== 'reviewed' && col(h) < 0);
    if (missing.length) throw new HttpError(400, `ไฟล์ CSV ขาดคอลัมน์: ${missing.join(', ')}`);
    const existing = new Set((await this.db.all<{ id: string }>('SELECT id FROM questions')).map((r) => r.id));
    let added = 0;
    let updated = 0;
    const errors: string[] = [];
    for (const [i, r] of rows.entries()) {
      const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '');
      try {
        const id = await this.saveQuestion({
          id: get('id'),
          unit: Number(get('unit')),
          topic: get('topic'),
          difficulty: Number(get('difficulty')),
          question: get('question'),
          choices: ['choice1', 'choice2', 'choice3', 'choice4'].map(get),
          answer: Number(get('answer')) - 1,
          explanation: get('explanation'),
          reviewed: /^(1|true|yes|y|ใช่)$/i.test(get('reviewed')),
        });
        if (existing.has(id)) updated++;
        else {
          added++;
          existing.add(id);
        }
      } catch (e) {
        errors.push(`แถว ${i + 2}: ${(e as Error).message}`);
      }
    }
    return { added, updated, errors };
  }

  async exportCsv(): Promise<string> {
    const { questions } = await this.bank();
    return toCsv([
      QUESTION_CSV_HEADER,
      ...questions.map((q) => [q.id, q.unit, q.topic, q.difficulty, q.question, ...q.choices, q.answer + 1, q.explanation, q.reviewed ? 1 : 0]),
    ]);
  }

  // ---- Statistics ------------------------------------------------------------------------------

  async classroomStats(classroomId: string) {
    const rows = await this.db.all<{ question_id: string; asked: number; wrong: number; ms: number }>(
      `SELECT a.question_id, COUNT(*) AS asked, SUM(1 - a.ok) AS wrong, AVG(a.ms) AS ms FROM answers a
       JOIN students s ON s.id = a.student_id WHERE s.classroom_id = ? GROUP BY a.question_id`,
      [classroomId],
    );
    const { units, questions } = await this.bank();
    const qById = new Map(questions.map((q) => [q.id, q]));
    const perQuestion = rows
      .map((r) => {
        const q = qById.get(r.question_id);
        return {
          id: r.question_id,
          unit: q?.unit ?? 0,
          topic: q?.topic ?? '-',
          question: q?.question ?? '(คำถามถูกลบไปแล้ว)',
          asked: Number(r.asked),
          wrong: Number(r.wrong),
          avgSeconds: Math.round(Number(r.ms) / 100) / 10,
        };
      })
      .sort((a, b) => b.wrong / b.asked - a.wrong / a.asked || b.asked - a.asked);
    const group = (key: (q: (typeof perQuestion)[number]) => string) => {
      const m = new Map<string, { asked: number; correct: number }>();
      for (const q of perQuestion) {
        const g = m.get(key(q)) ?? { asked: 0, correct: 0 };
        g.asked += q.asked;
        g.correct += q.asked - q.wrong;
        m.set(key(q), g);
      }
      return m;
    };
    const byUnit = group((q) => String(q.unit));
    const byTopic = group((q) => `${q.unit}|${q.topic}`);
    return {
      questions: perQuestion,
      units: units.map((u) => ({ unit: u.unit, title: u.title, ...(byUnit.get(String(u.unit)) ?? { asked: 0, correct: 0 }) })),
      topics: [...byTopic.entries()].map(([k, v]) => ({ unit: Number(k.split('|')[0]), topic: k.split('|')[1], ...v })).sort((a, b) => a.unit - b.unit),
    };
  }
}

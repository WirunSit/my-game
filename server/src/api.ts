// REST API under /api: teacher pages (classrooms, PINs, statistics, question
// bank) and the game (student login, saved progress, questions).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_STUDENTS, HttpError, type Store } from './store';
import { nicknameProblem, type StudentLogin } from '@sciboom/shared';

interface Ctx {
  req: IncomingMessage;
  params: string[];
  body: Record<string, unknown>;
  rawBody: string;
  token: string | undefined;
}

type Handler = (ctx: Ctx) => Promise<unknown>;

/** A reply that isn't JSON (CSV download) */
class RawReply {
  constructor(
    readonly type: string,
    readonly body: string,
    readonly filename?: string,
  ) {}
}

export interface ApiOptions {
  /** If set, teachers need this code to make an account (stops strangers signing up) */
  teacherSignupCode?: string;
}

const MAX_BODY = 2_000_000;
/** Wrong PIN attempts allowed per classroom+number in LOCK_MS */
const MAX_FAILS = 8;
const LOCK_MS = 10 * 60 * 1000;

export function createApi(store: Store, opts: ApiOptions = {}) {
  const routes: { method: string; pattern: RegExp; handler: Handler }[] = [];
  const route = (method: string, path: string, handler: Handler) => {
    const pattern = new RegExp('^' + path.replace(/:[a-z]+/g, '([^/]+)') + '$');
    routes.push({ method, pattern, handler });
  };
  const fails = new Map<string, { n: number; until: number }>();

  const teacherOf = async (ctx: Ctx) => {
    const s = await store.session(ctx.token);
    if (!s || s.kind !== 'teacher') throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
    return s.userId;
  };
  const studentOf = async (ctx: Ctx) => {
    const s = await store.session(ctx.token);
    if (!s || s.kind !== 'student') throw new HttpError(401, 'กรุณาเข้าสู่ระบบใหม่');
    return s.userId;
  };
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  // ---- Teachers ------------------------------------------------------------------------

  route('POST', '/api/teacher/register', async ({ body }) => {
    if (opts.teacherSignupCode && str(body.signupCode).trim() !== opts.teacherSignupCode) throw new HttpError(403, 'รหัสสมัครสำหรับครูไม่ถูกต้อง');
    const teacher = await store.createTeacher(str(body.username), str(body.password), str(body.displayName));
    return { token: await store.newSession('teacher', teacher.id), teacher };
  });

  route('POST', '/api/teacher/login', async ({ body }) => {
    const teacher = await store.checkTeacher(str(body.username), str(body.password));
    if (!teacher) throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    return { token: await store.newSession('teacher', teacher.id), teacher };
  });

  route('GET', '/api/teacher/me', async (ctx) => {
    const teacher = await store.teacher(await teacherOf(ctx));
    if (!teacher) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
    return { teacher, signupNeedsCode: !!opts.teacherSignupCode };
  });

  route('POST', '/api/logout', async (ctx) => {
    if (ctx.token) await store.endSession(ctx.token);
    return { ok: true };
  });

  route('GET', '/api/teacher/classrooms', async (ctx) => ({ classrooms: await store.classroomsOf(await teacherOf(ctx)) }));

  route('POST', '/api/teacher/classrooms', async (ctx) => {
    const t = await teacherOf(ctx);
    const b = ctx.body;
    return { classroom: await store.createClassroom(t, str(b.name), Number(b.students), str(b.code) || undefined) };
  });

  route('GET', '/api/teacher/classrooms/:id', async (ctx) => {
    const t = await teacherOf(ctx);
    const classroom = await store.ownedClassroom(t, ctx.params[0]);
    return { classroom, students: await store.students(classroom.id), maxStudents: MAX_STUDENTS };
  });

  route('PATCH', '/api/teacher/classrooms/:id', async (ctx) => {
    const t = await teacherOf(ctx);
    const c = await store.ownedClassroom(t, ctx.params[0]);
    const b = ctx.body;
    await store.updateClassroom(c.id, {
      name: typeof b.name === 'string' ? b.name : undefined,
      openWorlds: Array.isArray(b.openWorlds) ? (b.openWorlds as number[]) : undefined,
      pvpOpen: typeof b.pvpOpen === 'boolean' ? b.pvpOpen : undefined,
    });
    return { classroom: await store.ownedClassroom(t, c.id) };
  });

  route('DELETE', '/api/teacher/classrooms/:id', async (ctx) => {
    const c = await store.ownedClassroom(await teacherOf(ctx), ctx.params[0]);
    await store.deleteClassroom(c.id);
    return { ok: true };
  });

  route('POST', '/api/teacher/classrooms/:id/students', async (ctx) => {
    const c = await store.ownedClassroom(await teacherOf(ctx), ctx.params[0]);
    await store.addStudents(c.id, Number(ctx.body.count));
    return { students: await store.students(c.id) };
  });

  route('POST', '/api/teacher/students/:id/reset-pin', async (ctx) => {
    await store.studentClassroomOf(await teacherOf(ctx), ctx.params[0]);
    return { pin: await store.resetPin(ctx.params[0]) };
  });

  route('GET', '/api/teacher/classrooms/:id/stats', async (ctx) => {
    const c = await store.ownedClassroom(await teacherOf(ctx), ctx.params[0]);
    return store.classroomStats(c.id);
  });

  // ---- Question bank (teachers) --------------------------------------------------------------

  route('GET', '/api/teacher/questions', async (ctx) => {
    await teacherOf(ctx);
    return store.bank();
  });

  route('POST', '/api/teacher/questions', async (ctx) => {
    await teacherOf(ctx);
    return { id: await store.saveQuestion({ ...(ctx.body as object), id: '' }) };
  });

  route('PUT', '/api/teacher/questions/:id', async (ctx) => {
    await teacherOf(ctx);
    return { id: await store.saveQuestion({ ...(ctx.body as object), id: decodeURIComponent(ctx.params[0]) }) };
  });

  route('POST', '/api/teacher/questions/import', async (ctx) => {
    await teacherOf(ctx);
    return store.importCsv(ctx.rawBody);
  });

  route('GET', '/api/teacher/questions/export', async (ctx) => {
    await teacherOf(ctx);
    return new RawReply('text/csv; charset=utf-8', await store.exportCsv(), 'sciboom-questions.csv');
  });

  // ---- Students (the game) ------------------------------------------------------------------------

  route('POST', '/api/student/login', async ({ body }): Promise<StudentLogin> => {
    const code = str(body.classCode).trim().toUpperCase();
    const number = Number(body.number);
    const key = `${code}#${number}`;
    const f = fails.get(key);
    if (f && f.n >= MAX_FAILS && f.until > Date.now()) throw new HttpError(429, 'ใส่ PIN ผิดหลายครั้งเกินไป รอ 10 นาทีหรือให้ครูรีเซ็ต PIN');
    const id = await store.studentLogin(code, number, str(body.pin));
    if (!id) {
      const n = f && f.until > Date.now() ? f.n + 1 : 1;
      fails.set(key, { n, until: Date.now() + LOCK_MS });
      throw new HttpError(401, 'รหัสห้องเรียน เลขที่ หรือ PIN ไม่ถูกต้อง');
    }
    fails.delete(key);
    return { token: await store.newSession('student', id), profile: await store.studentProfile(id), save: await store.loadSave(id) };
  });

  route('GET', '/api/student/me', async (ctx) => {
    const id = await studentOf(ctx);
    return { profile: await store.studentProfile(id), save: await store.loadSave(id) };
  });

  route('PUT', '/api/student/save', async (ctx) => {
    await store.storeSave(await studentOf(ctx), ctx.body.save);
    return { ok: true };
  });

  route('PUT', '/api/student/nickname', async (ctx) => {
    const id = await studentOf(ctx);
    const nickname = str(ctx.body.nickname).trim();
    const problem = nicknameProblem(nickname);
    if (problem) throw new HttpError(400, problem);
    await store.setNickname(id, nickname);
    return { profile: await store.studentProfile(id) };
  });

  // ---- Anyone --------------------------------------------------------------------------------------

  route('GET', '/api/questions', async () => ({ units: await store.playableUnits() }));

  /** Handle a request; returns false if the path isn't an API route */
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;
    const reply = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    const found = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
    if (!found) {
      reply(404, { error: 'ไม่พบ' });
      return true;
    }
    try {
      const rawBody = req.method === 'GET' ? '' : await readBody(req);
      let body: Record<string, unknown> = {};
      if (rawBody && /json/.test(req.headers['content-type'] ?? '')) {
        try {
          body = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          throw new HttpError(400, 'ข้อมูลไม่ถูกต้อง');
        }
      }
      const auth = req.headers.authorization;
      const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
      const out = await found.handler({ req, params: found.pattern.exec(url.pathname)!.slice(1), body, rawBody, token });
      if (out instanceof RawReply) {
        res.writeHead(200, {
          'content-type': out.type,
          'cache-control': 'no-store',
          ...(out.filename ? { 'content-disposition': `attachment; filename="${out.filename}"` } : {}),
        });
        res.end(out.body);
      } else {
        reply(200, out);
      }
    } catch (e) {
      if (e instanceof HttpError) reply(e.status, { error: e.message });
      else {
        console.error(e);
        reply(500, { error: 'เซิร์ฟเวอร์มีปัญหา ลองใหม่อีกครั้ง' });
      }
    }
    return true;
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'ข้อมูลใหญ่เกินไป'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

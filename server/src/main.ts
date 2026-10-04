// SciBoom server: PvP rooms over WebSocket (/ws), the REST API (/api) for
// accounts, teacher pages and questions, and, in production, the built game.
//   Development: started together with the game by `npm run dev` (port 8081;
//   Vite on 8080 forwards /ws and /api here, so one port is enough).
//   Production:  `npm run build && npm start` — everything on $PORT.
// Settings (environment variables, see docs/DEPLOY.md):
//   PORT, DATABASE_URL (PostgreSQL; default: SQLite file server/data/sciboom.db),
//   TEACHER_SIGNUP_CODE (needed to make a teacher account, if set)
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer } from 'ws';
import type { Question } from '@sciboom/shared';
import { createApi } from './api';
import { ROOT } from './content';
import { Lobby } from './lobby';
import { explainDbError } from './dbHelp';
import { Store } from './store';

const PORT = Number(process.env.PORT ?? 8081);
const STATIC_DIR = join(ROOT, 'client', 'dist');

const store = await Store.open(process.env.DATABASE_URL ?? join(ROOT, 'server', 'data', 'sciboom.db')).catch((err: unknown) => {
  console.error(explainDbError(err, process.env.DATABASE_URL));
  process.exit(1);
});
const api = createApi(store, { teacherSignupCode: process.env.TEACHER_SIGNUP_CODE || undefined });

const lobby = new Lobby({
  // Quiz Duel uses the same bank teachers edit (enabled questions only)
  questions: async (): Promise<Question[]> => (await store.playableUnits()).flatMap((u) => u.questions),
  identify: async (token) => {
    // Without an account: play with other guests
    if (!token) return { group: 'guests' };
    const s = await store.session(token);
    if (!s || s.kind !== 'student') return undefined;
    const p = await store.studentProfile(s.userId);
    // Same classroom only, unless the teacher opened PvP to other open classrooms
    return { group: p.classroom.pvpOpen ? 'open' : p.classroom.id, name: p.nickname };
  },
});

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: lobby.roomCount, db: store.db.kind }));
    return;
  }
  if (await api(req, res)) return;
  // Static game files (production); /teacher is the teacher pages
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  if (path === '' || path.endsWith('/') || path.endsWith('\\')) path += 'index.html';
  if (path === 'teacher') path = 'teacher.html';
  const file = join(STATIC_DIR, path);
  if (!file.startsWith(STATIC_DIR) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(existsSync(STATIC_DIR) ? 'Not found' : 'Game not built yet: run `npm run build` (or use `npm run dev` while developing)');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  const id = lobby.connect({ send: (text) => ws.readyState === ws.OPEN && ws.send(text), close: () => ws.close() });
  ws.on('message', (data) => void lobby.receive(id, data.toString()));
  ws.on('close', () => lobby.disconnect(id));
});

server.listen(PORT, () => console.log(`SciBoom server on http://localhost:${PORT} (WebSocket /ws, database: ${store.db.kind})`));

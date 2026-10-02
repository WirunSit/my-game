// SciBoom server: PvP rooms over WebSocket (/ws), the REST API (/api) and,
// in production, the built game itself (client/dist).
//   Development: started together with the game by `npm run dev` (port 8081;
//   Vite on 8080 forwards /ws and /api here, so one port is enough).
//   Production:  `npm run build && npm start` — everything on $PORT.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer } from 'ws';
import { ROOT, loadQuestionUnits } from './content';
import { Lobby } from './lobby';

const PORT = Number(process.env.PORT ?? 8081);
const STATIC_DIR = join(ROOT, 'client', 'dist');

const questions = loadQuestionUnits().flatMap((u) => u.questions);
const lobby = new Lobby({ questions: () => questions });

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

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: lobby.roomCount }));
    return;
  }
  // Static game files (production)
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (path === '' || path.endsWith('/') || path.endsWith('\\')) path += 'index.html';
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

server.listen(PORT, () => console.log(`SciBoom server on http://localhost:${PORT} (WebSocket /ws)`));

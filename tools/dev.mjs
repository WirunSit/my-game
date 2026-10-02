// `npm run dev`: start the game (Vite, port 8080) and the server (port 8081)
// together. Vite forwards /ws and /api to the server, so only port 8080 is
// needed (handy for Cloud Shell's Web Preview). Ctrl+C stops both.
import { spawn } from 'node:child_process';

const parts = [
  { name: 'server', color: 35, args: ['run', 'dev', '-w', 'server'] },
  { name: 'game', color: 36, args: ['run', 'dev', '-w', 'client'] },
];

const children = parts.map(({ name, color, args }) => {
  const child = spawn('npm', args, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let rest = '';
    stream.on('data', (chunk) => {
      const lines = (rest + chunk).split('\n');
      rest = lines.pop();
      for (const line of lines) process.stdout.write(tag + line + '\n');
    });
  }
  child.on('exit', (code) => {
    process.stdout.write(`${tag}stopped (${code})\n`);
    stopAll();
  });
  return child;
});

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    // On Windows, killing the npm shell leaves Vite/the server running: kill the whole tree
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill();
  }
  setTimeout(() => process.exit(0), 800);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

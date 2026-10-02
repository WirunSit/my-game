// Who is logged in (phase 6 accounts). Kept in the browser so a refresh
// doesn't log the student out; the server checks the token on every request.
const KEY = 'sciboom.session.v1';

export interface Session {
  /** Login token from the server, or null when playing without an account */
  token: string | null;
  nickname: string;
}

function read(): Session {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { token: null, nickname: '', ...(JSON.parse(raw) as Partial<Session>) };
  } catch {
    // Storage blocked: play without an account
  }
  return { token: null, nickname: '' };
}

export const session: Session = read();

export function saveSession(next: Partial<Session>) {
  Object.assign(session, next);
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

// Who is logged in. Kept in the browser so a refresh doesn't log the student
// out; the server checks the token on every request.
import type { StudentProfile } from '@sciboom/shared';

const KEY = 'sciboom.session.v1';

export interface Session {
  /** Login token from the server, or null when playing without an account */
  token: string | null;
  nickname: string;
  profile: StudentProfile | null;
}

function read(): Session {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { token: null, nickname: '', profile: null, ...(JSON.parse(raw) as Partial<Session>) };
  } catch {
    // Storage blocked: play without an account
  }
  return { token: null, nickname: '', profile: null };
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

export function clearSession() {
  saveSession({ token: null, nickname: '', profile: null });
}

/** Logged in as a student? */
export function isStudent(): boolean {
  return !!session.token && !!session.profile;
}

/** Has the teacher opened this world? (Without an account everything is open) */
export function isWorldOpen(world: number): boolean {
  return !session.profile || session.profile.classroom.openWorlds.includes(world);
}

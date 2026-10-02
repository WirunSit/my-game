import { nicknameProblem, type StudentLogin, type StudentProfile } from '@sciboom/shared';
import { reconcileSave, syncSave } from '../save';
import { ApiError, api } from './api';
import { clearSession, saveSession, session } from './session';

function remember(token: string, profile: StudentProfile) {
  saveSession({ token, profile, nickname: profile.nickname });
}

/** Start-up: check the saved login is still good and fetch the latest progress */
export async function restoreLogin(): Promise<void> {
  if (!session.token) return;
  try {
    const me = await api<{ profile: StudentProfile; save: unknown }>('GET', 'student/me', undefined, { timeoutMs: 5000 });
    remember(session.token, me.profile);
    await reconcileSave(me.save);
  } catch (e) {
    // PIN was reset or the classroom deleted: back to playing as a guest.
    // Offline: keep the login and the copy on this device.
    if (e instanceof ApiError && e.status === 401) clearSession();
  }
}

export async function loginStudent(classCode: string, number: number, pin: string): Promise<StudentProfile> {
  // Save the guest's progress-in-flight first (nothing to do for guests, but harmless)
  await syncSave();
  const res = await api<StudentLogin>('POST', 'student/login', { classCode, number, pin });
  remember(res.token, res.profile);
  await reconcileSave(res.save);
  return res.profile;
}

export async function logout() {
  await syncSave();
  try {
    await api('POST', 'logout');
  } catch {
    // offline: the token just expires on its own
  }
  clearSession();
}

/** Change the student's nickname (checked here and again on the server). Returns an error message or null. */
export async function setNickname(name: string): Promise<string | null> {
  const problem = nicknameProblem(name);
  if (problem) return problem;
  try {
    const res = await api<{ profile: StudentProfile }>('PUT', 'student/nickname', { nickname: name.trim() });
    remember(session.token!, res.profile);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

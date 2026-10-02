import { session } from './session';

/** A request to the server failed; `message` is ready to show (Thai) */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Call the server's REST API (same host as the game; Vite forwards /api while developing) */
export async function api<T>(method: string, path: string, body?: unknown, opts: { timeoutMs?: number; keepalive?: boolean } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
  let res: Response;
  try {
    res = await fetch(`api/${path.replace(/^\/?(api\/)?/, '')}`, {
      method,
      headers: { 'content-type': 'application/json', ...(session.token ? { authorization: `Bearer ${session.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
      keepalive: opts.keepalive,
    });
  } catch {
    throw new ApiError(0, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่');
  } finally {
    clearTimeout(timer);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // not JSON
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
  return data as T;
}

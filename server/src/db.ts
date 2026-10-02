// Database: SQLite file on this computer by default (no setup needed),
// PostgreSQL when DATABASE_URL is set (e.g. Supabase, for the real website).
// SQL is written once with `?` placeholders and runs on both.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

type Param = string | number | null;

export interface Db {
  all<T>(sql: string, params?: Param[]): Promise<T[]>;
  get<T>(sql: string, params?: Param[]): Promise<T | undefined>;
  run(sql: string, params?: Param[]): Promise<number>;
  /** Several statements, no parameters (table setup) */
  exec(sql: string): Promise<void>;
  /** Run `fn` as one transaction; use the `db` it is given inside */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly kind: 'sqlite' | 'postgres';
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS classrooms (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  open_worlds TEXT NOT NULL,
  pvp_open INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  classroom_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  pin TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  save TEXT,
  last_seen BIGINT NOT NULL DEFAULT 0,
  UNIQUE (classroom_id, number)
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS units (
  unit INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  unit INTEGER NOT NULL,
  topic TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  question TEXT NOT NULL,
  choices TEXT NOT NULL,
  answer INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS answers (
  student_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  at BIGINT NOT NULL,
  PRIMARY KEY (student_id, question_id, at)
);
CREATE INDEX IF NOT EXISTS answers_question ON answers (question_id);
CREATE INDEX IF NOT EXISTS students_classroom ON students (classroom_id);
`;

/** Open the database named by DATABASE_URL, or a SQLite file (`:memory:` for tests) */
export async function openDb(target = process.env.DATABASE_URL ?? process.env.SQLITE_FILE ?? 'server/data/sciboom.db'): Promise<Db> {
  const db = /^postgres(ql)?:\/\//.test(target) ? await openPostgres(target) : target === 'pglite' ? await openPglite() : await openSqlite(target);
  await db.exec(SCHEMA);
  return db;
}

async function openSqlite(file: string): Promise<Db> {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const { DatabaseSync } = await import('node:sqlite');
  const sql = new DatabaseSync(file);
  sql.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  // node:sqlite returns BIGINT columns as numbers when they fit, which ours always do
  const plain = <T>(row: unknown) => (row ? ({ ...(row as object) } as T) : undefined);
  let depth = 0;
  const db: Db = {
    kind: 'sqlite',
    all: async <T>(q: string, p: Param[] = []) => sql.prepare(q).all(...p).map((r) => plain<T>(r)!),
    get: async <T>(q: string, p: Param[] = []) => plain<T>(sql.prepare(q).get(...p)),
    run: async (q, p = []) => Number(sql.prepare(q).run(...p).changes),
    exec: async (q) => sql.exec(q),
    tx: async (fn) => {
      // Nested calls just join the outer transaction
      if (depth++ > 0) {
        try {
          return await fn(db);
        } finally {
          depth--;
        }
      }
      sql.exec('BEGIN');
      try {
        const out = await fn(db);
        sql.exec('COMMIT');
        return out;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
    close: async () => sql.close(),
  };
  return db;
}

/** What the Postgres adapter needs from a connection (node-postgres or PGlite) */
interface PgRunner {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null; affectedRows?: number }>;
}

interface PgBackend {
  runner: PgRunner;
  /** Several statements without parameters */
  exec(sql: string): Promise<void>;
  /** Run `fn` inside a transaction on its own connection */
  transaction<T>(fn: (r: PgRunner) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** `?` → `$1, $2, ...` */
function toPg(q: string): string {
  let i = 0;
  return q.replace(/\?/g, () => `$${++i}`);
}

function postgresDb(backend: PgBackend, runner: PgRunner = backend.runner, inTx = false): Db {
  const query = (q: string, p: Param[]) => runner.query(toPg(q), p);
  const db: Db = {
    kind: 'postgres',
    all: async <T>(q: string, p: Param[] = []) => (await query(q, p)).rows as T[],
    get: async <T>(q: string, p: Param[] = []) => (await query(q, p)).rows[0] as T | undefined,
    run: async (q, p = []) => {
      const r = await query(q, p);
      return r.rowCount ?? r.affectedRows ?? 0;
    },
    exec: (q) => backend.exec(q),
    // A transaction gets its own connection, so its queries never mix with other requests
    tx: (fn) => (inTx ? fn(db) : backend.transaction((r) => fn(postgresDb(backend, r, true)))),
    close: () => backend.close(),
  };
  return db;
}

async function openPostgres(url: string): Promise<Db> {
  const { default: pg } = await import('pg');
  // BIGINT (int8) comes back as text by default; our numbers are small enough for JS numbers
  pg.types.setTypeParser(20, (v: string) => Number(v));
  const pool = new pg.Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false }, max: 5 });
  return postgresDb({
    runner: pool,
    exec: async (q) => {
      await pool.query(q);
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  });
}

/** Tests only: real PostgreSQL SQL, running in-process (PGlite), so the Postgres path is checked without a server */
async function openPglite(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const pglite = new PGlite();
  return postgresDb({
    runner: pglite,
    exec: async (q) => {
      await pglite.exec(q);
    },
    transaction: (fn) => pglite.transaction((tx) => fn(tx)),
    close: () => pglite.close(),
  });
}

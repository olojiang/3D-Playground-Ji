import { neon, neonConfig } from "@neondatabase/serverless";

// Dev/test only: point the HTTP driver at a local Neon-compatible endpoint (PGlite shim).
if (process.env.NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;

type Row = Record<string, unknown>;
type QueryFn = (text: string, params: unknown[]) => Promise<Row[]>;

let impl: QueryFn | null = null;
function defaultImpl(): QueryFn {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "postgresql://user:pass@localhost.invalid/db";
  const sql = neon(url);
  return async (text, params) => (await sql.query(text, params)) as Row[];
}

/** Swap the query implementation (tests use in-process PGlite). */
export function setQueryImpl(fn: QueryFn) { impl = fn; }

/** Run a parameterized query ($1, $2 …). The only way the app talks to Postgres. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!impl) impl = defaultImpl();
  await ensureSchema();
  return (await impl(text, params)) as T[];
}

// All tables use the pj_ prefix so the database can be shared safely with other apps.
export const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS pj_users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS pj_users_email ON pj_users (lower(email))`,
  `CREATE TABLE IF NOT EXISTS pj_settings (
    user_id INT PRIMARY KEY REFERENCES pj_users(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS pj_tasks (
    user_id INT NOT NULL REFERENCES pj_users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    est_pomos INT NOT NULL DEFAULT 1,
    act_pomos INT NOT NULL DEFAULT 0,
    done BOOLEAN NOT NULL DEFAULT false,
    tag TEXT,
    project TEXT,
    position DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    done_at BIGINT,
    PRIMARY KEY (user_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS pj_sessions (
    user_id INT NOT NULL REFERENCES pj_users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('focus','short','long')),
    started_at BIGINT NOT NULL,
    ended_at BIGINT NOT NULL,
    planned_sec INT NOT NULL,
    actual_sec INT NOT NULL,
    completed BOOLEAN NOT NULL,
    task_id TEXT,
    task_title TEXT,
    tag TEXT,
    project TEXT,
    PRIMARY KEY (user_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS pj_sessions_user_time ON pj_sessions (user_id, started_at DESC)`,
  // ── v2: GTD. Additive and idempotent: new columns, a projects table, then a one-way fill for legacy rows. ──
  `ALTER TABLE pj_tasks ADD COLUMN IF NOT EXISTS status TEXT`,
  `ALTER TABLE pj_tasks ADD COLUMN IF NOT EXISTS context TEXT`,
  `ALTER TABLE pj_tasks ADD COLUMN IF NOT EXISTS energy TEXT`,
  `ALTER TABLE pj_tasks ADD COLUMN IF NOT EXISTS due_at BIGINT`,
  `ALTER TABLE pj_tasks ADD COLUMN IF NOT EXISTS defer_at BIGINT`,
  `ALTER TABLE pj_tasks ADD COLUMN IF NOT EXISTS planned_on TEXT`,
  `ALTER TABLE pj_tasks ADD COLUMN IF NOT EXISTS waiting_for TEXT`,
  `ALTER TABLE pj_tasks ADD COLUMN IF NOT EXISTS waiting_since BIGINT`,
  `ALTER TABLE pj_tasks ADD COLUMN IF NOT EXISTS project_id TEXT`,
  `CREATE TABLE IF NOT EXISTS pj_projects (
    user_id INT NOT NULL REFERENCES pj_users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','someday','done')),
    position DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    done_at BIGINT,
    PRIMARY KEY (user_id, id)
  )`,
  `UPDATE pj_tasks SET status = CASE WHEN done THEN 'done' ELSE 'next' END WHERE status IS NULL`,
  `INSERT INTO pj_projects (user_id, id, name, created_at, updated_at, position)
     SELECT user_id, 'p_' || md5(lower(btrim(project))), min(btrim(project)), min(created_at), max(updated_at), 0
     FROM pj_tasks WHERE project IS NOT NULL AND btrim(project) <> '' AND project_id IS NULL
     GROUP BY user_id, lower(btrim(project))
   ON CONFLICT (user_id, id) DO NOTHING`,
  `UPDATE pj_tasks SET project_id = 'p_' || md5(lower(btrim(project))) WHERE project IS NOT NULL AND btrim(project) <> '' AND project_id IS NULL`,
  `CREATE INDEX IF NOT EXISTS pj_tasks_user_status ON pj_tasks (user_id, status)`,
];

let schemaPromise: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    if (!impl) impl = defaultImpl();
    const run = impl;
    schemaPromise = (async () => { for (const s of STATEMENTS) await run(s, []); })().catch((e) => { schemaPromise = null; throw e; });
  }
  return schemaPromise;
}
export function resetSchemaCache() { schemaPromise = null; }

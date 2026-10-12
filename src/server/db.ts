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

// All tables use the tp_ prefix so the database can be shared safely with other apps.
// Every user-owned row carries user_id and every query filters by it: that is the isolation boundary.
export const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tp_users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tp_users_email ON tp_users (lower(email))`,
  `CREATE TABLE IF NOT EXISTS tp_settings (
    user_id INT PRIMARY KEY REFERENCES tp_users(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS tp_progress (
    user_id INT NOT NULL REFERENCES tp_users(id) ON DELETE CASCADE,
    example_id TEXT NOT NULL,
    visited_at BIGINT NOT NULL,
    completed_at BIGINT,
    PRIMARY KEY (user_id, example_id)
  )`,
  `CREATE TABLE IF NOT EXISTS tp_favorites (
    user_id INT NOT NULL REFERENCES tp_users(id) ON DELETE CASCADE,
    example_id TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, example_id)
  )`,
  `CREATE TABLE IF NOT EXISTS tp_snippets (
    user_id INT NOT NULL REFERENCES tp_users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    example_id TEXT,
    code TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS tp_snippets_user_updated ON tp_snippets (user_id, updated_at DESC)`,
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

/** Data access. Every function that touches user data takes the user id first and filters by it. */
import { q } from "./db";
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings, type Snippet, type SnippetMeta, type ProgressEntry } from "@/core/userdata";

export interface UserRow { id: number; email: string; name: string; password_hash: string }
export interface PublicUser { id: number; email: string; name: string }

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const [u] = await q<UserRow>("SELECT id, email, name, password_hash FROM tp_users WHERE lower(email) = lower($1)", [email]);
  return u ? { ...u, id: Number(u.id) } : null;
}
export async function createUser(email: string, hash: string, name: string): Promise<number> {
  const [r] = await q<{ id: number }>("INSERT INTO tp_users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id", [email, hash, name]);
  return Number(r.id);
}
export async function getUser(id: number): Promise<PublicUser | null> {
  const [u] = await q<PublicUser>("SELECT id, email, name FROM tp_users WHERE id = $1", [id]);
  return u ? { ...u, id: Number(u.id) } : null;
}
export async function getPasswordHash(id: number): Promise<string | null> {
  const [u] = await q<{ password_hash: string }>("SELECT password_hash FROM tp_users WHERE id = $1", [id]);
  return u?.password_hash ?? null;
}
export const setPassword = (id: number, hash: string) => q("UPDATE tp_users SET password_hash = $2 WHERE id = $1", [id, hash]);
export const setName = (id: number, name: string) => q("UPDATE tp_users SET name = $2 WHERE id = $1", [id, name]);
export const userExists = async (id: number) => (await q("SELECT 1 FROM tp_users WHERE id = $1", [id])).length > 0;
export const deleteUser = (id: number) => q("DELETE FROM tp_users WHERE id = $1", [id]);

/* settings */
export async function getSettings(uid: number): Promise<Settings> {
  const [r] = await q<{ data: unknown }>("SELECT data FROM tp_settings WHERE user_id = $1", [uid]);
  const data = typeof r?.data === "string" ? JSON.parse(r.data) : r?.data;
  return sanitizeSettings(data ?? DEFAULT_SETTINGS);
}
export async function saveSettings(uid: number, s: Settings) {
  await q(`INSERT INTO tp_settings (user_id, data, updated_at) VALUES ($1, $2::jsonb, now())
           ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [uid, JSON.stringify(s)]);
}

/* progress */
const toProgress = (r: { example_id: string; visited_at: string | number; completed_at: string | number | null }): ProgressEntry =>
  ({ exampleId: r.example_id, visitedAt: Number(r.visited_at), completedAt: r.completed_at == null ? null : Number(r.completed_at) });
export async function listProgress(uid: number): Promise<ProgressEntry[]> {
  return (await q("SELECT example_id, visited_at, completed_at FROM tp_progress WHERE user_id = $1 ORDER BY visited_at DESC", [uid])).map(toProgress);
}
/** completed: true sets completion, false clears it, undefined leaves it as is. */
export async function touchProgress(uid: number, exampleId: string, at: number, completed?: boolean) {
  const c = completed === undefined ? null : completed ? at : null;
  const [r] = await q(`INSERT INTO tp_progress (user_id, example_id, visited_at, completed_at) VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, example_id) DO UPDATE SET visited_at = GREATEST(tp_progress.visited_at, EXCLUDED.visited_at),
      completed_at = CASE WHEN $5 THEN EXCLUDED.completed_at ELSE tp_progress.completed_at END
    RETURNING example_id, visited_at, completed_at`, [uid, exampleId, at, c, completed !== undefined]);
  return toProgress(r);
}

/* favorites */
export async function listFavorites(uid: number): Promise<string[]> {
  return (await q<{ example_id: string }>("SELECT example_id FROM tp_favorites WHERE user_id = $1 ORDER BY created_at DESC", [uid])).map((r) => r.example_id);
}
export async function setFavorite(uid: number, exampleId: string, on: boolean, at: number) {
  if (on) await q("INSERT INTO tp_favorites (user_id, example_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [uid, exampleId, at]);
  else await q("DELETE FROM tp_favorites WHERE user_id = $1 AND example_id = $2", [uid, exampleId]);
}

/* snippets */
type SnipRow = { id: string; title: string; example_id: string | null; code?: string; size?: number | string; created_at: string | number; updated_at: string | number };
const toMeta = (r: SnipRow): SnippetMeta => ({ id: r.id, title: r.title, exampleId: r.example_id, size: Number(r.size ?? 0), createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) });
const toSnippet = (r: SnipRow): Snippet => ({ id: r.id, title: r.title, exampleId: r.example_id, code: r.code ?? "", createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) });
export const MAX_SNIPPETS = 300;
export async function listSnippets(uid: number): Promise<SnippetMeta[]> {
  return (await q<SnipRow>("SELECT id, title, example_id, length(code) AS size, created_at, updated_at FROM tp_snippets WHERE user_id = $1 ORDER BY updated_at DESC", [uid])).map(toMeta);
}
export const countSnippets = async (uid: number) => Number((await q<{ n: string }>("SELECT count(*) AS n FROM tp_snippets WHERE user_id = $1", [uid]))[0].n);
export async function getSnippet(uid: number, id: string): Promise<Snippet | null> {
  const [r] = await q<SnipRow>("SELECT id, title, example_id, code, created_at, updated_at FROM tp_snippets WHERE user_id = $1 AND id = $2", [uid, id]);
  return r ? toSnippet(r) : null;
}
export async function createSnippet(uid: number, s: Snippet) {
  await q("INSERT INTO tp_snippets (user_id, id, title, example_id, code, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [uid, s.id, s.title, s.exampleId, s.code, s.createdAt, s.updatedAt]);
}
export async function updateSnippet(uid: number, id: string, s: { title: string; exampleId: string | null; code: string }, at: number): Promise<Snippet | null> {
  const [r] = await q<SnipRow>(`UPDATE tp_snippets SET title = $3, example_id = $4, code = $5, updated_at = $6 WHERE user_id = $1 AND id = $2
    RETURNING id, title, example_id, code, created_at, updated_at`, [uid, id, s.title, s.exampleId, s.code, at]);
  return r ? toSnippet(r) : null;
}
export async function deleteSnippet(uid: number, id: string): Promise<boolean> {
  return (await q("DELETE FROM tp_snippets WHERE user_id = $1 AND id = $2 RETURNING id", [uid, id])).length > 0;
}
export async function allSnippets(uid: number): Promise<Snippet[]> {
  return (await q<SnipRow>("SELECT id, title, example_id, code, created_at, updated_at FROM tp_snippets WHERE user_id = $1 ORDER BY updated_at DESC", [uid])).map(toSnippet);
}

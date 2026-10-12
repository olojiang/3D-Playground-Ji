/**
 * HTTP handler logic, framework-agnostic (Request → Response) so it is unit-testable.
 * Files under src/app/api only wire these to Next.js routes.
 */
import { z } from "zod";
import * as repo from "./repo";
import { hashPassword, verifyPassword, signSession, sessionCookie, clearCookie, userIdFromRequest } from "./auth";
import { sanitizeSettings, snippetInput, EXAMPLE_ID, newId, type Snippet } from "@/core/userdata";

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
const fail = (error: string, status = 400) => json({ error }, status);

async function body(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { return null; }
}

type Authed = (req: Request, userId: number, params: Record<string, string>) => Promise<Response>;
/** Wrap a handler so it only runs for a signed-in user whose account still exists. */
export function authed(fn: Authed) {
  return async (req: Request, params: Record<string, string> = {}) => {
    const uid = await userIdFromRequest(req);
    if (!uid) return fail("unauthorized", 401);
    try {
      if (!(await repo.userExists(uid))) return fail("unauthorized", 401);
      return await fn(req, uid, params);
    } catch (e) {
      console.error(e);
      return fail("server_error", 500);
    }
  };
}

/* ---------- auth ---------- */
const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().max(200),
  name: z.string().trim().max(40).optional().default(""),
});

// Best-effort brute-force brake per email (per server instance).
const attempts = new Map<string, { n: number; until: number }>();
const LOCK_AFTER = 8, LOCK_MS = 5 * 60_000;
export const resetThrottle = () => attempts.clear();

export async function register(req: Request) {
  const r = credentials.safeParse(await body(req));
  if (!r.success) return fail(r.error.issues.some((i) => i.path[0] === "email") ? "bad_email" : "invalid");
  const { email, password, name } = r.data;
  if (password.length < 8) return fail("weak");
  if (await repo.findUserByEmail(email)) return fail("exists", 409);
  let id: number;
  try {
    id = await repo.createUser(email, await hashPassword(password), name);
  } catch {
    return fail("exists", 409); // unique index race
  }
  return json({ user: { id, email, name } }, 201, { "Set-Cookie": sessionCookie(await signSession(id)) });
}

export async function login(req: Request) {
  const r = credentials.safeParse(await body(req));
  if (!r.success) return fail("invalid", 401);
  const key = r.data.email;
  const a = attempts.get(key);
  if (a && a.n >= LOCK_AFTER && Date.now() < a.until) return fail("locked", 429);
  const u = await repo.findUserByEmail(r.data.email);
  if (!u || !(await verifyPassword(r.data.password, u.password_hash))) {
    const n = (a && Date.now() < a.until ? a.n : 0) + 1;
    attempts.set(key, { n, until: Date.now() + LOCK_MS });
    return fail("invalid", 401);
  }
  attempts.delete(key);
  return json({ user: { id: u.id, email: u.email, name: u.name } }, 200, { "Set-Cookie": sessionCookie(await signSession(u.id)) });
}

export const logout = async () => json({ ok: true }, 200, { "Set-Cookie": clearCookie() });

export async function me(req: Request) {
  const uid = await userIdFromRequest(req);
  const user = uid ? await repo.getUser(uid) : null;
  return json({ user });
}

export const deleteAccount = authed(async (req, uid) => {
  const b = (await body(req)) as { password?: unknown } | null;
  const hash = await repo.getPasswordHash(uid);
  if (!hash || typeof b?.password !== "string" || !(await verifyPassword(b.password, hash))) return fail("invalid", 403);
  await repo.deleteUser(uid);
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
});

const profileSchema = z.object({ name: z.string().trim().max(40) });
export const updateProfile = authed(async (req, uid) => {
  const r = profileSchema.safeParse(await body(req));
  if (!r.success) return fail("invalid");
  await repo.setName(uid, r.data.name);
  return json({ user: await repo.getUser(uid) });
});

const pwSchema = z.object({ current: z.string().max(200), next: z.string().max(200) });
export const changePassword = authed(async (req, uid) => {
  const r = pwSchema.safeParse(await body(req));
  if (!r.success) return fail("invalid");
  if (r.data.next.length < 8) return fail("weak");
  const hash = await repo.getPasswordHash(uid);
  if (!hash || !(await verifyPassword(r.data.current, hash))) return fail("invalid", 403);
  await repo.setPassword(uid, await hashPassword(r.data.next));
  return json({ ok: true });
});

/* ---------- settings ---------- */
export const getSettings = authed(async (_req, uid) => json({ settings: await repo.getSettings(uid) }));
export const putSettings = authed(async (req, uid) => {
  const b = await body(req);
  if (!b || typeof b !== "object") return fail("invalid");
  const merged = sanitizeSettings(b, await repo.getSettings(uid));
  await repo.saveSettings(uid, merged);
  return json({ settings: merged });
});

/* ---------- progress & favorites ---------- */
const exampleRef = z.object({ exampleId: z.string().regex(EXAMPLE_ID), completed: z.boolean().optional() });
export const getProgress = authed(async (_req, uid) => json({ progress: await repo.listProgress(uid) }));
export const postProgress = authed(async (req, uid) => {
  const r = exampleRef.safeParse(await body(req));
  if (!r.success) return fail("invalid");
  return json({ entry: await repo.touchProgress(uid, r.data.exampleId, Date.now(), r.data.completed) });
});

const favSchema = z.object({ exampleId: z.string().regex(EXAMPLE_ID), on: z.boolean() });
export const getFavorites = authed(async (_req, uid) => json({ favorites: await repo.listFavorites(uid) }));
export const putFavorite = authed(async (req, uid) => {
  const r = favSchema.safeParse(await body(req));
  if (!r.success) return fail("invalid");
  await repo.setFavorite(uid, r.data.exampleId, r.data.on, Date.now());
  return json({ favorites: await repo.listFavorites(uid) });
});

/* ---------- snippets ---------- */
const SNIP_ID = /^[A-Za-z0-9]{6,32}$/;
export const listSnippets = authed(async (_req, uid) => json({ snippets: await repo.listSnippets(uid) }));
export const createSnippet = authed(async (req, uid) => {
  const r = snippetInput.safeParse(await body(req));
  if (!r.success) return fail("invalid");
  if ((await repo.countSnippets(uid)) >= repo.MAX_SNIPPETS) return fail("limit", 409);
  const now = Date.now();
  const s: Snippet = { id: newId(), title: r.data.title, exampleId: r.data.exampleId ?? null, code: r.data.code, createdAt: now, updatedAt: now };
  await repo.createSnippet(uid, s);
  return json({ snippet: s }, 201);
});
export const getSnippet = authed(async (_req, uid, p) => {
  if (!SNIP_ID.test(p.id ?? "")) return fail("not_found", 404);
  const s = await repo.getSnippet(uid, p.id);
  return s ? json({ snippet: s }) : fail("not_found", 404);
});
export const putSnippet = authed(async (req, uid, p) => {
  if (!SNIP_ID.test(p.id ?? "")) return fail("not_found", 404);
  const r = snippetInput.safeParse(await body(req));
  if (!r.success) return fail("invalid");
  const s = await repo.updateSnippet(uid, p.id, { title: r.data.title, exampleId: r.data.exampleId ?? null, code: r.data.code }, Date.now());
  return s ? json({ snippet: s }) : fail("not_found", 404);
});
export const deleteSnippet = authed(async (_req, uid, p) => {
  if (!SNIP_ID.test(p.id ?? "")) return fail("not_found", 404);
  return (await repo.deleteSnippet(uid, p.id)) ? json({ ok: true }) : fail("not_found", 404);
});

/* ---------- export / import ---------- */
export const exportData = authed(async (_req, uid) => {
  const [user, settings, progress, favorites, snippets] = await Promise.all([
    repo.getUser(uid), repo.getSettings(uid), repo.listProgress(uid), repo.listFavorites(uid), repo.allSnippets(uid),
  ]);
  return json({ app: "3d-playground-ji", version: 1, exportedAt: new Date().toISOString(), user: { email: user?.email, name: user?.name }, settings, progress, favorites, snippets }, 200,
    { "Content-Disposition": `attachment; filename="3d-playground-backup.json"` });
});

const importSchema = z.object({
  app: z.literal("3d-playground-ji"),
  version: z.literal(1),
  settings: z.unknown().optional(),
  progress: z.array(z.object({ exampleId: z.string().regex(EXAMPLE_ID), visitedAt: z.number(), completedAt: z.number().nullable() })).max(2000).default([]),
  favorites: z.array(z.string().regex(EXAMPLE_ID)).max(2000).default([]),
  snippets: z.array(snippetInput.extend({ createdAt: z.number().optional() })).max(300).default([]),
});
/** Merge a backup into the current account (never deletes; snippets are added as new copies). */
export const importData = authed(async (req, uid) => {
  const r = importSchema.safeParse(await body(req));
  if (!r.success) return fail("invalid");
  const d = r.data;
  if (d.settings) await repo.saveSettings(uid, sanitizeSettings(d.settings, await repo.getSettings(uid)));
  for (const p of d.progress) {
    await repo.touchProgress(uid, p.exampleId, p.visitedAt);
    if (p.completedAt) await repo.touchProgress(uid, p.exampleId, p.visitedAt, true);
  }
  for (const f of d.favorites) await repo.setFavorite(uid, f, true, Date.now());
  const room = repo.MAX_SNIPPETS - (await repo.countSnippets(uid));
  let added = 0;
  for (const s of d.snippets.slice(0, Math.max(0, room))) {
    const now = Date.now();
    await repo.createSnippet(uid, { id: newId(), title: s.title, exampleId: s.exampleId ?? null, code: s.code, createdAt: s.createdAt ?? now, updatedAt: now });
    added++;
  }
  return json({ ok: true, imported: { progress: d.progress.length, favorites: d.favorites.length, snippets: added } });
});

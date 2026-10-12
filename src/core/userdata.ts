/** User-owned data shapes (settings, progress, favorites, snippets) and their validation. Shared by client and server. */
import { z } from "zod";
import { isThemePref, type ThemePref } from "./themes";
import { isValidBinding, SHORTCUTS } from "./shortcuts";
import { CATEGORIES, type Category } from "./examples";

export type Lang = "zh" | "en";
export const LANGS: Lang[] = ["zh", "en"];
export const isLang = (v: unknown): v is Lang => v === "zh" || v === "en";

export interface Settings {
  theme: ThemePref;
  lang: Lang;
  editorFontSize: number;
  layout: "split" | "stacked";
  motion: "system" | "full" | "reduced";
  autoRun: boolean;
  shortcuts: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = { theme: "system", lang: "zh", editorFontSize: 14, layout: "split", motion: "system", autoRun: true, shortcuts: {} };
export const FONT_MIN = 11, FONT_MAX = 22;

/** Merge untrusted input over defaults, dropping anything invalid. Never throws. */
export function sanitizeSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const s: Settings = { ...base, shortcuts: { ...base.shortcuts } };
  if (isThemePref(o.theme)) s.theme = o.theme;
  if (isLang(o.lang)) s.lang = o.lang;
  if (typeof o.editorFontSize === "number" && Number.isFinite(o.editorFontSize)) s.editorFontSize = Math.round(Math.min(FONT_MAX, Math.max(FONT_MIN, o.editorFontSize)));
  if (o.layout === "split" || o.layout === "stacked") s.layout = o.layout;
  if (o.motion === "system" || o.motion === "full" || o.motion === "reduced") s.motion = o.motion;
  if (typeof o.autoRun === "boolean") s.autoRun = o.autoRun;
  if (o.shortcuts && typeof o.shortcuts === "object") {
    const ids = new Set(SHORTCUTS.map((d) => d.id));
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.shortcuts as Record<string, unknown>)) if (ids.has(k) && isValidBinding(v)) next[k] = v;
    s.shortcuts = next;
  }
  return s;
}

export const EXAMPLE_ID = /^(three|webgl|gpu)\/[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_CODE = 200_000;

export const snippetInput = z.object({
  title: z.string().trim().min(1).max(80),
  exampleId: z.string().regex(EXAMPLE_ID).nullable().optional().default(null),
  code: z.string().max(MAX_CODE),
});
export type SnippetInput = z.infer<typeof snippetInput>;
export interface Snippet { id: string; title: string; exampleId: string | null; code: string; createdAt: number; updatedAt: number }
export type SnippetMeta = Omit<Snippet, "code"> & { size: number };

export interface ProgressEntry { exampleId: string; visitedAt: number; completedAt: number | null }

export interface TrackProgress { category: Category; done: number; total: number; pct: number }
export function trackProgress(progress: ProgressEntry[], catalog: { category: Category; slug: string }[]): TrackProgress[] {
  const done = new Set(progress.filter((p) => p.completedAt).map((p) => p.exampleId));
  return CATEGORIES.map((category) => {
    const items = catalog.filter((e) => e.category === category);
    const d = items.filter((e) => done.has(`${e.category}/${e.slug}`)).length;
    return { category, done: d, total: items.length, pct: items.length ? Math.round((d / items.length) * 100) : 0 };
  });
}

/** The lesson to resume: the most recently visited one that is not completed, else the first not completed. */
export function resumeTarget(progress: ProgressEntry[], catalog: { category: Category; slug: string }[]): { category: Category; slug: string } | null {
  const byId = new Map(progress.map((p) => [p.exampleId, p]));
  const open = [...progress].filter((p) => !p.completedAt).sort((a, b) => b.visitedAt - a.visitedAt);
  for (const p of open) { const e = catalog.find((c) => `${c.category}/${c.slug}` === p.exampleId); if (e) return e; }
  return catalog.find((e) => !byId.get(`${e.category}/${e.slug}`)?.completedAt) ?? null;
}

export const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`).replace(/-/g, "").slice(0, 20);

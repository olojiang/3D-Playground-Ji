/**
 * Data source abstraction: guests keep everything in localStorage, signed-in users talk to the API.
 * The UI only ever sees this interface, so both modes behave identically.
 */
import { sanitizeSettings, snippetInput, newId, MAX_CODE, type Settings, type Snippet, type SnippetMeta, type SnippetInput, type ProgressEntry } from "@/core/userdata";

export interface DataSource {
  kind: "local" | "remote";
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  listProgress(): Promise<ProgressEntry[]>;
  touch(exampleId: string, completed?: boolean): Promise<ProgressEntry>;
  listFavorites(): Promise<string[]>;
  setFavorite(exampleId: string, on: boolean): Promise<string[]>;
  listSnippets(): Promise<SnippetMeta[]>;
  getSnippet(id: string): Promise<Snippet | null>;
  createSnippet(s: SnippetInput): Promise<Snippet>;
  updateSnippet(id: string, s: SnippetInput): Promise<Snippet | null>;
  deleteSnippet(id: string): Promise<boolean>;
}

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export const LS = { settings: "tp-settings", progress: "tp-progress", favorites: "tp-favorites", snippets: "tp-snippets" } as const;

export class LocalSource implements DataSource {
  kind = "local" as const;
  constructor(private kv: KV, private now: () => number = () => Date.now()) {}
  private read<T>(k: string, fallback: T): T {
    try { const v = this.kv.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
  }
  private write(k: string, v: unknown) { this.kv.setItem(k, JSON.stringify(v)); }

  async getSettings() { return sanitizeSettings(this.read(LS.settings, {})); }
  async saveSettings(patch: Partial<Settings>) {
    const s = sanitizeSettings(patch, await this.getSettings());
    this.write(LS.settings, s);
    return s;
  }
  async listProgress() { return this.read<ProgressEntry[]>(LS.progress, []).sort((a, b) => b.visitedAt - a.visitedAt); }
  async touch(exampleId: string, completed?: boolean) {
    const list = await this.listProgress();
    const at = this.now();
    let e = list.find((p) => p.exampleId === exampleId);
    if (!e) { e = { exampleId, visitedAt: at, completedAt: null }; list.push(e); }
    e.visitedAt = Math.max(e.visitedAt, at);
    if (completed !== undefined) e.completedAt = completed ? at : null;
    this.write(LS.progress, list);
    return { ...e };
  }
  async listFavorites() { return this.read<string[]>(LS.favorites, []); }
  async setFavorite(exampleId: string, on: boolean) {
    const f = (await this.listFavorites()).filter((x) => x !== exampleId);
    if (on) f.unshift(exampleId);
    this.write(LS.favorites, f);
    return f;
  }
  private snippets() { return this.read<Snippet[]>(LS.snippets, []); }
  async listSnippets(): Promise<SnippetMeta[]> {
    return this.snippets().sort((a, b) => b.updatedAt - a.updatedAt).map(({ code, ...m }) => ({ ...m, size: code.length }));
  }
  async getSnippet(id: string) { return this.snippets().find((s) => s.id === id) ?? null; }
  async createSnippet(input: SnippetInput) {
    const d = snippetInput.parse(input);
    const at = this.now();
    const s: Snippet = { id: newId(), title: d.title, exampleId: d.exampleId ?? null, code: d.code.slice(0, MAX_CODE), createdAt: at, updatedAt: at };
    this.write(LS.snippets, [s, ...this.snippets()]);
    return s;
  }
  async updateSnippet(id: string, input: SnippetInput) {
    const d = snippetInput.parse(input);
    const all = this.snippets();
    const s = all.find((x) => x.id === id);
    if (!s) return null;
    Object.assign(s, { title: d.title, exampleId: d.exampleId ?? null, code: d.code, updatedAt: this.now() });
    this.write(LS.snippets, all);
    return { ...s };
  }
  async deleteSnippet(id: string) {
    const all = this.snippets();
    const next = all.filter((s) => s.id !== id);
    this.write(LS.snippets, next);
    return next.length !== all.length;
  }
  /** Everything a guest has, in the backup format the server's /api/import accepts. */
  async exportBackup() {
    return { app: "3d-playground-ji" as const, version: 1 as const, settings: await this.getSettings(), progress: await this.listProgress(), favorites: await this.listFavorites(), snippets: this.snippets() };
  }
  hasData() { return this.snippets().length > 0 || this.read<unknown[]>(LS.progress, []).length > 0 || this.read<unknown[]>(LS.favorites, []).length > 0; }
  clearUserData() { for (const k of [LS.progress, LS.favorites, LS.snippets]) this.kv.removeItem(k); }
}

export class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }

export async function api<T>(path: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<T> {
  const res = await fetcher(path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) }, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || "error");
  return data as T;
}

export class RemoteSource implements DataSource {
  kind = "remote" as const;
  constructor(private fetcher: typeof fetch = (...a) => fetch(...a)) {}
  private call<T>(path: string, init?: RequestInit) { return api<T>(path, init, this.fetcher); }
  async getSettings() { return (await this.call<{ settings: Settings }>("/api/settings")).settings; }
  async saveSettings(patch: Partial<Settings>) { return (await this.call<{ settings: Settings }>("/api/settings", { method: "PUT", body: JSON.stringify(patch) })).settings; }
  async listProgress() { return (await this.call<{ progress: ProgressEntry[] }>("/api/progress")).progress; }
  async touch(exampleId: string, completed?: boolean) { return (await this.call<{ entry: ProgressEntry }>("/api/progress", { method: "POST", body: JSON.stringify({ exampleId, completed }) })).entry; }
  async listFavorites() { return (await this.call<{ favorites: string[] }>("/api/favorites")).favorites; }
  async setFavorite(exampleId: string, on: boolean) { return (await this.call<{ favorites: string[] }>("/api/favorites", { method: "PUT", body: JSON.stringify({ exampleId, on }) })).favorites; }
  async listSnippets() { return (await this.call<{ snippets: SnippetMeta[] }>("/api/snippets")).snippets; }
  async getSnippet(id: string) {
    try { return (await this.call<{ snippet: Snippet }>(`/api/snippets/${encodeURIComponent(id)}`)).snippet; }
    catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
  }
  async createSnippet(s: SnippetInput) { return (await this.call<{ snippet: Snippet }>("/api/snippets", { method: "POST", body: JSON.stringify(s) })).snippet; }
  async updateSnippet(id: string, s: SnippetInput) {
    try { return (await this.call<{ snippet: Snippet }>(`/api/snippets/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(s) })).snippet; }
    catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
  }
  async deleteSnippet(id: string) {
    try { await this.call(`/api/snippets/${encodeURIComponent(id)}`, { method: "DELETE" }); return true; }
    catch (e) { if (e instanceof ApiError && e.status === 404) return false; throw e; }
  }
}

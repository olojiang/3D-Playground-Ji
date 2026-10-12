import { describe, it, expect } from "vitest";
import { LocalSource, RemoteSource, ApiError, type KV } from "@/client/source";

class Mem implements KV { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }

describe("LocalSource (guest mode)", () => {
  it("persists sanitized settings", async () => {
    const kv = new Mem();
    const s = new LocalSource(kv);
    await s.saveSettings({ theme: "gold", editorFontSize: 1 });
    expect(await new LocalSource(kv).getSettings()).toMatchObject({ theme: "gold", editorFontSize: 11 });
  });
  it("survives corrupted storage", async () => {
    const kv = new Mem();
    kv.setItem("tp-settings", "{oops");
    kv.setItem("tp-snippets", "nope");
    const s = new LocalSource(kv);
    expect((await s.getSettings()).theme).toBe("system");
    expect(await s.listSnippets()).toEqual([]);
  });
  it("tracks progress like the server does", async () => {
    let t = 10;
    const s = new LocalSource(new Mem(), () => t);
    await s.touch("three/materials");
    t = 20;
    expect((await s.touch("three/materials", true)).completedAt).toBe(20);
    t = 30;
    const e = await s.touch("three/materials");
    expect(e).toEqual({ exampleId: "three/materials", visitedAt: 30, completedAt: 20 });
    expect((await s.touch("three/materials", false)).completedAt).toBeNull();
  });
  it("toggles favorites newest first", async () => {
    const s = new LocalSource(new Mem());
    await s.setFavorite("a/x", true);
    await s.setFavorite("three/b", true);
    expect(await s.setFavorite("a/x", true)).toEqual(["a/x", "three/b"]);
    expect(await s.setFavorite("a/x", false)).toEqual(["three/b"]);
  });
  it("snippet CRUD and backup export", async () => {
    let t = 1;
    const s = new LocalSource(new Mem(), () => t);
    const a = await s.createSnippet({ title: "A", code: "aa", exampleId: null });
    t = 2;
    const b = await s.createSnippet({ title: "B", code: "b", exampleId: "gpu/game-of-life" });
    expect((await s.listSnippets()).map((x) => x.title)).toEqual(["B", "A"]);
    t = 3;
    await s.updateSnippet(a.id, { title: "A2", code: "aaa", exampleId: null });
    expect((await s.listSnippets())[0]).toMatchObject({ title: "A2", size: 3 });
    expect(await s.updateSnippet("missing", { title: "x", code: "", exampleId: null })).toBeNull();
    expect(await s.deleteSnippet(b.id)).toBe(true);
    expect(await s.deleteSnippet(b.id)).toBe(false);
    await expect(s.createSnippet({ title: "", code: "", exampleId: null })).rejects.toThrow();
    expect(s.hasData()).toBe(true);
    const backup = await s.exportBackup();
    expect(backup).toMatchObject({ app: "3d-playground-ji", version: 1, snippets: [expect.objectContaining({ title: "A2" })] });
    s.clearUserData();
    expect(s.hasData()).toBe(false);
  });
});

describe("RemoteSource", () => {
  it("maps 404 to null/false and other errors to ApiError", async () => {
    const f = (async (url: string) => new Response(JSON.stringify({ error: url.includes("boom") ? "server_error" : "not_found" }), { status: url.includes("boom") ? 500 : 404 })) as unknown as typeof fetch;
    const r = new RemoteSource(f);
    expect(await r.getSnippet("abc")).toBeNull();
    expect(await r.deleteSnippet("abc")).toBe(false);
    await expect(r.getSnippet("boom")).rejects.toBeInstanceOf(ApiError);
  });
});

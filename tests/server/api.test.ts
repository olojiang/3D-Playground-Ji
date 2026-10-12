import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { usePglite } from "../helpers/pglite";
import { Client } from "../helpers/api";
import * as h from "@/server/handlers";

beforeAll(async () => { await usePglite(); });
beforeEach(() => h.resetThrottle());

describe("auth", () => {
  it("registers, reads me, logs out and logs back in", async () => {
    const c = new Client();
    const r = await c.register("Wei@Example.com", "password123", "Wei");
    expect(r.status).toBe(201);
    expect(r.data.user.email).toBe("wei@example.com");
    expect(c.cookie).toMatch(/^tp_session=/);
    expect((await c.call(h.me)).data.user.name).toBe("Wei");
    await c.call(h.logout, { method: "POST" });
    expect(c.cookie).toBe("");
    expect((await c.call(h.me)).data.user).toBeNull();
    expect((await c.call(h.login, { body: { email: "WEI@example.com", password: "password123" } })).status).toBe(200);
    expect((await c.call(h.me)).data.user.email).toBe("wei@example.com");
  });
  it("rejects duplicates, weak passwords, bad emails and wrong passwords", async () => {
    const c = new Client();
    await c.register("dup@x.com");
    expect((await new Client().register("DUP@x.com")).status).toBe(409);
    expect((await new Client().register("w@x.com", "short")).data.error).toBe("weak");
    expect((await new Client().register("nope", "password123")).data.error).toBe("bad_email");
    expect((await new Client().call(h.login, { body: { email: "dup@x.com", password: "wrongwrong" } })).status).toBe(401);
    expect((await new Client().call(h.login, { raw: "{not json" })).status).toBe(401);
  });
  it("locks an email after repeated failures", async () => {
    await new Client().register("lock@x.com");
    for (let i = 0; i < 8; i++) await new Client().call(h.login, { body: { email: "lock@x.com", password: "badbadbad" } });
    expect((await new Client().call(h.login, { body: { email: "lock@x.com", password: "password123" } })).status).toBe(429);
  });
  it("rejects forged and missing sessions", async () => {
    const c = new Client();
    c.cookie = "tp_session=eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjF9.forged";
    expect((await c.call(h.getSettings)).status).toBe(401);
    expect((await new Client().call(h.listSnippets)).status).toBe(401);
  });
  it("changes password and profile name", async () => {
    const c = new Client();
    await c.register("pw@x.com");
    expect((await c.call(h.changePassword, { method: "PUT", body: { current: "nope", next: "newpassword1" } })).status).toBe(403);
    expect((await c.call(h.changePassword, { method: "PUT", body: { current: "password123", next: "short" } })).data.error).toBe("weak");
    expect((await c.call(h.changePassword, { method: "PUT", body: { current: "password123", next: "newpassword1" } })).status).toBe(200);
    expect((await new Client().call(h.login, { body: { email: "pw@x.com", password: "newpassword1" } })).status).toBe(200);
    expect((await c.call(h.updateProfile, { method: "PUT", body: { name: "  Ji  " } })).data.user.name).toBe("Ji");
  });
  it("deletes the account only with the right password, and the session dies with it", async () => {
    const c = new Client();
    await c.register("del@x.com");
    const stale = c.cookie;
    expect((await c.call(h.deleteAccount, { method: "DELETE", body: { password: "wrong" } })).status).toBe(403);
    expect((await c.call(h.deleteAccount, { method: "DELETE", body: { password: "password123" } })).status).toBe(200);
    const ghost = new Client(); ghost.cookie = stale;
    expect((await ghost.call(h.getSettings)).status).toBe(401);
  });
});

describe("settings", () => {
  it("defaults, merges and sanitizes", async () => {
    const c = new Client();
    await c.register("set@x.com");
    expect((await c.call(h.getSettings)).data.settings.theme).toBe("system");
    const r = await c.call(h.putSettings, { method: "PUT", body: { theme: "gold", editorFontSize: 3, junk: 1 } });
    expect(r.data.settings).toMatchObject({ theme: "gold", editorFontSize: 11 });
    await c.call(h.putSettings, { method: "PUT", body: { lang: "en" } });
    expect((await c.call(h.getSettings)).data.settings).toMatchObject({ theme: "gold", lang: "en" });
    expect((await c.call(h.putSettings, { method: "PUT", raw: "[" })).status).toBe(400);
  });
});

describe("progress & favorites", () => {
  it("tracks visits and completion", async () => {
    const c = new Client();
    await c.register("prog@x.com");
    await c.call(h.postProgress, { body: { exampleId: "three/materials" } });
    let e = (await c.call(h.postProgress, { body: { exampleId: "three/materials", completed: true } })).data.entry;
    expect(e.completedAt).toBeTypeOf("number");
    e = (await c.call(h.postProgress, { body: { exampleId: "three/materials" } })).data.entry;
    expect(e.completedAt).toBeTypeOf("number"); // a plain visit keeps completion
    e = (await c.call(h.postProgress, { body: { exampleId: "three/materials", completed: false } })).data.entry;
    expect(e.completedAt).toBeNull();
    expect((await c.call(h.postProgress, { body: { exampleId: "../../x" } })).status).toBe(400);
    expect((await c.call(h.getProgress)).data.progress).toHaveLength(1);
  });
  it("toggles favorites idempotently", async () => {
    const c = new Client();
    await c.register("fav@x.com");
    await c.call(h.putFavorite, { method: "PUT", body: { exampleId: "gpu/game-of-life", on: true } });
    await c.call(h.putFavorite, { method: "PUT", body: { exampleId: "gpu/game-of-life", on: true } });
    expect((await c.call(h.getFavorites)).data.favorites).toEqual(["gpu/game-of-life"]);
    await c.call(h.putFavorite, { method: "PUT", body: { exampleId: "gpu/game-of-life", on: false } });
    expect((await c.call(h.getFavorites)).data.favorites).toEqual([]);
  });
});

describe("snippets", () => {
  it("CRUD", async () => {
    const c = new Client();
    await c.register("snip@x.com");
    const created = (await c.call(h.createSnippet, { body: { title: "Waves", exampleId: "webgl/uniforms", code: "console.log(1)" } })).data.snippet;
    expect(created.id).toMatch(/^[A-Za-z0-9]+$/);
    const list = (await c.call(h.listSnippets)).data.snippets;
    expect(list).toEqual([expect.objectContaining({ id: created.id, title: "Waves", size: 14 })]);
    expect(list[0].code).toBeUndefined();
    const upd = await c.call(h.putSnippet, { method: "PUT", params: { id: created.id }, body: { title: "Waves 2", code: "x" } });
    expect(upd.data.snippet).toMatchObject({ title: "Waves 2", code: "x", exampleId: null });
    expect((await c.call(h.getSnippet, { params: { id: created.id } })).data.snippet.title).toBe("Waves 2");
    expect((await c.call(h.deleteSnippet, { method: "DELETE", params: { id: created.id } })).status).toBe(200);
    expect((await c.call(h.getSnippet, { params: { id: created.id } })).status).toBe(404);
    expect((await c.call(h.getSnippet, { params: { id: "bad id!" } })).status).toBe(404);
    expect((await c.call(h.createSnippet, { body: { title: "", code: "" } })).status).toBe(400);
  });
});

describe("export / import", () => {
  it("round-trips a backup into another account", async () => {
    const a = new Client();
    await a.register("exp@x.com");
    await a.call(h.putSettings, { method: "PUT", body: { theme: "purple" } });
    await a.call(h.postProgress, { body: { exampleId: "webgl/noise-fbm", completed: true } });
    await a.call(h.putFavorite, { method: "PUT", body: { exampleId: "webgl/noise-fbm", on: true } });
    await a.call(h.createSnippet, { body: { title: "Mine", code: "1" } });
    const backup = (await a.call(h.exportData)).data;
    expect(backup).toMatchObject({ app: "3d-playground-ji", version: 1 });
    const b = new Client();
    await b.register("imp@x.com");
    const r = await b.call(h.importData, { body: backup });
    expect(r.data.imported).toEqual({ progress: 1, favorites: 1, snippets: 1 });
    expect((await b.call(h.getSettings)).data.settings.theme).toBe("purple");
    expect((await b.call(h.getProgress)).data.progress[0].completedAt).toBeTypeOf("number");
    expect((await b.call(h.importData, { body: { app: "other" } })).status).toBe(400);
  });
});

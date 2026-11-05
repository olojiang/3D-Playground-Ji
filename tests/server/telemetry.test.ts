import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { usePglite } from "../helpers/pglite";
import { Client } from "../helpers/api";
import * as h from "@/server/handlers";

let pg: PGlite;
beforeAll(async () => { pg = await usePglite(); });
beforeEach(() => h.resetTelemetryLimits());

const rows = async () => (await pg.query<{ user_id: number | null; kind: string; message: string; stack: string | null; path: string }>("SELECT user_id, kind, message, stack, path FROM tp_client_errors ORDER BY id")).rows;
const report = (c: Client, body: unknown, ip = "10.0.0.1") => c.call(h.postTelemetry, { body, headers: { "x-forwarded-for": ip } });

describe("POST /api/telemetry", () => {
  it("stores a scrubbed report anonymously, with the user id when signed in", async () => {
    await pg.query("DELETE FROM tp_client_errors");
    const anon = new Client();
    expect((await report(anon, { kind: "sandbox", message: "boom for a@b.com", path: "/learn/three/materials?q=1" })).status).toBe(204);
    const me = new Client();
    const uid = (await me.register("tele@x.com")).data.user.id;
    expect((await report(me, { kind: "window", message: "oops", stack: "at x", path: "/playground" }, "10.0.0.2")).status).toBe(204);
    const r = await rows();
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ user_id: null, kind: "sandbox", message: "boom for <email>", path: "/learn/three/materials" });
    expect(r[1]).toMatchObject({ user_id: uid, kind: "window", stack: "at x" });
  });
  it("rejects invalid reports and oversized bodies", async () => {
    const c = new Client();
    expect((await report(c, { kind: "nope", message: "x" })).status).toBe(400);
    expect((await c.call(h.postTelemetry, { raw: "{not json", headers: { "x-forwarded-for": "10.0.0.3" } })).status).toBe(400);
    expect((await c.call(h.postTelemetry, { raw: JSON.stringify({ kind: "window", message: "m".repeat(40_000) }), headers: { "x-forwarded-for": "10.0.0.3" } })).status).toBe(413);
  });
  it("rate-limits per client and does not store over the limit", async () => {
    await pg.query("DELETE FROM tp_client_errors");
    const c = new Client();
    const codes: number[] = [];
    for (let i = 0; i < 15; i++) codes.push((await report(c, { kind: "window", message: `e${i}`, path: "/" }, "10.9.9.9")).status);
    expect(codes.filter((s) => s === 204).length).toBe(h.TELEMETRY_LIMIT);
    expect(codes.slice(h.TELEMETRY_LIMIT).every((s) => s === 429)).toBe(true);
    expect((await rows()).length).toBe(h.TELEMETRY_LIMIT);
    // another client is unaffected
    expect((await report(new Client(), { kind: "window", message: "x", path: "/" }, "10.8.8.8")).status).toBe(204);
  });
  it("never stores the ip address", async () => {
    await report(new Client(), { kind: "window", message: "ipcheck", path: "/" }, "203.0.113.77");
    const all = JSON.stringify((await pg.query("SELECT * FROM tp_client_errors")).rows);
    expect(all).not.toContain("203.0.113.77");
  });
});

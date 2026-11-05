import { describe, it, expect } from "vitest";
import { sanitizeReport, scrub, RateLimiter, MAX_BODY, MAX_MESSAGE, MAX_STACK, ClientThrottle } from "@/core/telemetry";

describe("telemetry report validation", () => {
  it("accepts a minimal valid report and normalises it", () => {
    const r = sanitizeReport({ kind: "sandbox", message: "TypeError: x is undefined", path: "/learn/three/materials?x=1#y" });
    expect(r).toEqual({ kind: "sandbox", message: "TypeError: x is undefined", stack: null, path: "/learn/three/materials", exampleId: null });
  });
  it("rejects unknown kinds, missing messages and junk", () => {
    for (const bad of [null, "x", 42, [], {}, { kind: "nope", message: "m" }, { kind: "window" }, { kind: "window", message: "" }, { kind: "window", message: 5 }]) expect(sanitizeReport(bad)).toBeNull();
  });
  it("caps message and stack size", () => {
    const r = sanitizeReport({ kind: "window", message: "m".repeat(5000), stack: "s".repeat(50_000), path: "/" })!;
    expect(r.message.length).toBeLessThanOrEqual(MAX_MESSAGE);
    expect(r.stack!.length).toBeLessThanOrEqual(MAX_STACK);
    expect(MAX_BODY).toBeLessThanOrEqual(16_384);
  });
  it("keeps only a safe pathname and a valid lesson id", () => {
    expect(sanitizeReport({ kind: "window", message: "m", path: "https://evil.com/a?token=1" })!.path).toBe("/a");
    expect(sanitizeReport({ kind: "window", message: "m", path: "javascript:alert(1)" })!.path).toBe("/");
    expect(sanitizeReport({ kind: "window", message: "m", path: "/s/" + "A".repeat(22) })!.path).toBe("/s/:id");
    expect(sanitizeReport({ kind: "window", message: "m", path: "/playground", exampleId: "three/materials" })!.exampleId).toBe("three/materials");
    expect(sanitizeReport({ kind: "window", message: "m", path: "/playground", exampleId: "../../x" })!.exampleId).toBeNull();
  });
  it("drops unknown fields (no user agent, ip, or anything else stored)", () => {
    const r = sanitizeReport({ kind: "unhandledrejection", message: "m", path: "/", userAgent: "UA", email: "a@b.com", ip: "1.2.3.4" })!;
    expect(Object.keys(r).sort()).toEqual(["exampleId", "kind", "message", "path", "stack"]);
  });
});

describe("PII scrubbing", () => {
  it("removes emails, query strings, tokens, ips and long numbers", () => {
    const s = scrub("failed for wei@example.com at https://3d.827722.xyz/api/x?token=abc123 from 192.168.1.20 key=eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjF9.sig card 4111111111111111");
    expect(s).not.toContain("wei@example.com");
    expect(s).not.toContain("token=abc123");
    expect(s).not.toContain("192.168.1.20");
    expect(s).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(s).not.toContain("4111111111111111");
    expect(s).toContain("<email>");
    expect(s).toContain("https://3d.827722.xyz/api/x");
  });
  it("leaves ordinary stack traces readable", () => {
    const st = "TypeError: a is null\n    at main (blob:null/1234:10:5)";
    expect(scrub(st)).toBe(st);
  });
});

describe("rate limiter", () => {
  it("allows `limit` hits per window per key, then blocks until the window passes", () => {
    let now = 0;
    const rl = new RateLimiter(3, 60_000, () => now);
    expect([rl.hit("a"), rl.hit("a"), rl.hit("a"), rl.hit("a")]).toEqual([true, true, true, false]);
    expect(rl.hit("b")).toBe(true);
    now = 60_001;
    expect(rl.hit("a")).toBe(true);
  });
  it("forgets old keys so memory stays bounded", () => {
    let now = 0;
    const rl = new RateLimiter(1, 1000, () => now, 100);
    for (let i = 0; i < 500; i++) rl.hit(`k${i}`);
    expect(rl.size).toBeLessThanOrEqual(100);
    now = 5000;
    rl.hit("z");
    expect(rl.size).toBeLessThanOrEqual(100);
  });
});

describe("client throttle", () => {
  it("dedupes identical errors and caps reports per page", () => {
    const t = new ClientThrottle(3);
    expect(t.allow("a")).toBe(true);
    expect(t.allow("a")).toBe(false);
    expect(t.allow("b")).toBe(true);
    expect(t.allow("c")).toBe(true);
    expect(t.allow("d")).toBe(false);
  });
});

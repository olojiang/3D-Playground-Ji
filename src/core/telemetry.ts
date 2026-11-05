/**
 * Lightweight, self-hosted client error reporting: validation, PII scrubbing and rate limiting.
 * Shared by the browser reporter (src/client/telemetry.ts) and the /api/telemetry handler.
 */
import { EXAMPLE_ID } from "./userdata";
import { SHARE_ID } from "./share";

export const TELEMETRY_KINDS = ["sandbox", "window", "unhandledrejection"] as const;
export type TelemetryKind = (typeof TELEMETRY_KINDS)[number];
export interface TelemetryReport { kind: TelemetryKind; message: string; stack: string | null; path: string; exampleId: string | null }

export const MAX_BODY = 8_192;
export const MAX_MESSAGE = 500;
export const MAX_STACK = 4_000;

/** Strip things that could identify a person or leak a secret. Ordinary stack traces pass through unchanged. */
export function scrub(s: string): string {
  return s
    .replace(/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g, "<email>")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+){1,2}/g, "<token>")
    .replace(/(https?:\/\/[^\s?#"']+)[?#][^\s"']*/g, "$1")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<ip>")
    .replace(/\b\d{12,}\b/g, "<number>")
    .replace(/\b(token|key|secret|password|auth|session)=([^\s&]+)/gi, "$1=<redacted>");
}

/** Only the pathname of a same-site path; share ids collapse to /s/:id so links never land in logs. */
export function safePath(input: unknown): string {
  if (typeof input !== "string") return "/";
  let p = input.trim();
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(p)) { const u = new URL(p); p = u.protocol === "http:" || u.protocol === "https:" ? u.pathname : "/"; }
  } catch { return "/"; }
  p = p.split(/[?#]/)[0];
  if (!p.startsWith("/")) return "/";
  p = p.replace(/\/s\/[^/]+/, (m) => (SHARE_ID.test(m.slice(3)) ? "/s/:id" : m)).slice(0, 200);
  return /^[\w\-./:]*$/.test(p) ? p : "/";
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function sanitizeReport(input: unknown): TelemetryReport | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  if (!(TELEMETRY_KINDS as readonly string[]).includes(o.kind as string)) return null;
  if (typeof o.message !== "string" || !o.message.trim()) return null;
  const stack = typeof o.stack === "string" && o.stack.trim() ? clip(scrub(o.stack.slice(0, MAX_STACK + 200)), MAX_STACK) : null;
  return {
    kind: o.kind as TelemetryKind,
    message: clip(scrub(o.message.trim().slice(0, MAX_MESSAGE + 200)), MAX_MESSAGE),
    stack,
    path: safePath(o.path),
    exampleId: typeof o.exampleId === "string" && EXAMPLE_ID.test(o.exampleId) ? o.exampleId : null,
  };
}

/** Fixed-window limiter, per key, bounded memory. */
export class RateLimiter {
  private m = new Map<string, { n: number; start: number }>();
  constructor(private limit: number, private windowMs: number, private now: () => number = () => Date.now(), private maxKeys = 10_000) {}
  get size() { return this.m.size; }
  hit(key: string): boolean {
    const t = this.now();
    let e = this.m.get(key);
    if (!e || t - e.start > this.windowMs) {
      if (this.m.size >= this.maxKeys) this.evict(t);
      e = { n: 0, start: t };
      this.m.set(key, e);
    }
    e.n++;
    return e.n <= this.limit;
  }
  reset() { this.m.clear(); }
  private evict(t: number) {
    for (const [k, v] of this.m) if (t - v.start > this.windowMs) this.m.delete(k);
    while (this.m.size >= this.maxKeys) { const first = this.m.keys().next().value; if (first === undefined) break; this.m.delete(first); }
  }
}

/** Browser side: one report per distinct error, and at most `max` per page load. */
export class ClientThrottle {
  private seen = new Set<string>();
  constructor(private max = 10) {}
  allow(signature: string): boolean {
    if (this.seen.has(signature) || this.seen.size >= this.max) return false;
    this.seen.add(signature);
    return true;
  }
}

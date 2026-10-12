/** Console panel model: append sandbox messages, collapse consecutive duplicates, cap memory. */
export type LogLevel = "log" | "info" | "warn" | "error";
export interface LogEntry { id: number; level: LogLevel; text: string; count: number; at: number }

export const MAX_LOGS = 400;
let seq = 0;

export function appendLog(list: LogEntry[], level: LogLevel, text: string, at = Date.now(), cap = MAX_LOGS): LogEntry[] {
  const t = text.length > 4000 ? text.slice(0, 4000) + " …" : text;
  const last = list[list.length - 1];
  if (last && last.level === level && last.text === t) return [...list.slice(0, -1), { ...last, count: last.count + 1, at }];
  const next = [...list, { id: ++seq, level, text: t, count: 1, at }];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export const countErrors = (list: LogEntry[]) => list.reduce((n, e) => n + (e.level === "error" ? e.count : 0), 0);

/** Messages the sandbox iframe posts to the host (see public/sandbox.html). */
export type SandboxMessage =
  | { source: "pg-sandbox"; type: "ready" | "started" }
  | { source: "pg-sandbox"; type: "console"; level: LogLevel; text: string }
  | { source: "pg-sandbox"; type: "error"; text: string }
  | { source: "pg-sandbox"; type: "fps"; fps: number };

export function isSandboxMessage(d: unknown): d is SandboxMessage {
  if (!d || typeof d !== "object") return false;
  const m = d as Record<string, unknown>;
  if (m.source !== "pg-sandbox" || typeof m.type !== "string") return false;
  if (m.type === "console") return ["log", "info", "warn", "error"].includes(m.level as string) && typeof m.text === "string";
  if (m.type === "error") return typeof m.text === "string";
  if (m.type === "fps") return typeof m.fps === "number";
  return m.type === "ready" || m.type === "started";
}

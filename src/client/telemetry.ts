/**
 * Browser error reporter: window errors, unhandled rejections and sandbox runtime errors → POST /api/telemetry.
 * Deduped and capped per page load (ClientThrottle); the server scrubs and rate-limits again.
 */
import { ClientThrottle, sanitizeReport, MAX_BODY, type TelemetryKind } from "@/core/telemetry";
import { isSandboxMessage } from "@/core/console";

const lessonFromPath = (p: string) => p.match(/^\/learn\/((?:three|webgl|gpu)\/[a-z0-9-]+)/)?.[1] ?? null;

export function installErrorReporter(opts: { endpoint?: string; max?: number; send?: (body: string) => void } = {}) {
  const endpoint = opts.endpoint ?? "/api/telemetry";
  const throttle = new ClientThrottle(opts.max ?? 10);
  const send = opts.send ?? ((body: string) => { fetch(endpoint, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" }, credentials: "same-origin" }).catch(() => {}); });

  const report = (kind: TelemetryKind, message: string, stack?: string) => {
    const path = window.location.pathname;
    const r = sanitizeReport({ kind, message, stack, path, exampleId: lessonFromPath(path) });
    if (!r || !throttle.allow(`${kind}|${r.message}`)) return;
    const body = JSON.stringify(r);
    if (body.length <= MAX_BODY) send(body);
  };

  const onError = (e: ErrorEvent) => report("window", e.message || String(e.error), e.error?.stack);
  const onRejection = (e: PromiseRejectionEvent) => {
    const reason = e.reason as { message?: string; stack?: string } | undefined;
    report("unhandledrejection", reason?.message || String(e.reason), reason?.stack);
  };
  const onMessage = (e: MessageEvent) => {
    if (!isSandboxMessage(e.data) || e.data.type !== "error") return;
    const [first, ...rest] = e.data.text.split("\n");
    report("sandbox", first, rest.join("\n") || undefined);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("message", onMessage);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("message", onMessage);
  };
}

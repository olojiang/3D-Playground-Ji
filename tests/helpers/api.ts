import * as h from "@/server/handlers";

/** Tiny in-process HTTP client that keeps a cookie jar, like a browser would. */
export class Client {
  cookie = "";
  async call(fn: (req: Request, params?: Record<string, string>) => Promise<Response>, opts: { method?: string; body?: unknown; raw?: string; params?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.cookie) headers.cookie = this.cookie;
    const req = new Request("http://test.local/api", {
      method: opts.method ?? (opts.body !== undefined || opts.raw !== undefined ? "POST" : "GET"),
      headers,
      body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
    const res = await fn(req, opts.params ?? {});
    const set = res.headers.get("set-cookie");
    if (set) {
      const [pair] = set.split(";");
      this.cookie = pair.endsWith("=") ? "" : pair;
    }
    const text = await res.text();
    let data: any = text; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { data = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, data, headers: res.headers };
  }
  register(email: string, password = "password123", name = "") {
    return this.call(h.register, { body: { email, password, name } });
  }
}

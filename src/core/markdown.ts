/**
 * A deliberately small markdown subset for lesson articles and docs, parsed into a tree
 * (rendered by React, never via innerHTML). Supported: ## / ### headings, paragraphs, - and 1. lists,
 * fenced code with a language, > callouts, **bold**, `code`, [links](https://…).
 */
export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "bold"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { type: "h2" | "h3"; id: string; c: Inline[]; text: string }
  | { type: "p"; c: Inline[] }
  | { type: "ul" | "ol"; items: Inline[][] }
  | { type: "code"; lang: string; code: string }
  | { type: "quote"; c: Inline[] };

const SAFE_HREF = /^(https?:\/\/|\/|#)/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => { if (buf) { out.push({ t: "text", v: buf }); buf = ""; } };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "`") {
      const j = src.indexOf("`", i + 1);
      if (j > i) { flush(); out.push({ t: "code", v: src.slice(i + 1, j) }); i = j + 1; continue; }
    }
    if (ch === "*" && src[i + 1] === "*") {
      const j = src.indexOf("**", i + 2);
      if (j > i + 1) { flush(); out.push({ t: "bold", c: parseInline(src.slice(i + 2, j)) }); i = j + 2; continue; }
    }
    if (ch === "[") {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m && SAFE_HREF.test(m[2])) { flush(); out.push({ t: "link", href: m[2], c: parseInline(m[1]) }); i += m[0].length; continue; }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

export const inlineText = (c: Inline[]): string => c.map((n) => (n.t === "text" || n.t === "code" ? n.v : inlineText(n.c))).join("");

/** URL-safe heading id; keeps CJK characters so Chinese headings get readable anchors. */
export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "section";
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  const ids = new Map<string, number>();
  const uniqueId = (text: string) => {
    const base = slugify(text);
    const n = ids.get(base) ?? 0;
    ids.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = /^```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (or EOF)
      blocks.push({ type: "code", lang: fence[1] || "text", code: body.join("\n") });
      continue;
    }
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      const c = parseInline(h[2].trim());
      const text = inlineText(c);
      blocks.push({ type: h[1].length === 2 ? "h2" : "h3", id: uniqueId(text), c, text });
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ type: "quote", c: parseInline(body.join(" ").trim()) });
      continue;
    }
    const isUl = (l: string) => /^\s*[-*]\s+/.test(l);
    const isOl = (l: string) => /^\s*\d+[.)]\s+/.test(l);
    if (isUl(line) || isOl(line)) {
      const ordered = isOl(line);
      const test = ordered ? isOl : isUl;
      const items: Inline[][] = [];
      while (i < lines.length && lines[i].trim()) {
        if (test(lines[i])) items.push(parseInline(lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/, "")));
        else if (items.length) items[items.length - 1].push({ t: "text", v: " " }, ...parseInline(lines[i].trim())); // continuation
        i++;
      }
      blocks.push({ type: ordered ? "ol" : "ul", items });
      continue;
    }
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|```|>|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i])) body.push(lines[i++].trim());
    blocks.push({ type: "p", c: parseInline(body.join(" ")) });
  }
  return blocks;
}

export const headings = (blocks: Block[]) =>
  blocks.filter((b): b is Extract<Block, { type: "h2" | "h3" }> => b.type === "h2" || b.type === "h3").map((b) => ({ id: b.id, text: b.text, level: b.type === "h2" ? 2 : 3 }));

/** Rough reading time in minutes (CJK ≈ 400 chars/min, Latin ≈ 220 words/min). */
export function readingMinutes(src: string): number {
  const cjk = (src.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = src.replace(/[\u4e00-\u9fff]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(cjk / 400 + words / 220));
}

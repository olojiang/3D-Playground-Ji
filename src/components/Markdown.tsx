"use client";
import { Fragment, useMemo, useState } from "react";
import { Copy, Check, Lightbulb } from "lucide-react";
import { parseMarkdown, type Block, type Inline } from "@/core/markdown";
import { tokenize, normalizeLang, type TokenKind } from "@/core/highlight";
import { useApp } from "@/client/app-context";
import { cx } from "./ui";

const TOKEN_COLOR: Record<TokenKind, string | undefined> = {
  kw: "var(--syn-keyword)", type: "var(--syn-type)", fn: "var(--syn-fn)", num: "var(--syn-number)", str: "var(--syn-string)", com: "var(--syn-comment)", punct: "var(--muted)", plain: undefined,
};

export function CodeBlock({ code, lang, className }: { code: string; lang: string; className?: string }) {
  const { t } = useApp();
  const [copied, setCopied] = useState(false);
  const tokens = useMemo(() => tokenize(code, lang), [code, lang]);
  const copy = async () => { await navigator.clipboard?.writeText(code).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400); };
  return (
    <div className={cx("group relative my-4 overflow-hidden rounded-xl border border-line bg-code", className)}>
      <div className="flex h-8 items-center justify-between border-b border-line px-3">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">{normalizeLang(lang) === "text" ? lang : normalizeLang(lang)}</span>
        <button onClick={copy} aria-label={t("run.copy")} className="ring-focus flex items-center gap-1 rounded px-1.5 text-[11px] text-faint opacity-0 transition hover:text-fg group-hover:opacity-100 focus-visible:opacity-100">
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}{copied ? t("run.copied") : t("run.copy")}
        </button>
      </div>
      <pre className="scroll-thin overflow-x-auto p-3.5 font-mono text-[12.5px] leading-[1.7]"><code>
        {tokens.map((tk, i) => <span key={i} style={{ color: TOKEN_COLOR[tk.k], fontStyle: tk.k === "com" ? "italic" : undefined }}>{tk.v}</span>)}
      </code></pre>
    </div>
  );
}

function Inlines({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((n, i) => {
        if (n.t === "text") return <Fragment key={i}>{n.v}</Fragment>;
        if (n.t === "code") return <code key={i}>{n.v}</code>;
        if (n.t === "bold") return <strong key={i}><Inlines c={n.c} /></strong>;
        const external = /^https?:/.test(n.href);
        return <a key={i} href={n.href} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}><Inlines c={n.c} /></a>;
      })}
    </>
  );
}

export function MarkdownBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="prose-lab">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h2": return <h2 key={i} id={b.id}><Inlines c={b.c} /></h2>;
          case "h3": return <h3 key={i} id={b.id}><Inlines c={b.c} /></h3>;
          case "p": return <p key={i}><Inlines c={b.c} /></p>;
          case "ul": return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inlines c={it} /></li>)}</ul>;
          case "ol": return <ol key={i}>{b.items.map((it, j) => <li key={j}><Inlines c={it} /></li>)}</ol>;
          case "code": return <CodeBlock key={i} code={b.code} lang={b.lang} />;
          case "quote": return (
            <div key={i} className="my-5 flex gap-3 rounded-xl border border-line bg-accent-soft/60 px-4 py-3 text-[14px] leading-relaxed">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
              <div className="text-fg/90"><Inlines c={b.c} /></div>
            </div>
          );
        }
      })}
    </div>
  );
}

export function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return <MarkdownBlocks blocks={blocks} />;
}

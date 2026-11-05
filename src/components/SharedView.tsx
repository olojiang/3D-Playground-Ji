"use client";
/** Public, read-only view of a shared snippet: live preview in the sandbox + source, with "Fork to my Playground". */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitFork, Link2, RotateCcw, Globe2, AlertTriangle, Code2, MonitorPlay, BookOpen } from "lucide-react";
import { useApp } from "@/client/app-context";
import { isSandboxMessage } from "@/core/console";
import { PLAYGROUND_DRAFT_KEY, type SharedSnippet } from "@/core/share";
import { timeAgo } from "@/core/i18n";
import { Button, Chip, IconButton } from "./ui";
import { CodeBlock } from "./Markdown";
import { useCatalog } from "./Providers";
import { copyText } from "./ShareButton";

function SharedPreview({ code, runKey, onError }: { code: string; runKey: number; onError: (text: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Client-only: an SSR'd iframe can post "ready" before this listener exists, and the code would never run.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !isSandboxMessage(e.data)) return;
      if (e.data.type === "ready") frame.current?.contentWindow?.postMessage({ target: "pg-sandbox", type: "run", code }, "*");
      if (e.data.type === "error") onError(e.data.text);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [code, onError]);
  if (!mounted) return null;
  return (
    <iframe key={runKey} ref={frame} src="/sandbox.html" title="preview" sandbox="allow-scripts allow-pointer-lock" allow="fullscreen; gamepad; xr-spatial-tracking"
      className="absolute inset-0 h-full w-full border-0 bg-[#07070a]" />
  );
}

export function SharedView({ snippet }: { snippet: SharedSnippet }) {
  const { t, lang, toast } = useApp();
  const router = useRouter();
  const catalog = useCatalog();
  const [runKey, setRunKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lesson = snippet.exampleId ? catalog.find((e) => `${e.category}/${e.slug}` === snippet.exampleId) : null;

  const fork = () => {
    try { localStorage.setItem(PLAYGROUND_DRAFT_KEY, JSON.stringify({ code: snippet.code, title: snippet.title })); } catch { toast(t("common.error"), "error"); return; }
    toast(t("share.forked"), "success");
    router.push("/playground");
  };
  const copy = async () => { if (await copyText(window.location.href.split(/[?#]/)[0])) toast(t("share.copied"), "success"); };
  const rerun = () => { setError(null); setRunKey((k) => k + 1); };

  return (
    <div className="backdrop-ambient min-h-dvh">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-6 sm:px-6 lg:h-dvh lg:py-5">
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface2 text-accent-text shadow-card"><Globe2 className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-faint">
              <span className="font-semibold uppercase tracking-[0.12em]">{t("share.sharedSnippet")}</span>
              <Chip>{t("share.readOnly")}</Chip>
              <span suppressHydrationWarning>{t("share.updated", { when: timeAgo(lang, snippet.updatedAt) })}</span>
            </div>
            <h1 className="mt-1 truncate font-display text-[22px] font-semibold tracking-[-0.015em] sm:text-[26px]">{snippet.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lesson && (
              <Link href={`/learn/${lesson.category}/${lesson.slug}`}>
                <Button size="sm" variant="ghost" icon={<BookOpen className="h-4 w-4" />}><span className="max-w-[16rem] truncate">{t("share.basedOn", { title: lesson.title[lang] })}</span></Button>
              </Link>
            )}
            <Button size="sm" variant="secondary" icon={<Link2 className="h-4 w-4" />} onClick={copy}>{t("share.copyLink")}</Button>
            <Button size="sm" variant="primary" icon={<GitFork className="h-4 w-4" />} onClick={fork}>{t("share.fork")}</Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <section className="relative flex min-h-[340px] flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card lg:order-2 lg:basis-[56%]">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 text-[13px] font-medium">
              <MonitorPlay className="h-4 w-4 text-accent-text" />{t("share.preview")}
              <IconButton size="sm" label={t("run.run")} onClick={rerun} className="ml-auto"><RotateCcw className="h-4 w-4" /></IconButton>
            </div>
            <div className="relative min-h-[300px] flex-1">
              <SharedPreview code={snippet.code} runKey={runKey} onError={setError} />
            </div>
            {error && (
              <div className="flex items-start gap-2 border-t border-line px-3 py-2 font-mono text-[12px] text-danger" style={{ background: "color-mix(in srgb, var(--danger) 10%, transparent)" }}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="line-clamp-3 whitespace-pre-wrap">{error}</span>
              </div>
            )}
          </section>
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card lg:order-1 lg:basis-[44%]">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 text-[13px] font-medium"><Code2 className="h-4 w-4 text-accent-text" />{t("share.code")}</div>
            <div className="scroll-thin min-h-0 flex-1 overflow-auto px-3">
              <CodeBlock code={snippet.code} lang="js" className="!my-3" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

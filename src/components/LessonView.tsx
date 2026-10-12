"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Star, CheckCircle2, Circle, BookOpenText, Clock, Puzzle, ListChecks, Cpu } from "lucide-react";
import { useApp } from "@/client/app-context";
import { useShortcutHandlers } from "@/client/shortcuts";
import { neighbours, examplePath, exampleId, type Example } from "@/core/examples";
import { parseMarkdown, headings, readingMinutes } from "@/core/markdown";
import type { MessageKey } from "@/core/i18n";
import { MarkdownBlocks } from "./Markdown";
import { Workbench, type WorkbenchTab } from "./Workbench";
import { Chip, IconButton, cx } from "./ui";
import { TrackGlyph } from "./brand";
import { useCatalog } from "./Providers";

const draftKey = (id: string) => `tp-draft:${id}`;

export function LessonView({ example }: { example: Example }) {
  const { t, lang, isFavorite, isDone, toggleFavorite, setDone, visit, source, toast, user } = useApp();
  const catalog = useCatalog();
  const router = useRouter();
  const id = exampleId(example);
  // a local draft of this lesson survives navigation and reloads
  const [code, setCode] = useState(() => (typeof window !== "undefined" && localStorage.getItem(draftKey(id))) || example.code);
  const savedId = useRef<string | null>(null);
  const nb = useMemo(() => neighbours(catalog, example), [catalog, example]);

  useEffect(() => { visit(id); }, [id]);
  useEffect(() => {
    if (code === example.code) localStorage.removeItem(draftKey(id));
    else localStorage.setItem(draftKey(id), code);
  }, [code]);

  const save = async () => {
    try {
      const input = { title: example.title[lang], exampleId: id, code };
      if (savedId.current && (await source.updateSnippet(savedId.current, input))) toast(t("run.updated"), "success");
      else { savedId.current = (await source.createSnippet(input)).id; toast(user ? t("run.saved") : `${t("run.saved")} · ${t("run.loginToSave")}`, "success"); }
    } catch { toast(t("common.error"), "error"); }
  };

  useShortcutHandlers({
    "lesson.prev": () => nb.prev && router.push(examplePath(nb.prev)),
    "lesson.next": () => nb.next && router.push(examplePath(nb.next)),
    "lesson.favorite": () => toggleFavorite(id),
    "lesson.complete": () => setDone(id, !isDone(id)),
  }, [nb, id, isDone]);

  const article = example.concepts[lang];
  const blocks = useMemo(() => parseMarkdown(article), [article]);
  const toc = useMemo(() => headings(blocks), [blocks]);
  const fav = isFavorite(id), done = isDone(id);

  const conceptTab: WorkbenchTab = {
    id: "concepts", label: t("lesson.concepts"), icon: BookOpenText,
    content: (
      <div className="mx-auto max-w-[760px] px-5 py-6 sm:px-7">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-[12.5px] text-faint">
          <Clock className="h-3.5 w-3.5" />{t("lesson.readingTime", { min: readingMinutes(article) })}
          {toc.length > 2 && <span className="mx-1">·</span>}
          {toc.length > 2 && toc.filter((h) => h.level === 2).map((h) => (
            <a key={h.id} href={`#${h.id}`} className="rounded-md px-1.5 py-0.5 text-muted transition hover:bg-surface2 hover:text-fg">{h.text}</a>
          ))}
        </div>
        {example.requires === "webgpu" && (
          <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-[13px] text-muted"><Cpu className="h-4 w-4 text-accent-text" />{t("lesson.requiresWebgpu")}</div>
        )}
        <MarkdownBlocks blocks={blocks} />
        <section className="mt-8">
          <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-faint"><Puzzle className="h-4 w-4" />{t("lesson.keyApis")}</h3>
          <div className="flex flex-wrap gap-1.5">{example.keyApis.map((a) => <code key={a} className="rounded-lg border border-line bg-surface2 px-2 py-1 font-mono text-[12px] text-fg/90">{a}</code>)}</div>
        </section>
        <section className="mt-8 rounded-2xl border border-line bg-gradient-to-br from-accent-soft/70 to-transparent p-5">
          <h3 className="mb-3 flex items-center gap-2 text-[14px] font-semibold"><ListChecks className="h-4 w-4 text-accent-text" />{t("lesson.tryThis")}</h3>
          <ol className="space-y-2.5">
            {example.tryThis[lang].map((x, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-fg/90">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg">{i + 1}</span>{x}
              </li>
            ))}
          </ol>
        </section>
        <div className="mt-8 grid grid-cols-2 gap-3">
          {nb.prev ? <NavCard dir="prev" title={nb.prev.title[lang]} href={examplePath(nb.prev)} label={t("lesson.prev")} /> : <span />}
          {nb.next ? <NavCard dir="next" title={nb.next.title[lang]} href={examplePath(nb.next)} label={t("lesson.next")} /> : <span />}
        </div>
      </div>
    ),
  };

  const header = (
    <div className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4">
      <TrackGlyph category={example.category} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[12px] text-faint">
          <Link href={`/learn/${example.category}`} className="hover:text-fg">{t(`cat.${example.category}.title` as MessageKey)}</Link>
          <ChevronRight className="h-3 w-3" />
          <span>{t("lesson.of", { index: nb.index + 1, total: nb.total })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate font-display text-[19px] font-semibold tracking-[-0.01em]">{example.title[lang]}</h1>
          <Chip tone={example.difficulty === "advanced" ? "warning" : example.difficulty === "intermediate" ? "accent" : "success"}>{t(`diff.${example.difficulty}` as MessageKey)}</Chip>
          <Chip>{t(`req.${example.requires}` as MessageKey)}</Chip>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <IconButton label={t("lesson.prev")} disabled={!nb.prev} onClick={() => nb.prev && router.push(examplePath(nb.prev))}><ChevronLeft className="h-[18px] w-[18px]" /></IconButton>
        <IconButton label={t("lesson.next")} disabled={!nb.next} onClick={() => nb.next && router.push(examplePath(nb.next))}><ChevronRight className="h-[18px] w-[18px]" /></IconButton>
        <span className="mx-1 h-5 w-px bg-line" />
        <IconButton label={fav ? t("lesson.unfavorite") : t("lesson.favorite")} active={fav} onClick={() => toggleFavorite(id)}>
          <Star className={cx("h-[18px] w-[18px] transition-transform", fav && "scale-110")} fill={fav ? "currentColor" : "none"} />
        </IconButton>
        <button onClick={() => setDone(id, !done)}
          className={cx("ring-focus ml-1 flex h-9 items-center gap-2 rounded-xl border px-3 text-[13px] font-medium transition-all duration-base active:scale-[0.98]",
            done ? "border-transparent bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-success" : "border-line bg-surface text-muted shadow-card hover:text-fg")}>
          {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          <span className="hidden sm:inline">{done ? t("lesson.done") : t("lesson.markDone")}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-dvh max-lg:h-auto max-lg:min-h-[calc(100dvh-56px)]">
      <Workbench key={id} storageKey={id} code={code} setCode={setCode} originalCode={example.code} tabsBefore={[conceptTab]} onSave={save} header={header} />
    </div>
  );
}

function NavCard({ dir, title, href, label }: { dir: "prev" | "next"; title: string; href: string; label: string }) {
  return (
    <Link href={href} className={cx("ring-focus group rounded-xl border border-line bg-surface p-3.5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift", dir === "next" && "text-right")}>
      <div className={cx("flex items-center gap-1 text-[11.5px] text-faint", dir === "next" && "justify-end")}>
        {dir === "prev" && <ChevronLeft className="h-3.5 w-3.5" />}{label}{dir === "next" && <ChevronRight className="h-3.5 w-3.5" />}
      </div>
      <div className="mt-1 truncate text-[14px] font-medium group-hover:text-accent-text">{title}</div>
    </Link>
  );
}

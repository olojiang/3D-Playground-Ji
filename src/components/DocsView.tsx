"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Rocket, Map, FlaskConical, Keyboard, Palette, ShieldCheck, Layers, PenLine, LifeBuoy, BookOpen, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { useApp } from "@/client/app-context";
import { DOCS, type DocPage } from "@/content/docs";
import { parseMarkdown, headings } from "@/core/markdown";
import { THEME_IDS } from "@/core/themes";
import type { MessageKey } from "@/core/i18n";
import { MarkdownBlocks } from "./Markdown";
import { ShortcutTable } from "./ShortcutHelp";
import { cx } from "./ui";
import { ThemeSwatch } from "./Shell";

const ICONS: Record<DocPage["icon"], LucideIcon> = { rocket: Rocket, map: Map, flask: FlaskConical, keyboard: Keyboard, palette: Palette, shield: ShieldCheck, layers: Layers, pen: PenLine, help: LifeBuoy };

export function DocsView({ slug }: { slug: string }) {
  const { t, lang, updateSettings, settings } = useApp();
  const i = Math.max(0, DOCS.findIndex((d) => d.slug === slug));
  const doc = DOCS[i];
  const blocks = useMemo(() => parseMarkdown(doc.body[lang]), [doc, lang]);
  const toc = useMemo(() => headings(blocks), [blocks]);
  const prev = DOCS[i - 1], next = DOCS[i + 1];

  return (
    <div className="backdrop-ambient min-h-dvh">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:py-14 xl:grid-cols-[230px_minmax(0,1fr)_200px]">
        <nav aria-label={t("docs.toc")} className="lg:sticky lg:top-10 lg:self-start">
          <div className="mb-4 flex items-center gap-2 text-[15px] font-semibold"><BookOpen className="h-[18px] w-[18px] text-accent-text" />{t("docs.title")}</div>
          <ul className="flex gap-1 overflow-x-auto pb-2 lg:block lg:space-y-0.5 lg:overflow-visible lg:pb-0">
            {DOCS.map((d) => {
              const Icon = ICONS[d.icon];
              const active = d.slug === doc.slug;
              return (
                <li key={d.slug} className="shrink-0">
                  <Link href={`/docs/${d.slug}`} aria-current={active ? "page" : undefined}
                    className={cx("ring-focus flex h-9 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-[13.5px] transition-colors", active ? "bg-surface font-medium text-fg shadow-card" : "text-muted hover:bg-surface2 hover:text-fg")}>
                    <Icon className={cx("h-4 w-4", active && "text-accent-text")} />{d.title[lang]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <article className="min-w-0 animate-fade-up rounded-3xl border border-line bg-surface px-6 py-8 shadow-card sm:px-10 sm:py-10">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent-text">{t("docs.title")}</div>
          <h1 className="mb-6 font-display text-[30px] font-semibold tracking-[-0.02em]">{doc.title[lang]}</h1>
          <MarkdownBlocks blocks={blocks} />
          {doc.widget === "shortcuts" && <div className="mt-6"><ShortcutTable columns={1} /></div>}
          {doc.widget === "themes" && (
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {THEME_IDS.map((id) => (
                <button key={id} onClick={() => updateSettings({ theme: id })} className={cx("ring-focus flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[13px] transition hover:bg-surface2", settings.theme === id ? "border-accent" : "border-line")}>
                  <ThemeSwatch id={id} />{t(`theme.${id}` as MessageKey)}
                </button>
              ))}
            </div>
          )}
          <div className="mt-10 grid grid-cols-2 gap-3 border-t border-line pt-6">
            {prev ? <Link href={`/docs/${prev.slug}`} className="group rounded-xl border border-line p-3.5 transition hover:bg-surface2"><div className="flex items-center gap-1 text-[11.5px] text-faint"><ChevronLeft className="h-3.5 w-3.5" />{t("lesson.prev")}</div><div className="mt-1 text-[14px] font-medium group-hover:text-accent-text">{prev.title[lang]}</div></Link> : <span />}
            {next ? <Link href={`/docs/${next.slug}`} className="group rounded-xl border border-line p-3.5 text-right transition hover:bg-surface2"><div className="flex items-center justify-end gap-1 text-[11.5px] text-faint">{t("lesson.next")}<ChevronRight className="h-3.5 w-3.5" /></div><div className="mt-1 text-[14px] font-medium group-hover:text-accent-text">{next.title[lang]}</div></Link> : <span />}
          </div>
        </article>
        <aside className="hidden xl:block xl:sticky xl:top-10 xl:self-start">
          {toc.length > 0 && (
            <>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{t("lesson.onThisPage")}</div>
              <ul className="space-y-1.5 border-l border-line">
                {toc.map((h) => <li key={h.id}><a href={`#${h.id}`} className={cx("-ml-px block border-l border-transparent text-[13px] text-muted transition hover:border-accent hover:text-fg", h.level === 3 ? "pl-6" : "pl-3")}>{h.text}</a></li>)}
              </ul>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

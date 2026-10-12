"use client";
import Link from "next/link";
import { CheckCircle2, Star, ArrowUpRight } from "lucide-react";
import { useApp } from "@/client/app-context";
import { examplePath, exampleId, type ExampleSummary } from "@/core/examples";
import type { MessageKey } from "@/core/i18n";
import { Chip, cx } from "./ui";
import { CATEGORY_ICON } from "./brand";

export function LessonCard({ e, index, showTrack }: { e: ExampleSummary; index?: number; showTrack?: boolean }) {
  const { t, lang, isDone, isFavorite } = useApp();
  const id = exampleId(e);
  const done = isDone(id), fav = isFavorite(id);
  const Icon = CATEGORY_ICON[e.category];
  return (
    <Link href={examplePath(e)}
      className="ring-focus group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card transition-all duration-base ease-out hover:-translate-y-1 hover:border-line-strong hover:shadow-lift">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-slow group-hover:opacity-100" style={{ background: "color-mix(in srgb, var(--glow) 28%, transparent)" }} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {index !== undefined ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface2 font-mono text-[12px] font-semibold text-muted group-hover:text-accent-text">{String(index).padStart(2, "0")}</span>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface2 text-accent-text"><Icon className="h-4 w-4" /></span>
          )}
          {showTrack && <span className="text-[12px] font-medium text-faint">{t(`cat.${e.category}.short` as MessageKey)}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {fav && <Star className="h-4 w-4 text-warning" fill="currentColor" />}
          {done ? <CheckCircle2 className="h-[18px] w-[18px] text-success" /> : <ArrowUpRight className="h-[18px] w-[18px] text-faint transition-all duration-base group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent-text" />}
        </div>
      </div>
      <h3 className="relative mt-4 text-[16px] font-semibold leading-snug tracking-[-0.01em]">{e.title[lang]}</h3>
      <p className="relative mt-1.5 line-clamp-2 flex-1 text-[13.5px] leading-relaxed text-muted">{e.summary[lang]}</p>
      <div className="relative mt-4 flex flex-wrap items-center gap-1.5">
        <Chip tone={e.difficulty === "advanced" ? "warning" : e.difficulty === "intermediate" ? "accent" : "success"}>{t(`diff.${e.difficulty}` as MessageKey)}</Chip>
        <Chip>{t(`req.${e.requires}` as MessageKey)}</Chip>
        {e.tags.slice(0, 2).map((tag) => <span key={tag} className={cx("text-[11.5px] text-faint")}>#{tag}</span>)}
      </div>
    </Link>
  );
}

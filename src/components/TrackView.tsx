"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Play } from "lucide-react";
import { useApp } from "@/client/app-context";
import { exampleId, examplePath, type Category } from "@/core/examples";
import { searchExamples } from "@/core/search";
import { trackProgress, resumeTarget } from "@/core/userdata";
import type { MessageKey } from "@/core/i18n";
import { PageHeader, Segmented, Progress, Empty, Button } from "./ui";
import { TrackGlyph } from "./brand";
import { LessonCard } from "./LessonCard";
import { useCatalog } from "./Providers";

type Diff = "all" | "beginner" | "intermediate" | "advanced";

export function TrackView({ category }: { category: Category }) {
  const { t, lang, progress } = useApp();
  const catalog = useCatalog();
  const items = useMemo(() => catalog.filter((e) => e.category === category), [catalog, category]);
  const [q, setQ] = useState("");
  const [diff, setDiff] = useState<Diff>("all");
  const shown = useMemo(() => searchExamples(items, q, lang).filter((e) => diff === "all" || e.difficulty === diff), [items, q, lang, diff]);
  const tp = trackProgress(progress, catalog).find((x) => x.category === category)!;
  const next = resumeTarget(progress.filter((p) => p.exampleId.startsWith(category + "/")), items);

  return (
    <div className="backdrop-ambient min-h-dvh">
      <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8 lg:py-14">
        <PageHeader icon={<TrackGlyph category={category} size={48} />} eyebrow={t("track.lessonsCount", { count: items.length })}
          title={t(`cat.${category}.title` as MessageKey)} subtitle={t(`cat.${category}.desc` as MessageKey)}
          actions={next && <Link href={examplePath(next)}><Button variant="primary" icon={<Play className="h-4 w-4" fill="currentColor" />}>{tp.done ? t("home.resume", { title: items.find((e) => exampleId(e) === exampleId(next))?.title[lang] ?? "" }) : t("home.start")}</Button></Link>} />
        <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card md:flex-row md:items-center">
          <div className="flex min-w-[220px] flex-1 items-center gap-3">
            <div className="flex-1">
              <div className="mb-1.5 flex justify-between text-[12.5px] text-muted"><span>{t("home.progress", { done: tp.done, total: tp.total })}</span><span className="tabular-nums">{tp.pct}%</span></div>
              <Progress value={tp.pct} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-9 items-center gap-2 rounded-xl border border-line bg-surface2 px-3 focus-within:border-accent">
              <Search className="h-4 w-4 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("palette.placeholder")} aria-label={t("track.filter")} className="w-44 bg-transparent text-[13px] outline-none placeholder:text-faint" />
            </label>
            <Segmented size="sm" value={diff} onChange={setDiff} options={[
              { value: "all", label: t("track.all") }, { value: "beginner", label: t("diff.beginner") }, { value: "intermediate", label: t("diff.intermediate") }, { value: "advanced", label: t("diff.advanced") },
            ]} />
          </div>
        </div>
        {shown.length === 0 ? <Empty icon={<Search className="h-5 w-5" />}>{t("track.empty")}</Empty> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
            {shown.map((e, i) => (
              <div key={e.slug} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                <LessonCard e={e} index={e.order} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

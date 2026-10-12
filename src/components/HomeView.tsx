"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Play, FlaskConical, Zap, Languages, ShieldCheck, Keyboard } from "lucide-react";
import { useApp } from "@/client/app-context";
import { CATEGORIES, examplePath, type Category } from "@/core/examples";
import { trackProgress, resumeTarget } from "@/core/userdata";
import { SHORTCUTS, formatBinding, resolveBindings } from "@/core/shortcuts";
import { THEME_IDS } from "@/core/themes";
import type { MessageKey } from "@/core/i18n";
import { Button, Progress, Kbd } from "./ui";
import { TrackGlyph } from "./brand";
import { LessonCard } from "./LessonCard";
import { HeroCanvas } from "./HeroCanvas";
import { useCatalog } from "./Providers";

const FEATURED = ["three/pbr-environment", "webgl/raymarching-sdf", "gpu/compute-particles", "three/postprocessing", "webgl/noise-fbm", "gpu/game-of-life"];

export function HomeView() {
  const { t, lang, progress, settings, mac } = useApp();
  const catalog = useCatalog();
  const tracks = useMemo(() => trackProgress(progress, catalog), [progress, catalog]);
  const resume = progress.length ? resumeTarget(progress, catalog) : null;
  const resumeItem = resume ? catalog.find((e) => e.category === resume.category && e.slug === resume.slug) : null;
  const first = catalog[0];
  const featured = FEATURED.map((id) => catalog.find((e) => `${e.category}/${e.slug}` === id)).filter(Boolean).slice(0, 6) as typeof catalog;
  const runKeys = formatBinding(resolveBindings(settings.shortcuts).find((d) => d.id === "run")!.keys, mac);
  const paletteKeys = formatBinding(resolveBindings(settings.shortcuts).find((d) => d.id === "palette")!.keys, mac);

  return (
    <div className="backdrop-ambient min-h-dvh">
      {/* hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="grid-lines pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative mx-auto grid max-w-[1400px] items-center gap-6 px-5 pb-14 pt-12 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-20 lg:pt-20">
          <div className="animate-fade-up">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-[12px] font-medium text-muted shadow-card backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--glow)]" />{t("home.eyebrow")}
            </div>
            <h1 className="font-display text-[38px] font-semibold leading-[1.08] tracking-[-0.03em] [text-wrap:balance] sm:text-[50px] xl:text-[58px]">
              <span className="text-gradient">{t("home.title")}</span>
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted sm:text-[17px]">{t("home.subtitle", { count: catalog.length })}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {resumeItem ? (
                <Link href={examplePath(resumeItem)}><Button variant="primary" size="lg" icon={<Play className="h-4 w-4" fill="currentColor" />}>{t("home.resume", { title: resumeItem.title[lang] })}</Button></Link>
              ) : first && (
                <Link href={examplePath(first)}><Button variant="primary" size="lg" icon={<Play className="h-4 w-4" fill="currentColor" />}>{t("home.start")}</Button></Link>
              )}
              <Link href="/playground"><Button size="lg" icon={<FlaskConical className="h-4 w-4" />}>{t("home.openPlayground")}</Button></Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-faint">
              <span className="flex items-center gap-2"><Kbd keys={paletteKeys} /> {t("sc.palette")}</span>
              <span className="flex items-center gap-2"><Kbd keys={runKeys} /> {t("sc.run")}</span>
            </div>
          </div>
          <div className="relative aspect-square w-full max-w-[560px] justify-self-center lg:justify-self-end">
            <div className="absolute inset-[6%] rounded-[36px] border border-line bg-surface shadow-lift" />
            <HeroCanvas className="absolute inset-[6%] h-[88%] w-[88%] rounded-[36px]" />
            <div className="absolute inset-[6%] rounded-[36px] ring-1 ring-inset ring-white/5" />
            <div className="glass absolute bottom-[2%] left-0 flex items-center gap-3 rounded-2xl border border-line px-4 py-3 shadow-pop animate-float">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent-text"><Zap className="h-4 w-4" /></span>
              <div className="font-mono text-[11.5px] leading-tight text-muted"><div className="text-fg">fragment.glsl</div>raymarch · 90 steps</div>
            </div>
          </div>
        </div>
        {/* stats strip */}
        <div className="relative mx-auto grid max-w-[1400px] grid-cols-2 gap-px overflow-hidden border-t border-line bg-line sm:grid-cols-4">
          {[
            [catalog.length, t("home.stats.lessons")], [CATEGORIES.length, t("home.stats.tracks")], [SHORTCUTS.length, t("home.stats.shortcuts")], [THEME_IDS.length, t("home.stats.themes")],
          ].map(([n, label]) => (
            <div key={String(label)} className="bg-bg2/90 px-6 py-5 backdrop-blur">
              <div className="font-display text-[26px] font-semibold tabular-nums tracking-tight">{n}</div>
              <div className="text-[12.5px] text-muted">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8">
        {/* tracks */}
        <h2 className="mb-6 font-display text-[22px] font-semibold tracking-tight">{t("home.tracks")}</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {CATEGORIES.map((c, i) => <TrackCard key={c} category={c} tp={tracks.find((x) => x.category === c)!} delay={i * 60} />)}
        </div>

        {/* featured */}
        {featured.length > 0 && (
          <>
            <h2 className="mb-6 mt-16 font-display text-[22px] font-semibold tracking-tight">{t("home.featured")}</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {featured.map((e) => <LessonCard key={`${e.category}/${e.slug}`} e={e} showTrack />)}
            </div>
          </>
        )}

        {/* why */}
        <h2 className="mb-6 mt-16 font-display text-[22px] font-semibold tracking-tight">{t("home.why")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {([[Zap, "home.why1"], [Languages, "home.why2"], [ShieldCheck, "home.why3"]] as const).map(([Icon, k]) => (
            <div key={k} className="rounded-2xl border border-line bg-surface p-6 shadow-card">
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-text"><Icon className="h-5 w-5" /></span>
              <h3 className="text-[15px] font-semibold">{t(`${k}.title` as MessageKey)}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{t(`${k}.body` as MessageKey)}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex items-center justify-center gap-2 text-[12.5px] text-faint"><Keyboard className="h-4 w-4" /><Kbd keys={formatBinding("shift+?", mac)} />{t("sc.help")}</div>
      </div>
    </div>
  );
}

function TrackCard({ category, tp, delay }: { category: Category; tp: { done: number; total: number; pct: number }; delay: number }) {
  const { t } = useApp();
  return (
    <Link href={`/learn/${category}`} style={{ animationDelay: `${delay}ms` }}
      className="ring-focus group relative flex animate-fade-up flex-col overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-card transition-all duration-base ease-out hover:-translate-y-1 hover:shadow-lift">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl transition-opacity duration-slow group-hover:opacity-80" style={{ background: "color-mix(in srgb, var(--glow) 35%, transparent)" }} />
      <div className="relative flex items-center justify-between">
        <TrackGlyph category={category} size={48} />
        <span className="text-[12.5px] font-medium text-faint">{t("home.lessons", { count: tp.total })}</span>
      </div>
      <h3 className="relative mt-5 font-display text-[19px] font-semibold tracking-tight">{t(`cat.${category}.title` as MessageKey)}</h3>
      <p className="relative mt-2 flex-1 text-[13.5px] leading-relaxed text-muted">{t(`cat.${category}.desc` as MessageKey)}</p>
      <div className="relative mt-6">
        <div className="mb-2 flex items-center justify-between text-[12px] text-muted">
          <span>{t("home.progress", { done: tp.done, total: tp.total })}</span>
          <ArrowRight className="h-4 w-4 text-faint transition-transform duration-base group-hover:translate-x-1 group-hover:text-accent-text" />
        </div>
        <Progress value={tp.pct} />
      </div>
    </Link>
  );
}

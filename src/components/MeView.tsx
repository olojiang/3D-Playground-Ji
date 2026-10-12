"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Star, FileCode2, Pencil, Trash2, ExternalLink, Info } from "lucide-react";
import { useApp } from "@/client/app-context";
import { CATEGORIES } from "@/core/examples";
import { trackProgress, type SnippetMeta } from "@/core/userdata";
import { timeAgo, type MessageKey } from "@/core/i18n";
import { PageHeader, Card, Progress, Empty, IconButton, Chip } from "./ui";
import { TrackGlyph } from "./brand";
import { LessonCard } from "./LessonCard";
import { useCatalog } from "./Providers";

export function MeView() {
  const { t, lang, user, ready, progress, favorites, source, toast } = useApp();
  const catalog = useCatalog();
  const [snips, setSnips] = useState<SnippetMeta[] | null>(null);
  const tracks = useMemo(() => trackProgress(progress, catalog), [progress, catalog]);
  const favItems = favorites.map((id) => catalog.find((e) => `${e.category}/${e.slug}` === id)).filter(Boolean) as typeof catalog;
  const total = tracks.reduce((a, x) => a + x.done, 0);

  useEffect(() => { if (ready) source.listSnippets().then(setSnips).catch(() => setSnips([])); }, [ready, source]);

  const rename = async (s: SnippetMeta) => {
    const title = window.prompt(t("me.rename"), s.title)?.trim();
    if (!title || title === s.title) return;
    const full = await source.getSnippet(s.id);
    if (!full) return;
    await source.updateSnippet(s.id, { title, exampleId: full.exampleId, code: full.code });
    setSnips(await source.listSnippets());
  };
  const remove = async (s: SnippetMeta) => {
    if (!window.confirm(t("me.deleteConfirm", { title: s.title }))) return;
    await source.deleteSnippet(s.id).catch(() => toast(t("common.error"), "error"));
    setSnips((l) => (l ?? []).filter((x) => x.id !== s.id));
  };

  return (
    <div className="backdrop-ambient min-h-dvh">
      <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8 lg:py-14">
        <PageHeader icon={<LayoutDashboard className="h-6 w-6" />} title={t("me.title")} subtitle={user ? t("auth.signedInAs", { email: user.email }) : t("me.subtitle")} />
        {!user && ready && (
          <div className="mb-8 flex items-center gap-3 rounded-2xl border border-line bg-accent-soft/60 px-4 py-3 text-[13.5px]">
            <Info className="h-4 w-4 shrink-0 text-accent-text" /><span className="flex-1">{t("me.guestNote")}</span>
            <Link href="/register" className="font-medium text-accent-text hover:underline">{t("auth.register")}</Link>
          </div>
        )}

        <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-faint">{t("me.progress")}</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="flex flex-col justify-between p-5">
            <div className="text-[13px] text-muted">{t("home.stats.lessons")}</div>
            <div className="mt-3 font-display text-[40px] font-semibold leading-none tabular-nums tracking-tight">{total}<span className="text-[18px] text-faint">/{catalog.length}</span></div>
          </Card>
          {CATEGORIES.map((c) => {
            const tp = tracks.find((x) => x.category === c)!;
            return (
              <Link key={c} href={`/learn/${c}`}>
                <Card interactive className="h-full p-5">
                  <div className="flex items-center gap-3"><TrackGlyph category={c} size={36} /><span className="font-medium">{t(`cat.${c}.short` as MessageKey)}</span><span className="ml-auto text-[12px] tabular-nums text-faint">{tp.pct}%</span></div>
                  <Progress value={tp.pct} className="mt-5" />
                  <div className="mt-2 text-[12px] text-muted">{t("home.progress", { done: tp.done, total: tp.total })}</div>
                </Card>
              </Link>
            );
          })}
        </div>

        <h2 className="mb-4 mt-12 text-[13px] font-semibold uppercase tracking-[0.12em] text-faint">{t("me.snippets")}</h2>
        {snips === null ? <div className="h-24 animate-pulse rounded-2xl bg-surface2" /> : snips.length === 0 ? <Empty icon={<FileCode2 className="h-5 w-5" />}>{t("me.noSnippets")}</Empty> : (
          <Card className="divide-y divide-line overflow-hidden">
            {snips.map((s) => {
              const ex = s.exampleId ? catalog.find((e) => `${e.category}/${e.slug}` === s.exampleId) : null;
              return (
                <div key={s.id} className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface2/60">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface2 text-accent-text"><FileCode2 className="h-4 w-4" /></span>
                  <Link href={`/playground?snippet=${s.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium group-hover:text-accent-text">{s.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-faint">
                      <span>{t("me.updated", { when: timeAgo(lang, s.updatedAt) })}</span>
                      <span>·</span><span className="tabular-nums">{(s.size / 1024).toFixed(1)} KB</span>
                      {ex && <Chip>{t("me.based", { title: ex.title[lang] })}</Chip>}
                    </div>
                  </Link>
                  <div className="flex items-center gap-0.5 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                    <Link href={`/playground?snippet=${s.id}`}><IconButton label={t("me.open")} size="sm"><ExternalLink className="h-4 w-4" /></IconButton></Link>
                    <IconButton label={t("me.rename")} size="sm" onClick={() => rename(s)}><Pencil className="h-4 w-4" /></IconButton>
                    <IconButton label={t("me.delete")} size="sm" onClick={() => remove(s)} className="hover:!text-danger"><Trash2 className="h-4 w-4" /></IconButton>
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        <h2 className="mb-4 mt-12 text-[13px] font-semibold uppercase tracking-[0.12em] text-faint">{t("me.favorites")}</h2>
        {favItems.length === 0 ? <Empty icon={<Star className="h-5 w-5" />}>{t("me.noFavorites")}</Empty> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{favItems.map((e) => <LessonCard key={`${e.category}/${e.slug}`} e={e} showTrack />)}</div>
        )}
      </div>
    </div>
  );
}

"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, Home, FlaskConical, LayoutDashboard, BookOpen, Settings, Palette, Languages, Keyboard, Plus, CheckCircle2, type LucideIcon } from "lucide-react";
import { useApp } from "@/client/app-context";
import { searchExamples, fuzzyScore } from "@/core/search";
import { examplePath, exampleId, CATEGORIES } from "@/core/examples";
import { THEME_IDS } from "@/core/themes";
import type { MessageKey } from "@/core/i18n";
import { Modal, cx, Chip } from "./ui";
import { CATEGORY_ICON } from "./brand";
import { useCatalog } from "./Providers";

interface Item { id: string; group: "lessons" | "pages" | "commands"; label: string; hint?: string; icon: LucideIcon; run: () => void; done?: boolean }

export function CommandPalette() {
  const { t, lang, paletteOpen, setPaletteOpen, updateSettings, setHelpOpen, isDone } = useApp();
  const catalog = useCatalog();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => setPaletteOpen(false);
  useEffect(() => { if (paletteOpen) { setQ(""); setSel(0); } }, [paletteOpen]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => { router.push(href); close(); };
    const lessons: Item[] = searchExamples(catalog, q, lang).slice(0, q ? 12 : 8).map((e) => ({
      id: `l:${exampleId(e)}`, group: "lessons", label: e.title[lang], hint: t(`cat.${e.category}.short` as MessageKey), icon: CATEGORY_ICON[e.category], run: go(examplePath(e)), done: isDone(exampleId(e)),
    }));
    const pages: Item[] = [
      { id: "p:home", label: t("nav.home"), icon: Home, href: "/" },
      ...CATEGORIES.map((c) => ({ id: `p:${c}`, label: t(`cat.${c}.title` as MessageKey), icon: CATEGORY_ICON[c], href: `/learn/${c}` })),
      { id: "p:pg", label: t("nav.playground"), icon: FlaskConical, href: "/playground" },
      { id: "p:me", label: t("nav.me"), icon: LayoutDashboard, href: "/me" },
      { id: "p:docs", label: t("nav.docs"), icon: BookOpen, href: "/docs" },
      { id: "p:settings", label: t("nav.settings"), icon: Settings, href: "/settings" },
    ].map((p) => ({ id: p.id, group: "pages" as const, label: p.label, icon: p.icon, run: go(p.href) }));
    const commands: Item[] = [
      { id: "c:new", group: "commands", label: t("cmd.newPlayground"), icon: Plus, run: go("/playground?new=1") },
      { id: "c:lang", group: "commands", label: t("cmd.lang"), icon: Languages, run: () => { updateSettings({ lang: lang === "zh" ? "en" : "zh" }); close(); } },
      { id: "c:keys", group: "commands", label: t("cmd.shortcuts"), icon: Keyboard, run: () => { close(); setHelpOpen(true); } },
      ...THEME_IDS.map((id) => ({ id: `c:theme:${id}`, group: "commands" as const, label: t("cmd.theme", { name: t(`theme.${id}` as MessageKey) }), icon: Palette, run: () => { updateSettings({ theme: id }); } })),
    ];
    const filt = (l: Item[]) => (q ? l.map((i) => ({ i, s: fuzzyScore(i.label, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.i) : l);
    return [...lessons, ...filt(pages), ...filt(commands).slice(0, q ? 8 : 3)];
  }, [q, catalog, lang, t, isDone]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[sel]?.run(); }
  };

  let idx = -1;
  const groups: Item["group"][] = ["lessons", "pages", "commands"];
  return (
    <Modal open={paletteOpen} onClose={close} label={t("palette.placeholder")} className="max-w-[620px]" top>
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="h-[18px] w-[18px] text-faint" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={t("palette.placeholder")} aria-label={t("palette.placeholder")}
          className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-faint" />
        <kbd className="kbd">Esc</kbd>
      </div>
      <div ref={listRef} className="scroll-thin max-h-[56vh] overflow-y-auto p-2" role="listbox">
        {items.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted">{t("palette.empty")}</div>}
        {groups.map((g) => {
          const list = items.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="mb-1">
              <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{t(`palette.${g}` as MessageKey)}</div>
              {list.map((it) => {
                idx++;
                const i = idx;
                const Icon = it.icon;
                return (
                  <button key={it.id} data-idx={i} role="option" aria-selected={sel === i} onMouseMove={() => setSel(i)} onClick={it.run}
                    className={cx("flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] transition-colors", sel === i ? "bg-accent-soft text-fg" : "text-muted")}>
                    <Icon className={cx("h-[18px] w-[18px] shrink-0", sel === i && "text-accent-text")} strokeWidth={1.8} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.done && <CheckCircle2 className="h-4 w-4 text-success" />}
                    {it.hint && <Chip>{it.hint}</Chip>}
                    {sel === i && <CornerDownLeft className="h-4 w-4 text-faint" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="border-t border-line px-4 py-2.5 text-[11.5px] text-faint">{t("palette.hint")}</div>
    </Modal>
  );
}

"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Home, FlaskConical, BookOpen, Settings as SettingsIcon, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Menu, X, Search, Command, Languages, LogIn, LogOut, UserRound, Palette, Check } from "lucide-react";
import { useApp } from "@/client/app-context";
import { activeScopes, isTypingTarget, pageHandler } from "@/client/shortcuts";
import { createMatcher, resolveBindings, formatBinding } from "@/core/shortcuts";
import { CATEGORIES } from "@/core/examples";
import { THEME_IDS, THEMES, nextTheme, resolveTheme, type ThemePref } from "@/core/themes";
import { trackProgress, LANG_NAME } from "@/core/userdata";
import { SPRING } from "@/core/motion";
import { Logo, CATEGORY_ICON } from "./brand";
import { cx, IconButton, Kbd } from "./ui";
import { useCatalog } from "./Providers";
import { CommandPalette } from "./CommandPalette";
import { ShortcutHelp } from "./ShortcutHelp";
import { Toasts } from "./Toasts";
import type { MessageKey } from "@/core/i18n";

const ROUTES: Record<string, string> = {
  "go.home": "/", "go.three": "/learn/three", "go.webgl": "/learn/webgl", "go.gpu": "/learn/gpu", "go.playground": "/playground", "go.me": "/me", "go.docs": "/docs", "go.settings": "/settings",
};

export function Shell({ children }: { children: ReactNode }) {
  const app = useApp();
  const { t, settings, updateSettings, sidebarCollapsed, setSidebarCollapsed, setPaletteOpen, setHelpOpen, paletteOpen, helpOpen, mac } = app;
  const router = useRouter();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const bindings = useMemo(() => resolveBindings(settings.shortcuts), [settings.shortcuts]);
  const matcher = useMemo(() => createMatcher(bindings, { mac }), [bindings, mac]);
  const state = useRef({ paletteOpen, helpOpen });
  state.current = { paletteOpen, helpOpen };

  useEffect(() => setDrawer(false), [pathname]);

  // The one global keyboard listener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (state.current.paletteOpen || state.current.helpOpen) return; // dialogs handle their own keys
      if (document.body.dataset.recordingShortcut === "1") return;
      const id = matcher(e, { scopes: activeScopes(), typing: isTypingTarget(e.target) });
      if (!id || id === "pending") return;
      const page = pageHandler(id);
      const run = (): boolean => {
        if (page) { page(); return true; }
        if (ROUTES[id]) { router.push(ROUTES[id]); return true; }
        switch (id) {
          case "palette": setPaletteOpen(true); return true;
          case "search": setPaletteOpen(true); return true;
          case "help": setHelpOpen(true); return true;
          case "theme.next": {
            const cur = resolveTheme(settings.theme, matchMedia("(prefers-color-scheme: dark)").matches);
            const n = nextTheme(cur);
            updateSettings({ theme: n });
            app.toast(t(`theme.${n}` as MessageKey));
            return true;
          }
          case "lang.toggle": updateSettings({ lang: settings.lang === "zh" ? "en" : "zh" }); return true;
          case "sidebar.toggle": setSidebarCollapsed(!sidebarCollapsed); return true;
          case "escape": if (drawer) { setDrawer(false); return true; } return false;
        }
        return false;
      };
      if (run()) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [matcher, router, settings.theme, settings.lang, sidebarCollapsed, drawer]);

  const collapsed = sidebarCollapsed;
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">{t("common.skip")}</a>
      {/* desktop sidebar */}
      <aside className={cx("fixed inset-y-0 left-0 z-40 hidden border-r border-line bg-bg2/80 backdrop-blur-xl transition-[width] duration-slow ease-out lg:flex", collapsed ? "w-[72px]" : "w-[var(--sidebar-w)]")}>
        <Sidebar collapsed={collapsed} />
      </aside>
      {/* mobile top bar */}
      <header className="glass sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line px-3 lg:hidden">
        <IconButton label={t("nav.menu")} onClick={() => setDrawer(true)}><Menu className="h-5 w-5" /></IconButton>
        <Link href="/" className="flex items-center gap-2 font-semibold"><Logo size={24} />{t("app.name")}</Link>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label={t("palette.placeholder")} onClick={() => setPaletteOpen(true)}><Search className="h-[18px] w-[18px]" /></IconButton>
        </div>
      </header>
      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
            <motion.aside initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={SPRING.sheet} className="absolute inset-y-0 left-0 flex w-[290px] border-r border-line bg-bg2 shadow-pop">
              <Sidebar collapsed={false} onClose={() => setDrawer(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
      <main id="main" className={cx("min-h-dvh transition-[padding] duration-slow ease-out", collapsed ? "lg:pl-[72px]" : "lg:pl-[var(--sidebar-w)]")}>
        {children}
      </main>
      <CommandPalette />
      <ShortcutHelp />
      <Toasts />
    </div>
  );
}

function Sidebar({ collapsed, onClose }: { collapsed: boolean; onClose?: () => void }) {
  const { t, user, settings, updateSettings, setSidebarCollapsed, setPaletteOpen, setHelpOpen, progress, logout, mac } = useApp();
  const catalog = useCatalog();
  const pathname = usePathname();
  const tracks = useMemo(() => trackProgress(progress, catalog), [progress, catalog]);
  const paletteKeys = formatBinding(resolveBindings(settings.shortcuts).find((d) => d.id === "palette")!.keys, mac);

  const item = (href: string, label: string, Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>, extra?: ReactNode) => {
    const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
    return (
      <Link key={href} href={href} title={collapsed ? label : undefined} aria-current={active ? "page" : undefined}
        className={cx("ring-focus group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors duration-fast",
          active ? "text-fg" : "text-muted hover:bg-surface2 hover:text-fg", collapsed && "justify-center px-0")}>
        {active && <motion.span layoutId={onClose ? "nav-active-m" : "nav-active"} transition={SPRING.snappy} className="absolute inset-0 rounded-xl border border-line bg-surface shadow-card" />}
        <Icon className={cx("relative h-[18px] w-[18px] shrink-0 transition-colors", active ? "text-accent-text" : "")} strokeWidth={1.8} />
        {!collapsed && <span className="relative flex-1 truncate">{label}</span>}
        {!collapsed && extra}
      </Link>
    );
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className={cx("flex h-16 items-center gap-2.5 px-4", collapsed && "justify-center px-0")}>
        <Link href="/" className="ring-focus flex items-center gap-2.5 rounded-lg">
          <Logo size={30} />
          {!collapsed && <span className="text-[15px] font-semibold tracking-tight">{t("app.name")}</span>}
        </Link>
        {onClose && <IconButton label={t("common.close")} className="ml-auto" onClick={onClose}><X className="h-5 w-5" /></IconButton>}
      </div>
      <div className={cx("px-3", collapsed && "px-2")}>
        <button onClick={() => setPaletteOpen(true)} title={t("palette.placeholder")}
          className={cx("ring-focus flex h-10 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-[13px] text-faint shadow-card transition-colors hover:border-line-strong hover:text-muted", collapsed && "justify-center px-0")}>
          <Search className="h-4 w-4 shrink-0" />
          {!collapsed && <><span className="flex-1 truncate text-left">{t("palette.placeholder")}</span><Kbd keys={paletteKeys} /></>}
        </button>
      </div>
      <nav className="scroll-thin mt-4 flex-1 space-y-6 overflow-y-auto px-3 pb-4" aria-label={t("nav.menu")}>
        <div className="space-y-0.5">{item("/", t("nav.home"), Home)}</div>
        <div className="space-y-0.5">
          {!collapsed && <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{t("nav.learn")}</div>}
          {CATEGORIES.map((c) => {
            const tp = tracks.find((x) => x.category === c)!;
            return item(`/learn/${c}`, t(`nav.${c}` as MessageKey), CATEGORY_ICON[c],
              <span className="relative text-[11px] tabular-nums text-faint">{tp.done}/{tp.total}</span>);
          })}
        </div>
        <div className="space-y-0.5">
          {!collapsed && <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{t("nav.workspace")}</div>}
          {item("/playground", t("nav.playground"), FlaskConical)}
          {item("/me", t("nav.me"), LayoutDashboard)}
          {item("/docs", t("nav.docs"), BookOpen)}
          {item("/settings", t("nav.settings"), SettingsIcon)}
        </div>
      </nav>
      <div className={cx("space-y-2 border-t border-line p-3", collapsed && "px-2")}>
        <div className={cx("flex items-center gap-1", collapsed && "flex-col")}>
          <ThemeMenu collapsed={collapsed} />
          <IconButton label={t("sc.lang.toggle")} onClick={() => updateSettings({ lang: settings.lang === "zh" ? "en" : "zh" })}>
            <span className="relative"><Languages className="h-[18px] w-[18px]" /></span>
          </IconButton>
          {!collapsed && <span className="text-xs font-medium text-faint">{LANG_NAME[settings.lang].short}</span>}
          <IconButton label={t("sc.help")} onClick={() => setHelpOpen(true)} className={collapsed ? "" : "ml-auto"}><Command className="h-[18px] w-[18px]" /></IconButton>
          <IconButton label={collapsed ? t("nav.expand") : t("nav.collapse")} onClick={() => setSidebarCollapsed(!collapsed)} className="hidden lg:inline-flex">
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </IconButton>
        </div>
        {user ? (
          <div className={cx("flex items-center gap-2.5 rounded-xl border border-line bg-surface p-2 shadow-card", collapsed && "justify-center border-0 bg-transparent p-0 shadow-none")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-[13px] font-semibold text-accent-fg" title={user.email}>
              {(user.name || user.email).slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{user.name || user.email.split("@")[0]}</div>
                  <div className="truncate text-[11.5px] text-faint">{user.email}</div>
                </div>
                <IconButton label={t("auth.logout")} size="sm" onClick={logout}><LogOut className="h-4 w-4" /></IconButton>
              </>
            )}
          </div>
        ) : (
          <Link href="/login" title={t("auth.login")} className={cx("ring-focus flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-[13.5px] font-medium text-accent-fg shadow-glow transition hover:brightness-110", collapsed && "w-10")}>
            {collapsed ? <LogIn className="h-4 w-4" /> : <><UserRound className="h-4 w-4" />{t("auth.login")}</>}
          </Link>
        )}
      </div>
    </div>
  );
}

export function ThemeSwatch({ id, size = 28 }: { id: string; size?: number }) {
  const th = THEMES.find((x) => x.id === id) ?? THEMES[0];
  return (
    <span className="relative inline-block shrink-0 overflow-hidden rounded-lg border border-line" style={{ width: size, height: size, background: th.vars["--bg"] }}>
      <span className="absolute inset-x-1 bottom-1 top-[45%] rounded-[4px]" style={{ background: th.vars["--surface"], boxShadow: `0 0 0 1px ${th.vars["--border"]}` }} />
      <span className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: th.vars["--accent"], boxShadow: `0 0 8px ${th.vars["--glow"]}` }} />
    </span>
  );
}

function ThemeMenu({ collapsed }: { collapsed: boolean }) {
  const { t, settings, updateSettings } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [open]);
  const pick = (p: ThemePref) => { updateSettings({ theme: p }); };
  return (
    <div className="relative" ref={ref}>
      <IconButton label={t("settings.theme")} active={open} onClick={() => setOpen(!open)}><Palette className="h-[18px] w-[18px]" /></IconButton>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.98 }} transition={SPRING.snappy}
            className={cx("absolute bottom-11 z-50 w-64 rounded-2xl border border-line bg-surface p-2 shadow-pop", collapsed ? "left-0" : "left-0")} role="menu">
            <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{t("settings.theme")}</div>
            <button role="menuitemradio" aria-checked={settings.theme === "system"} onClick={() => pick("system")} className="ring-focus flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface2">
              <span className="relative inline-flex h-7 w-7 overflow-hidden rounded-lg border border-line"><span className="w-1/2" style={{ background: "#f6f6f8" }} /><span className="w-1/2" style={{ background: "#08080b" }} /></span>
              <span className="flex-1 text-left">{t("settings.theme.system")}</span>
              {settings.theme === "system" && <Check className="h-4 w-4 text-accent-text" />}
            </button>
            <div className="mt-1 grid grid-cols-1 gap-0.5">
              {THEME_IDS.map((id) => (
                <button key={id} role="menuitemradio" aria-checked={settings.theme === id} onClick={() => pick(id)} className="ring-focus flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface2">
                  <ThemeSwatch id={id} />
                  <span className="flex-1 text-left">{t(`theme.${id}` as MessageKey)}</span>
                  {settings.theme === id && <Check className="h-4 w-4 text-accent-text" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

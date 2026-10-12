"use client";
/**
 * App-wide state: who is signed in, their settings (theme, language…), progress, favorites,
 * the active data source (guest localStorage vs. account API), toasts and overlays.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { translate, type MessageKey } from "@/core/i18n";
import { resolveTheme, themeById } from "@/core/themes";
import { DEFAULT_SETTINGS, sanitizeSettings, type Lang, type Settings, type ProgressEntry } from "@/core/userdata";
import { LocalSource, RemoteSource, api, ApiError, type DataSource } from "./source";

export interface User { id: number; email: string; name: string }
export interface Toast { id: number; text: string; tone: "info" | "success" | "error" }

interface Ctx {
  ready: boolean;
  user: User | null;
  source: DataSource;
  settings: Settings;
  lang: Lang;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  updateSettings: (patch: Partial<Settings>) => void;
  progress: ProgressEntry[];
  favorites: string[];
  isFavorite: (id: string) => boolean;
  isDone: (id: string) => boolean;
  toggleFavorite: (id: string) => Promise<void>;
  setDone: (id: string, done: boolean) => Promise<void>;
  visit: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User | null) => void;
  toasts: Toast[];
  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  mac: boolean;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
};

const storage = () => (typeof window !== "undefined" ? window.localStorage : { getItem: () => null, setItem() {}, removeItem() {} });

function applyTheme(s: Settings) {
  const root = document.documentElement;
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const id = resolveTheme(s.theme, prefersDark);
  if (root.dataset.theme !== id) {
    root.classList.add("theme-switching");
    root.dataset.theme = id;
    window.setTimeout(() => root.classList.remove("theme-switching"), 450);
  }
  root.dataset.serif = themeById(id).serif ? "1" : "0";
  root.dataset.motion = s.motion;
  root.lang = s.lang === "zh" ? "zh-CN" : "en";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeById(id).vars["--bg"]);
}

export function AppProvider({ children, initialLang }: { children: ReactNode; initialLang: Lang }) {
  const local = useMemo(() => new LocalSource(storage()), []);
  const remote = useMemo(() => new RemoteSource(), []);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, lang: initialLang });
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [mac, setMac] = useState(true);
  const source: DataSource = user ? remote : local;
  const saveTimer = useRef<number | undefined>(undefined);
  const toastSeq = useRef(0);

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = ++toastSeq.current;
    setToasts((l) => [...l.slice(-3), { id, text, tone }]);
    window.setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 3600);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((l) => l.filter((x) => x.id !== id)), []);

  const loadFor = useCallback(async (src: DataSource) => {
    const [s, p, f] = await Promise.all([src.getSettings(), src.listProgress(), src.listFavorites()]);
    // Theme/language chosen on this device before sign-in should not flip on first load of a fresh account.
    setSettings(s);
    setProgress(p);
    setFavorites(f);
    return s;
  }, []);

  // boot
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    setSidebarCollapsedState(storage().getItem("tp-sidebar") === "1");
    (async () => {
      let u: User | null = null;
      try { u = (await api<{ user: User | null }>("/api/auth/me")).user; } catch { /* offline: guest */ }
      setUser(u);
      try { await loadFor(u ? remote : local); } catch { await loadFor(local); }
      setReady(true);
    })();
  }, []);

  // apply theme / language / motion whenever settings change; follow the OS in "system" mode
  useEffect(() => {
    applyTheme(settings);
    const ls = storage();
    ls.setItem("tp-theme", settings.theme);
    ls.setItem("tp-lang", settings.lang);
    document.cookie = `tp-lang=${settings.lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
    if (settings.theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme(settings);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = sanitizeSettings(patch, prev);
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => { source.saveSettings(patch).catch(() => toast(translate(next.lang, "common.error"), "error")); }, 300);
      return next;
    });
  }, [source, toast]);

  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(settings.lang, key, vars), [settings.lang]);

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);
  const isDone = useCallback((id: string) => !!progress.find((p) => p.exampleId === id)?.completedAt, [progress]);
  const mergeEntry = (e: ProgressEntry) => setProgress((l) => [e, ...l.filter((p) => p.exampleId !== e.exampleId)]);

  const toggleFavorite = useCallback(async (id: string) => {
    const on = !favorites.includes(id);
    setFavorites((f) => (on ? [id, ...f] : f.filter((x) => x !== id)));
    try { setFavorites(await source.setFavorite(id, on)); } catch { toast(t("common.error"), "error"); }
  }, [favorites, source, t, toast]);

  const setDone = useCallback(async (id: string, done: boolean) => {
    const now = Date.now();
    mergeEntry({ exampleId: id, visitedAt: now, completedAt: done ? now : null });
    try { mergeEntry(await source.touch(id, done)); } catch { toast(t("common.error"), "error"); }
  }, [source, t, toast]);

  const visit = useCallback((id: string) => { source.touch(id).then(mergeEntry).catch(() => {}); }, [source]);

  const afterSignIn = useCallback(async (u: User) => {
    setUser(u);
    if (local.hasData()) {
      try {
        await api("/api/import", { method: "POST", body: JSON.stringify({ ...(await local.exportBackup()), settings: undefined }) });
        local.clearUserData();
        toast(translate(settings.lang, "auth.merged"), "success");
      } catch { /* keep local data; nothing lost */ }
    }
    await loadFor(remote);
  }, [local, remote, loadFor, settings.lang, toast]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    await afterSignIn(r.user);
  }, [afterSignIn]);
  const register = useCallback(async (email: string, password: string, name: string) => {
    const r = await api<{ user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) });
    // carry this device's look & language into the new account
    await remote.saveSettings({ theme: settings.theme, lang: settings.lang, editorFontSize: settings.editorFontSize, layout: settings.layout, motion: settings.motion, autoRun: settings.autoRun, shortcuts: settings.shortcuts }).catch(() => {});
    await afterSignIn(r.user);
  }, [afterSignIn, remote, settings]);
  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    const s = await local.saveSettings({ theme: settings.theme, lang: settings.lang });
    setSettings(s);
    setProgress(await local.listProgress());
    setFavorites(await local.listFavorites());
  }, [local, settings.theme, settings.lang]);

  const setSidebarCollapsed = useCallback((v: boolean) => { setSidebarCollapsedState(v); storage().setItem("tp-sidebar", v ? "1" : "0"); }, []);

  const value: Ctx = {
    ready, user, source, settings, lang: settings.lang, t, updateSettings, progress, favorites, isFavorite, isDone, toggleFavorite, setDone, visit,
    login, register, logout, setUser, toasts, toast, dismissToast, paletteOpen, setPaletteOpen, helpOpen, setHelpOpen, sidebarCollapsed, setSidebarCollapsed, mac,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function authErrorKey(e: unknown): MessageKey {
  if (e instanceof ApiError && ["invalid", "exists", "weak", "bad_email", "locked"].includes(e.code)) return `auth.err.${e.code}` as MessageKey;
  return "auth.err.network";
}

/**
 * Theme palettes, applied as CSS custom properties on <html data-theme="…">.
 * Layering: bg → surface → surface-2 → surface-3 step up gently; borders are hairlines.
 * `--accent-text` is the accent tuned for text on surfaces; `--glow` tints shadows and halos.
 * Contrast rules are enforced in tests/core/themes.test.ts.
 */
export const REQUIRED_VARS = [
  "--bg", "--bg-2", "--surface", "--surface-2", "--surface-3", "--border", "--border-strong",
  "--text", "--muted", "--faint", "--accent", "--accent-2", "--accent-fg", "--accent-text", "--accent-soft", "--glow",
  "--danger", "--success", "--warning", "--shadow",
  "--code-bg", "--syn-keyword", "--syn-string", "--syn-number", "--syn-comment", "--syn-fn", "--syn-type",
] as const;
export type ThemeVar = (typeof REQUIRED_VARS)[number];

export const THEME_IDS = ["light", "dark", "eyecare", "blackred", "gold", "purple", "ocean", "sakura", "graphite"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export type ThemePref = ThemeId | "system";

export interface Theme { id: ThemeId; dark: boolean; serif?: boolean; vars: Record<ThemeVar, string> }

const darkCode = { "--code-bg": "#0b0b10", "--syn-keyword": "#ff7ab6", "--syn-string": "#a5e888", "--syn-number": "#ffb86b", "--syn-comment": "#6f7787", "--syn-fn": "#7cc7ff", "--syn-type": "#ffd479" };
const lightCode = { "--code-bg": "#fbfbfd", "--syn-keyword": "#b4237a", "--syn-string": "#2f7d1f", "--syn-number": "#a3520a", "--syn-comment": "#7a8090", "--syn-fn": "#1f5fbf", "--syn-type": "#8a5a00" };

export const THEMES: Theme[] = [
  { id: "light", dark: false, vars: {
    "--bg": "#f6f6f8", "--bg-2": "#eeeef2", "--surface": "#ffffff", "--surface-2": "#f7f7f9", "--surface-3": "#efeff3", "--border": "#e6e6ec", "--border-strong": "#d4d4dc",
    "--text": "#16161d", "--muted": "#5f6070", "--faint": "#9a9aa8", "--accent": "#2563eb", "--accent-2": "#06b6d4", "--accent-fg": "#ffffff", "--accent-text": "#1d4fd8", "--accent-soft": "#e8effe", "--glow": "#2563eb",
    "--danger": "#d92d20", "--success": "#12a150", "--warning": "#c27c0e", "--shadow": "#1a1d33", ...lightCode } },
  { id: "dark", dark: true, vars: {
    "--bg": "#08080b", "--bg-2": "#0d0d11", "--surface": "#111116", "--surface-2": "#17171d", "--surface-3": "#1f1f26", "--border": "#24242c", "--border-strong": "#32323c",
    "--text": "#ededf2", "--muted": "#9a9aa6", "--faint": "#62626e", "--accent": "#5b8cff", "--accent-2": "#22d3ee", "--accent-fg": "#050814", "--accent-text": "#8aaeff", "--accent-soft": "#141d33", "--glow": "#5b8cff",
    "--danger": "#f87171", "--success": "#4ade80", "--warning": "#fbbf24", "--shadow": "#000000", ...darkCode } },
  { id: "eyecare", dark: false, vars: {
    "--bg": "#eef2e4", "--bg-2": "#e4e9d7", "--surface": "#f7f9f0", "--surface-2": "#eff3e5", "--surface-3": "#e6ebda", "--border": "#d8dfc7", "--border-strong": "#c5ceb0",
    "--text": "#1f2a1c", "--muted": "#55624d", "--faint": "#8a957f", "--accent": "#3f7d4e", "--accent-2": "#8ab04f", "--accent-fg": "#ffffff", "--accent-text": "#346b42", "--accent-soft": "#dfead7", "--glow": "#3f7d4e",
    "--danger": "#b42318", "--success": "#3f7d4e", "--warning": "#9a6a00", "--shadow": "#2b3a22",
    "--code-bg": "#f3f6ea", "--syn-keyword": "#9c2b62", "--syn-string": "#2f6b1c", "--syn-number": "#9a4b06", "--syn-comment": "#76806b", "--syn-fn": "#255e8a", "--syn-type": "#7a5300" } },
  { id: "blackred", dark: true, serif: true, vars: {
    "--bg": "#070505", "--bg-2": "#0c0808", "--surface": "#120c0c", "--surface-2": "#191111", "--surface-3": "#221616", "--border": "#2c1c1c", "--border-strong": "#3d2525",
    "--text": "#f5ecea", "--muted": "#a99490", "--faint": "#6e5b58", "--accent": "#e11d2e", "--accent-2": "#ff6b4a", "--accent-fg": "#ffffff", "--accent-text": "#ff5a63", "--accent-soft": "#2a0f12", "--glow": "#e11d2e",
    "--danger": "#ff6b6b", "--success": "#7bd88f", "--warning": "#ffb547", "--shadow": "#000000",
    "--code-bg": "#0b0707", "--syn-keyword": "#ff6b7a", "--syn-string": "#e8c39e", "--syn-number": "#ffa36b", "--syn-comment": "#7a6663", "--syn-fn": "#f2d0c9", "--syn-type": "#ffcf70" } },
  { id: "gold", dark: true, serif: true, vars: {
    "--bg": "#080806", "--bg-2": "#0d0c09", "--surface": "#13120e", "--surface-2": "#1a1813", "--surface-3": "#23201a", "--border": "#2d2a21", "--border-strong": "#3e3a2d",
    "--text": "#f6f0e2", "--muted": "#a39a86", "--faint": "#6c6553", "--accent": "#d4af37", "--accent-2": "#f3d98b", "--accent-fg": "#1a1406", "--accent-text": "#e5c45f", "--accent-soft": "#272010", "--glow": "#d4af37",
    "--danger": "#ef6b5b", "--success": "#a8c36f", "--warning": "#f0b44a", "--shadow": "#000000",
    "--code-bg": "#0b0a07", "--syn-keyword": "#e5c45f", "--syn-string": "#c9d79a", "--syn-number": "#f0a66b", "--syn-comment": "#76705e", "--syn-fn": "#f3e3b5", "--syn-type": "#d9b98a" } },
  { id: "purple", dark: true, vars: {
    "--bg": "#08060f", "--bg-2": "#0d0a17", "--surface": "#130f20", "--surface-2": "#1a1529", "--surface-3": "#221c35", "--border": "#2b2440", "--border-strong": "#3b3256",
    "--text": "#f0ecfb", "--muted": "#a59cbf", "--faint": "#6b6386", "--accent": "#7c3aed", "--accent-2": "#e879f9", "--accent-fg": "#ffffff", "--accent-text": "#b79bff", "--accent-soft": "#1f1638", "--glow": "#8b5cf6",
    "--danger": "#fb7185", "--success": "#4ade80", "--warning": "#fbbf24", "--shadow": "#000000",
    "--code-bg": "#0a0814", "--syn-keyword": "#f083ff", "--syn-string": "#9ff0b8", "--syn-number": "#ffb38a", "--syn-comment": "#716a8c", "--syn-fn": "#9cc2ff", "--syn-type": "#ffd98a" } },
  { id: "ocean", dark: true, vars: {
    "--bg": "#04090d", "--bg-2": "#071016", "--surface": "#0a161e", "--surface-2": "#0f1e28", "--surface-3": "#152733", "--border": "#1b303d", "--border-strong": "#27424f",
    "--text": "#e6f3f8", "--muted": "#8fabb8", "--faint": "#58737f", "--accent": "#14b8a6", "--accent-2": "#38bdf8", "--accent-fg": "#02110f", "--accent-text": "#4fd8c6", "--accent-soft": "#0b2a2a", "--glow": "#14b8a6",
    "--danger": "#fb7185", "--success": "#4ade80", "--warning": "#fbbf24", "--shadow": "#000000",
    "--code-bg": "#050d12", "--syn-keyword": "#5eead4", "--syn-string": "#bef264", "--syn-number": "#fdba74", "--syn-comment": "#5d7885", "--syn-fn": "#7dd3fc", "--syn-type": "#fde68a" } },
  { id: "sakura", dark: false, vars: {
    "--bg": "#fbf5f6", "--bg-2": "#f5eaed", "--surface": "#ffffff", "--surface-2": "#fcf6f7", "--surface-3": "#f6ecef", "--border": "#efdfe4", "--border-strong": "#e2cbd2",
    "--text": "#2a1a20", "--muted": "#715a62", "--faint": "#a8939a", "--accent": "#cc2c63", "--accent-2": "#f59e8b", "--accent-fg": "#ffffff", "--accent-text": "#c02a5e", "--accent-soft": "#fde8ef", "--glow": "#d63a6e",
    "--danger": "#c81e1e", "--success": "#15803d", "--warning": "#a16207", "--shadow": "#4a1d2b",
    "--code-bg": "#fdf9fa", "--syn-keyword": "#b0215a", "--syn-string": "#2f7d1f", "--syn-number": "#a3520a", "--syn-comment": "#857179", "--syn-fn": "#2457b0", "--syn-type": "#8a5a00" } },
  { id: "graphite", dark: true, vars: {
    "--bg": "#0f1012", "--bg-2": "#141518", "--surface": "#191a1e", "--surface-2": "#1f2025", "--surface-3": "#27282e", "--border": "#2e3036", "--border-strong": "#3c3e46",
    "--text": "#eceef2", "--muted": "#9ea2ad", "--faint": "#686c76", "--accent": "#f97316", "--accent-2": "#facc15", "--accent-fg": "#160800", "--accent-text": "#fb923c", "--accent-soft": "#2d1d10", "--glow": "#f97316",
    "--danger": "#f87171", "--success": "#4ade80", "--warning": "#facc15", "--shadow": "#000000", ...darkCode, "--code-bg": "#121316" } },
];

export const themeById = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];
export const isThemePref = (v: unknown): v is ThemePref => v === "system" || (THEME_IDS as readonly string[]).includes(v as string);

/** Turn a stored preference into a concrete theme id. */
export function resolveTheme(pref: string, prefersDark: boolean): ThemeId {
  if (pref === "system") return prefersDark ? "dark" : "light";
  return themeById(pref).id;
}
export function nextTheme(current: string): ThemeId {
  const i = (THEME_IDS as readonly string[]).indexOf(current);
  return THEME_IDS[(i + 1) % THEME_IDS.length];
}

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
/** WCAG 2 contrast ratio between two hex colours. */
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function themeCss(): string {
  return THEMES.map((t) => `[data-theme="${t.id}"]{color-scheme:${t.dark ? "dark" : "light"};${Object.entries(t.vars).map(([k, v]) => `${k}:${v}`).join(";")}}`).join("\n");
}

/** Inline script for <head>: applies the saved theme before first paint (no flash). */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("tp-theme")||"system";var ids=${JSON.stringify(THEME_IDS)};var d=matchMedia("(prefers-color-scheme: dark)").matches;var t=p==="system"?(d?"dark":"light"):(ids.indexOf(p)>=0?p:"light");document.documentElement.dataset.theme=t;var l=localStorage.getItem("tp-lang");if(l==="en"||l==="zh"){document.documentElement.lang=l==="zh"?"zh-CN":"en";}}catch(e){document.documentElement.dataset.theme="light";}})();`;

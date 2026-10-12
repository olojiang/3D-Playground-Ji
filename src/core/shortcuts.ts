/**
 * Keyboard shortcuts: a pure registry + matcher (no DOM), so it is fully unit-tested.
 * Bindings are strings: "mod+k" (⌘ on macOS, Ctrl elsewhere), "shift+?", "alt+1", or a two-key
 * sequence "g t". Users can override any binding; overrides are validated and conflict-checked.
 */
export type Scope = "global" | "lesson" | "playground";
export type Group = "general" | "navigation" | "lesson" | "editor" | "view";

export interface ShortcutDef { id: string; keys: string; scope: Scope; group: Group; /** fires even while typing in an input/editor */ inInputs?: boolean }

export const SHORTCUTS: ShortcutDef[] = [
  // general
  { id: "palette", keys: "mod+k", scope: "global", group: "general", inInputs: true },
  { id: "search", keys: "/", scope: "global", group: "general" },
  { id: "help", keys: "shift+?", scope: "global", group: "general" },
  { id: "theme.next", keys: "t", scope: "global", group: "general" },
  { id: "lang.toggle", keys: "l", scope: "global", group: "general" },
  { id: "sidebar.toggle", keys: "mod+b", scope: "global", group: "view", inInputs: true },
  { id: "escape", keys: "escape", scope: "global", group: "general", inInputs: true },
  // navigation (sequences)
  { id: "go.home", keys: "g h", scope: "global", group: "navigation" },
  { id: "go.three", keys: "g t", scope: "global", group: "navigation" },
  { id: "go.webgl", keys: "g w", scope: "global", group: "navigation" },
  { id: "go.gpu", keys: "g g", scope: "global", group: "navigation" },
  { id: "go.playground", keys: "g p", scope: "global", group: "navigation" },
  { id: "go.me", keys: "g m", scope: "global", group: "navigation" },
  { id: "go.docs", keys: "g d", scope: "global", group: "navigation" },
  { id: "go.settings", keys: "g s", scope: "global", group: "navigation" },
  // lesson
  { id: "lesson.prev", keys: "k", scope: "lesson", group: "lesson" },
  { id: "lesson.next", keys: "j", scope: "lesson", group: "lesson" },
  { id: "lesson.favorite", keys: "f", scope: "lesson", group: "lesson" },
  { id: "lesson.complete", keys: "c", scope: "lesson", group: "lesson" },
  { id: "tab.concepts", keys: "alt+1", scope: "lesson", group: "view", inInputs: true },
  { id: "tab.code", keys: "alt+2", scope: "lesson", group: "view", inInputs: true },
  { id: "tab.console", keys: "alt+3", scope: "lesson", group: "view", inInputs: true },
  // editor / run (lesson + playground)
  { id: "run", keys: "mod+enter", scope: "lesson", group: "editor", inInputs: true },
  { id: "save", keys: "mod+s", scope: "lesson", group: "editor", inInputs: true },
  { id: "reset", keys: "mod+shift+r", scope: "lesson", group: "editor", inInputs: true },
  { id: "pause", keys: "p", scope: "lesson", group: "editor" },
  { id: "fullscreen", keys: "mod+shift+f", scope: "lesson", group: "view", inInputs: true },
  { id: "layout.toggle", keys: "mod+\\", scope: "lesson", group: "view", inInputs: true },
  { id: "font.bigger", keys: "mod+=", scope: "lesson", group: "editor", inInputs: true },
  { id: "font.smaller", keys: "mod+-", scope: "lesson", group: "editor", inInputs: true },
];

export interface Combo { mod: boolean; shift: boolean; alt: boolean; key: string }
export type Binding = Combo[]; // 1 = chord, 2 = sequence

const KEY_ALIASES: Record<string, string> = { esc: "escape", return: "enter", space: " ", plus: "+", slash: "/" };
const MODS = new Set(["mod", "shift", "alt"]);

export function parseCombo(s: string): Combo {
  const raw = s.trim().toLowerCase();
  // allow a literal "+" key, e.g. "mod++"
  const parts = raw.endsWith("++") ? [...raw.slice(0, -2).split("+").filter(Boolean), "+"] : raw.split("+");
  const c: Combo = { mod: false, shift: false, alt: false, key: "" };
  for (const p of parts) {
    if (p === "mod" || p === "cmd" || p === "ctrl" || p === "meta") c.mod = true;
    else if (p === "shift") c.shift = true;
    else if (p === "alt" || p === "option") c.alt = true;
    else c.key = KEY_ALIASES[p] ?? p;
  }
  if (!c.key || MODS.has(c.key)) throw new Error(`invalid shortcut: ${s}`);
  return c;
}

export function parseBinding(s: string): Binding {
  const steps = s.trim().split(/\s+/);
  if (steps.length < 1 || steps.length > 2) throw new Error(`invalid shortcut: ${s}`);
  const b = steps.map(parseCombo);
  if (b.length === 2 && b.some((c) => c.mod || c.alt)) throw new Error(`sequences must be plain keys: ${s}`);
  return b;
}

export function isValidBinding(s: unknown): s is string {
  if (typeof s !== "string" || s.length > 32) return false;
  try { parseBinding(s); return true; } catch { return false; }
}

export const normalizeBinding = (s: string) => parseBinding(s).map(comboToString).join(" ");
function comboToString(c: Combo) {
  return [c.mod && "mod", c.alt && "alt", c.shift && "shift", c.key === " " ? "space" : c.key].filter(Boolean).join("+");
}

const PRETTY: Record<string, [string, string]> = { // [mac, other]
  enter: ["↵", "Enter"], escape: ["Esc", "Esc"], arrowup: ["↑", "↑"], arrowdown: ["↓", "↓"], arrowleft: ["←", "←"], arrowright: ["→", "→"], " ": ["Space", "Space"], "\\": ["\\", "\\"],
};
/** Display tokens for a binding, e.g. ["⌘", "K"] or ["Ctrl", "K"]; sequences get a "then" marker "→". */
export function formatBinding(s: string, mac: boolean): string[][] {
  return parseBinding(s).map((c) => {
    const out: string[] = [];
    if (c.mod) out.push(mac ? "⌘" : "Ctrl");
    if (c.alt) out.push(mac ? "⌥" : "Alt");
    if (c.shift && !(c.key.length === 1 && /[^a-z0-9]/.test(c.key))) out.push(mac ? "⇧" : "Shift");
    const p = PRETTY[c.key];
    out.push(p ? p[mac ? 0 : 1] : c.key.length === 1 ? c.key.toUpperCase() : c.key[0].toUpperCase() + c.key.slice(1));
    return out;
  });
}

export interface KeyLike { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }

/** Key name from an event, using `code` for Alt+digit (macOS Option produces symbols like "¡"). */
function eventKey(e: KeyLike): string {
  if (e.altKey && e.code && /^Digit\d$/.test(e.code)) return e.code.slice(5);
  if (e.altKey && e.code && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  return e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
}

export function matchCombo(c: Combo, e: KeyLike, mac: boolean): boolean {
  const mod = mac ? e.metaKey : e.ctrlKey;
  const other = mac ? e.ctrlKey : e.metaKey;
  if (mod !== c.mod || other || e.altKey !== c.alt) return false;
  const k = eventKey(e);
  // Shifted symbols ("?", "+") already encode shift in e.key, so only compare shift for letters/named keys.
  const symbol = c.key.length === 1 && /[^a-z0-9]/.test(c.key);
  if (!symbol && e.shiftKey !== c.shift) return false;
  if (k === c.key) return true;
  return c.key === "=" && k === "+"; // mod+= also fires for mod++ on most layouts
}

/** Apply user overrides (id → keys). Invalid or unknown entries are ignored. */
export function resolveBindings(overrides: Record<string, string> = {}): ShortcutDef[] {
  return SHORTCUTS.map((d) => {
    const o = overrides[d.id];
    return o !== undefined && isValidBinding(o) ? { ...d, keys: normalizeBinding(o) } : d;
  });
}

const scopesOverlap = (a: Scope, b: Scope) => a === b || a === "global" || b === "global";
/** Pairs of shortcut ids that would fire on the same keys in overlapping scopes (including a key that prefixes a sequence). */
export function findConflicts(defs: ShortcutDef[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < defs.length; i++) for (let j = i + 1; j < defs.length; j++) {
    const a = defs[i], b = defs[j];
    if (!scopesOverlap(a.scope, b.scope)) continue;
    const ka = normalizeBinding(a.keys).split(" "), kb = normalizeBinding(b.keys).split(" ");
    const n = Math.min(ka.length, kb.length);
    if (ka.slice(0, n).join(" ") === kb.slice(0, n).join(" ")) out.push([a.id, b.id]);
  }
  return out;
}

/**
 * Stateful matcher for a stream of key events. Returns the id to fire, "pending" while inside a
 * sequence, or null. `typing` = focus is in an input/editor (only `inInputs` shortcuts fire).
 */
export function createMatcher(defs: ShortcutDef[], opts: { mac: boolean; timeoutMs?: number; now?: () => number }) {
  const timeout = opts.timeoutMs ?? 1200;
  const now = opts.now ?? (() => Date.now());
  const parsed = defs.map((d) => ({ d, b: parseBinding(d.keys) }));
  let pending: { first: KeyLike; at: number } | null = null;
  return function handle(e: KeyLike, ctx: { scopes: Scope[]; typing: boolean }): string | "pending" | null {
    if (["shift", "meta", "control", "alt"].includes(e.key.toLowerCase())) return null;
    const active = parsed.filter(({ d }) => ctx.scopes.includes(d.scope) && (!ctx.typing || d.inInputs));
    if (pending && now() - pending.at <= timeout) {
      const first = pending.first;
      pending = null;
      const hit = active.find(({ b }) => b.length === 2 && matchCombo(b[0], first, opts.mac) && matchCombo(b[1], e, opts.mac));
      if (hit) return hit.d.id;
    }
    pending = null;
    const starts = active.some(({ b }) => b.length === 2 && matchCombo(b[0], e, opts.mac));
    if (starts) { pending = { first: e, at: now() }; return "pending"; }
    const hit = active.find(({ b }) => b.length === 1 && matchCombo(b[0], e, opts.mac));
    return hit ? hit.d.id : null;
  };
}

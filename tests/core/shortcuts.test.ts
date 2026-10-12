import { describe, it, expect } from "vitest";
import { SHORTCUTS, parseCombo, parseBinding, formatBinding, matchCombo, createMatcher, findConflicts, resolveBindings, isValidBinding, normalizeBinding, type KeyLike } from "@/core/shortcuts";

const ev = (key: string, m: Partial<KeyLike> = {}): KeyLike => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...m });

describe("parsing", () => {
  it("parses chords with modifiers and aliases", () => {
    expect(parseCombo("Mod+Shift+K")).toEqual({ mod: true, shift: true, alt: false, key: "k" });
    expect(parseCombo("esc").key).toBe("escape");
    expect(parseCombo("mod++").key).toBe("+");
  });
  it("parses two-step sequences and rejects bad input", () => {
    expect(parseBinding("g t")).toHaveLength(2);
    expect(() => parseBinding("mod+g t")).toThrow();
    expect(() => parseBinding("shift")).toThrow();
    expect(() => parseBinding("a b c")).toThrow();
    expect(isValidBinding("mod+k")).toBe(true);
    expect(isValidBinding("")).toBe(false);
    expect(isValidBinding(42)).toBe(false);
  });
  it("normalizes modifier order", () => {
    expect(normalizeBinding("shift+mod+K")).toBe("mod+shift+k");
  });
});

describe("formatting", () => {
  it("uses mac symbols or words", () => {
    expect(formatBinding("mod+shift+f", true)).toEqual([["⌘", "⇧", "F"]]);
    expect(formatBinding("mod+shift+f", false)).toEqual([["Ctrl", "Shift", "F"]]);
    expect(formatBinding("g t", false)).toEqual([["G"], ["T"]]);
    expect(formatBinding("mod+enter", true)).toEqual([["⌘", "↵"]]);
    expect(formatBinding("shift+?", true)).toEqual([["?"]]);
  });
});

describe("matching", () => {
  it("maps mod to meta on mac and ctrl elsewhere", () => {
    const c = parseCombo("mod+k");
    expect(matchCombo(c, ev("k", { metaKey: true }), true)).toBe(true);
    expect(matchCombo(c, ev("k", { ctrlKey: true }), true)).toBe(false);
    expect(matchCombo(c, ev("k", { ctrlKey: true }), false)).toBe(true);
    expect(matchCombo(c, ev("k"), false)).toBe(false);
  });
  it("treats shifted symbols by their character", () => {
    expect(matchCombo(parseCombo("shift+?"), ev("?", { shiftKey: true }), false)).toBe(true);
  });
  it("uses the physical key for alt+digit (macOS option symbols)", () => {
    expect(matchCombo(parseCombo("alt+1"), ev("¡", { altKey: true, code: "Digit1" }), true)).toBe(true);
  });
  it("does not fire plain keys when shift is held", () => {
    expect(matchCombo(parseCombo("t"), ev("T", { shiftKey: true }), false)).toBe(false);
  });
});

describe("matcher", () => {
  it("handles sequences with a timeout", () => {
    let t = 0;
    const m = createMatcher(SHORTCUTS, { mac: false, now: () => t });
    expect(m(ev("g"), { scopes: ["global"], typing: false })).toBe("pending");
    expect(m(ev("t"), { scopes: ["global"], typing: false })).toBe("go.three");
    expect(m(ev("g"), { scopes: ["global"], typing: false })).toBe("pending");
    t = 5000;
    expect(m(ev("t"), { scopes: ["global"], typing: false })).toBe("theme.next");
  });
  it("respects scopes", () => {
    const m = createMatcher(SHORTCUTS, { mac: false });
    expect(m(ev("j"), { scopes: ["global"], typing: false })).toBeNull();
    expect(m(ev("j"), { scopes: ["global", "lesson"], typing: false })).toBe("lesson.next");
  });
  it("only fires inInputs shortcuts while typing", () => {
    const m = createMatcher(SHORTCUTS, { mac: true });
    expect(m(ev("t"), { scopes: ["global"], typing: true })).toBeNull();
    expect(m(ev("enter", { metaKey: true }), { scopes: ["global", "lesson"], typing: true })).toBe("run");
    expect(m(ev("Escape"), { scopes: ["global"], typing: true })).toBe("escape");
  });
  it("ignores bare modifier presses", () => {
    const m = createMatcher(SHORTCUTS, { mac: true });
    expect(m(ev("Shift", { shiftKey: true }), { scopes: ["global"], typing: false })).toBeNull();
  });
});

describe("registry", () => {
  it("has unique ids and no conflicts by default", () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
    expect(findConflicts(SHORTCUTS)).toEqual([]);
  });
  it("has at least 25 shortcuts across all groups", () => {
    expect(SHORTCUTS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(SHORTCUTS.map((s) => s.group)).size).toBe(5);
  });
  it("applies valid user overrides and ignores invalid ones", () => {
    const r = resolveBindings({ "theme.next": "Shift+T", run: "mod+g t", nope: "x" });
    expect(r.find((d) => d.id === "theme.next")!.keys).toBe("shift+t");
    expect(r.find((d) => d.id === "run")!.keys).toBe("mod+enter");
  });
  it("detects conflicts, including sequence prefixes", () => {
    expect(findConflicts(resolveBindings({ "theme.next": "mod+k" }))).toContainEqual(["palette", "theme.next"]);
    expect(findConflicts(resolveBindings({ "lang.toggle": "g" })).length).toBeGreaterThan(0);
  });
});

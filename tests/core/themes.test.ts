import { describe, it, expect } from "vitest";
import { THEMES, THEME_IDS, REQUIRED_VARS, contrast, themeCss, resolveTheme, nextTheme, themeById } from "@/core/themes";

describe("themes", () => {
  it("ships the themes Wei asked for (and more)", () => {
    for (const id of ["light", "dark", "eyecare", "blackred", "gold", "purple"]) expect(THEME_IDS).toContain(id);
    expect(THEMES.length).toBeGreaterThanOrEqual(8);
  });
  it.each(THEMES.map((t) => [t.id, t] as const))("%s defines every variable as a hex colour", (_id, t) => {
    for (const v of REQUIRED_VARS) expect(t.vars[v], `${t.id} ${v}`).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it.each(THEMES.map((t) => [t.id, t] as const))("%s has readable contrast", (_id, t) => {
    const v = t.vars;
    expect(contrast(v["--text"], v["--bg"])).toBeGreaterThanOrEqual(12);
    expect(contrast(v["--text"], v["--surface"])).toBeGreaterThanOrEqual(11);
    expect(contrast(v["--muted"], v["--surface"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v["--accent-fg"], v["--accent"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v["--accent-text"], v["--surface"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v["--syn-comment"], v["--code-bg"])).toBeGreaterThanOrEqual(3.5);
    for (const k of ["--syn-keyword", "--syn-string", "--syn-number", "--syn-fn", "--syn-type"] as const)
      expect(contrast(v[k], v["--code-bg"]), `${t.id} ${k}`).toBeGreaterThanOrEqual(4.5);
  });
  it("dark flag matches the background", () => {
    for (const t of THEMES) expect(contrast(t.vars["--bg"], "#000000") < 3, t.id).toBe(t.dark);
  });
  it("emits one CSS block per theme with color-scheme", () => {
    const css = themeCss();
    for (const t of THEMES) expect(css).toContain(`[data-theme="${t.id}"]{color-scheme:${t.dark ? "dark" : "light"}`);
  });
  it("resolves 'system' from the OS preference and unknown ids to light", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("gold", false)).toBe("gold");
    expect(resolveTheme("nope", false)).toBe("light");
    expect(themeById("nope").id).toBe("light");
  });
  it("cycles through themes and wraps", () => {
    expect(nextTheme(THEME_IDS[0])).toBe(THEME_IDS[1]);
    expect(nextTheme(THEME_IDS[THEME_IDS.length - 1])).toBe(THEME_IDS[0]);
    expect(nextTheme("system")).toBe(THEME_IDS[0]);
  });
});

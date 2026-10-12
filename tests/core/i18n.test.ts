import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MESSAGES, translate, placeholders, timeAgo, type MessageKey } from "@/core/i18n";
import { SHORTCUTS } from "@/core/shortcuts";
import { THEME_IDS } from "@/core/themes";
import { CATEGORIES } from "@/core/examples";

const keys = Object.keys(MESSAGES.zh) as MessageKey[];

describe("i18n", () => {
  it("zh and en have exactly the same keys, all non-empty", () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual([...keys].sort());
    for (const k of keys) { expect(MESSAGES.zh[k].trim(), k).not.toBe(""); expect(MESSAGES.en[k].trim(), k).not.toBe(""); }
  });
  it("placeholders match between languages", () => {
    for (const k of keys) expect(placeholders(MESSAGES.en[k]), k).toEqual(placeholders(MESSAGES.zh[k]));
  });
  it("English strings contain no Chinese (except the bilingual switch command)", () => {
    for (const k of keys) if (k !== "cmd.lang") expect(/[\u4e00-\u9fff]/.test(MESSAGES.en[k]), k).toBe(false);
  });
  it("every shortcut, theme and category has a label", () => {
    for (const s of SHORTCUTS) expect(keys).toContain(`sc.${s.id}`);
    for (const g of new Set(SHORTCUTS.map((s) => s.group))) expect(keys).toContain(`sc.group.${g}`);
    for (const t of THEME_IDS) expect(keys).toContain(`theme.${t}`);
    for (const c of CATEGORIES) for (const f of ["title", "short", "desc"]) expect(keys).toContain(`cat.${c}.${f}`);
  });
  it("interpolates and keeps unknown placeholders", () => {
    expect(translate("en", "home.lessons", { count: 3 })).toBe("3 lessons");
    expect(translate("zh", "home.progress", { done: 1 })).toBe("已完成 1/{total}");
  });
  it("formats relative time", () => {
    const now = 1_000_000_000;
    expect(timeAgo("en", now, now)).toBe("just now");
    expect(timeAgo("zh", now - 5 * 60000, now)).toBe("5 分钟前");
    expect(timeAgo("en", now - 3 * 3600000, now)).toBe("3 h ago");
    expect(timeAgo("en", now - 49 * 3600000, now)).toBe("2 days ago");
  });
});

describe("no hard-coded UI text", () => {
  // Components must go through t(); content files (docs) are exempt.
  const roots = ["src/components", "src/app"].map((r) => path.resolve(import.meta.dirname, "../..", r));
  const files: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) files.push(p); } };
  roots.forEach((r) => fs.existsSync(r) && walk(r));
  it.each(files.map((f) => [path.relative(process.cwd(), f), f]))("%s has no Chinese literals", (_rel, f) => {
    const src = fs.readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src.match(/[\u4e00-\u9fff]+/g) ?? []).toEqual([]);
  });
});

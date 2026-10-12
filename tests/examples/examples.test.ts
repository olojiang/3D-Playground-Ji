import { describe, it, expect } from "vitest";
import * as acorn from "acorn";
import raw from "@/generated/examples.json";
import { exampleMetaSchema, ALLOWED_IMPORT, CATEGORIES } from "@/core/examples";

type Raw = Record<string, unknown> & { category: string; dir: string; code: string; slug: string; requires: string };
const all = raw as Raw[];

describe("example catalog", () => {
  it("has examples in every category", () => {
    for (const c of CATEGORIES) expect(all.filter((e) => e.category === c).length, c).toBeGreaterThan(0);
  });
  it("slugs are unique per category and match their folder", () => {
    const seen = new Set<string>();
    for (const e of all) {
      expect(e.slug, e.dir).toBe(e.dir);
      const id = `${e.category}/${e.slug}`;
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
    }
  });
  it("orders are unique per category", () => {
    for (const c of CATEGORIES) {
      const orders = all.filter((e) => e.category === c).map((e) => e.order);
      expect(new Set(orders).size, c).toBe(orders.length);
    }
  });
});

describe.each(all.map((e) => [`${e.category}/${e.slug}`, e] as const))("%s", (_id, e) => {
  it("meta matches the schema (bilingual, complete)", () => {
    const { category: _c, dir: _d, code: _code, ...meta } = e;
    const r = exampleMetaSchema.safeParse(meta);
    expect(r.success ? "" : JSON.stringify(r.error.issues, null, 1)).toBe("");
  });
  it("concepts are substantial in both languages and the zh text is Chinese", () => {
    const m = e as unknown as { concepts: { zh: string; en: string }; title: { zh: string } };
    expect(m.concepts.zh.length).toBeGreaterThan(200);
    expect(m.concepts.en.length).toBeGreaterThan(300);
    expect(/[\u4e00-\u9fff]/.test(m.concepts.zh + m.title.zh)).toBe(true);
  });
  it("code is a valid ES module with only allowed imports", () => {
    const ast = acorn.parse(e.code, { ecmaVersion: "latest", sourceType: "module" });
    for (const n of ast.body) {
      if (n.type === "ImportDeclaration") expect(String(n.source.value)).toMatch(ALLOWED_IMPORT);
    }
  });
  it("code is self-contained and responsive", () => {
    expect(e.code).not.toMatch(/https?:\/\//); // no network assets: works offline / in China
    expect(e.code).toMatch(/resize|ResizeObserver|setSize|setAnimationLoop/);
  });
  it("WebGPU examples degrade gracefully", () => {
    if (e.requires === "webgpu") expect(e.code).toMatch(/navigator\.gpu|WebGPU\.isAvailable|isWebGPUAvailable|PG\.status/);
  });
});

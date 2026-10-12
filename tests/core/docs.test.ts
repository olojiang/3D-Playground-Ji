import { describe, it, expect } from "vitest";
import { DOCS } from "@/content/docs";
import { TEMPLATES } from "@/content/templates";
import { parseMarkdown, headings } from "@/core/markdown";
import * as acorn from "acorn";
import { ALLOWED_IMPORT } from "@/core/examples";

describe("docs", () => {
  it("has unique slugs and at least 8 pages", () => {
    expect(new Set(DOCS.map((d) => d.slug)).size).toBe(DOCS.length);
    expect(DOCS.length).toBeGreaterThanOrEqual(8);
  });
  it.each(DOCS.map((d) => [d.slug, d] as const))("%s is complete in both languages with matching structure", (_s, d) => {
    expect(d.title.zh && d.title.en).toBeTruthy();
    expect(/[\u4e00-\u9fff]/.test(d.body.zh)).toBe(true);
    expect(/[\u4e00-\u9fff]/.test(d.body.en)).toBe(false);
    const hz = headings(parseMarkdown(d.body.zh)), he = headings(parseMarkdown(d.body.en));
    expect(hz.length).toBe(he.length);
    expect(hz.length).toBeGreaterThan(1);
  });
});

describe("playground templates", () => {
  it.each(Object.entries(TEMPLATES))("%s parses and only uses allowed imports", (_id, code) => {
    const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module" });
    for (const n of ast.body) if (n.type === "ImportDeclaration") expect(String(n.source.value)).toMatch(ALLOWED_IMPORT);
    expect(code).toContain("PG.canvas");
  });
});

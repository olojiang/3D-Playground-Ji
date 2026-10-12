import { describe, it, expect } from "vitest";
import { sanitizeSettings, DEFAULT_SETTINGS, snippetInput, trackProgress, resumeTarget, newId } from "@/core/userdata";
import { fuzzyScore, searchExamples } from "@/core/search";
import type { ExampleSummary } from "@/core/examples";

describe("settings", () => {
  it("returns defaults for garbage", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("x")).toEqual(DEFAULT_SETTINGS);
  });
  it("keeps valid fields and drops invalid ones", () => {
    const s = sanitizeSettings({ theme: "gold", lang: "en", editorFontSize: 99, layout: "nope", motion: "reduced", autoRun: false, shortcuts: { run: "mod+r", bogus: "x", help: "mod+g t" } });
    expect(s).toEqual({ ...DEFAULT_SETTINGS, theme: "gold", lang: "en", editorFontSize: 22, motion: "reduced", autoRun: false, shortcuts: { run: "mod+r" } });
  });
  it("merges over a base", () => {
    expect(sanitizeSettings({ lang: "en" }, { ...DEFAULT_SETTINGS, theme: "purple" }).theme).toBe("purple");
  });
});

describe("snippets", () => {
  it("validates title, example id and size", () => {
    expect(snippetInput.safeParse({ title: " My test ", code: "x" }).data).toEqual({ title: "My test", exampleId: null, code: "x" });
    expect(snippetInput.safeParse({ title: "", code: "" }).success).toBe(false);
    expect(snippetInput.safeParse({ title: "a", code: "", exampleId: "../etc" }).success).toBe(false);
    expect(snippetInput.safeParse({ title: "a", code: "x".repeat(200_001) }).success).toBe(false);
    expect(snippetInput.safeParse({ title: "a", code: "", exampleId: "gpu/compute-basics" }).success).toBe(true);
  });
  it("makes compact unique ids", () => {
    const a = newId(), b = newId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-z0-9]{8,20}$/i);
  });
});

const cat = [
  { category: "three", slug: "a" }, { category: "three", slug: "b" }, { category: "webgl", slug: "c" }, { category: "gpu", slug: "d" },
] as const;
describe("progress", () => {
  const prog = [
    { exampleId: "three/a", visitedAt: 1, completedAt: 2 },
    { exampleId: "webgl/c", visitedAt: 5, completedAt: null },
    { exampleId: "three/b", visitedAt: 3, completedAt: null },
  ];
  it("computes per-track completion", () => {
    expect(trackProgress(prog, [...cat])).toEqual([
      { category: "three", done: 1, total: 2, pct: 50 }, { category: "webgl", done: 0, total: 1, pct: 0 }, { category: "gpu", done: 0, total: 1, pct: 0 },
    ]);
  });
  it("resumes the most recent unfinished lesson, else the first unfinished", () => {
    expect(resumeTarget(prog, [...cat])).toEqual(cat[2]);
    expect(resumeTarget([], [...cat])).toEqual(cat[0]);
    expect(resumeTarget([{ exampleId: "three/a", visitedAt: 1, completedAt: 1 }], [...cat])).toEqual(cat[1]);
  });
});

describe("search", () => {
  it("scores substring above subsequence and misses as 0", () => {
    expect(fuzzyScore("Raymarching SDF", "sdf")).toBeGreaterThan(fuzzyScore("Raymarching SDF", "rsf"));
    expect(fuzzyScore("abc", "xyz")).toBe(0);
  });
  const list: ExampleSummary[] = [
    { category: "three", slug: "x", order: 1, difficulty: "beginner", requires: "webgl", tags: ["light"], title: { zh: "灯光与阴影", en: "Lights & Shadows" }, summary: { zh: "阴影贴图", en: "Shadow maps" } },
    { category: "gpu", slug: "y", order: 1, difficulty: "advanced", requires: "webgpu", tags: ["compute"], title: { zh: "计算着色器", en: "Compute basics" }, summary: { zh: "存储缓冲", en: "Storage buffers" } },
  ];
  it("finds lessons in either language", () => {
    expect(searchExamples(list, "阴影", "en")[0].slug).toBe("x");
    expect(searchExamples(list, "compute", "zh")[0].slug).toBe("y");
    expect(searchExamples(list, "", "zh")).toHaveLength(2);
    expect(searchExamples(list, "zzzz", "zh")).toHaveLength(0);
  });
});

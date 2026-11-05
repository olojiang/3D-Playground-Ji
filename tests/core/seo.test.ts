import { describe, it, expect } from "vitest";
import { allExamples } from "@/server/catalog";
import { DOCS } from "@/content/docs";
import { CATEGORIES } from "@/core/examples";
import {
  SITE_URL, absoluteUrl, sitemapEntries, robotsConfig, langAlternates, lessonMetadata, trackMetadata, docMetadata,
  pageMetadata, sharedMetadata, lessonOgModel, langFromQuery, OG_SIZE,
} from "@/core/seo";

const examples = allExamples();

describe("site url", () => {
  it("is the production domain and builds absolute urls", () => {
    expect(SITE_URL).toBe("https://3d.827722.xyz");
    expect(absoluteUrl("/learn/three")).toBe("https://3d.827722.xyz/learn/three");
    expect(absoluteUrl("learn")).toBe("https://3d.827722.xyz/learn");
    expect(absoluteUrl("/")).toBe("https://3d.827722.xyz/");
  });
});

describe("sitemap", () => {
  const entries = sitemapEntries({ examples, docs: DOCS, lastModified: new Date("2026-11-05T00:00:00Z") });
  const urls = entries.map((e) => e.url);
  it("lists home, playground, docs, every track, every doc and every lesson — generated from data", () => {
    expect(examples.length).toBeGreaterThanOrEqual(36);
    expect(urls).toContain(`${SITE_URL}/`);
    expect(urls).toContain(`${SITE_URL}/playground`);
    expect(urls).toContain(`${SITE_URL}/docs`);
    for (const c of CATEGORIES) expect(urls).toContain(`${SITE_URL}/learn/${c}`);
    for (const d of DOCS) expect(urls).toContain(`${SITE_URL}/docs/${d.slug}`);
    for (const e of examples) expect(urls).toContain(`${SITE_URL}/learn/${e.category}/${e.slug}`);
    expect(entries.length).toBe(3 + CATEGORIES.length + DOCS.length + examples.length);
  });
  it("a new lesson appears automatically", () => {
    const extra = { ...examples[0], slug: "brand-new-lesson" };
    const more = sitemapEntries({ examples: [...examples, extra], docs: DOCS });
    expect(more.map((e) => e.url)).toContain(`${SITE_URL}/learn/${extra.category}/brand-new-lesson`);
  });
  it("has no duplicates, only absolute urls, no private or shared pages, and language alternates", () => {
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) expect(u.startsWith(SITE_URL + "/")).toBe(true);
    for (const bad of ["/me", "/settings", "/login", "/register", "/s/", "/api/"]) expect(urls.some((u) => u.includes(bad))).toBe(false);
    const lesson = entries.find((e) => e.url.endsWith(`/learn/${examples[0].category}/${examples[0].slug}`))!;
    expect(lesson.alternates?.languages).toEqual({ "zh-CN": `${lesson.url}?lang=zh`, en: `${lesson.url}?lang=en` });
    expect(lesson.priority).toBeGreaterThan(0);
    expect(entries.find((e) => e.url === `${SITE_URL}/`)!.priority).toBe(1);
  });
});

describe("robots", () => {
  it("allows the site, hides api/private pages, points to the sitemap", () => {
    const r = robotsConfig();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.allow).toBe("/");
    for (const p of ["/api/", "/me", "/settings"]) expect(rule.disallow).toContain(p);
    // shared snippets stay crawlable so link-preview bots (which obey robots.txt) can read the card; the page itself is noindex
    expect(rule.disallow).not.toContain("/s/");
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(r.host).toBe(SITE_URL);
  });
});

describe("page metadata", () => {
  const e = examples.find((x) => x.category === "three")!;
  it("language alternates point at ?lang= variants with an x-default", () => {
    expect(langAlternates("/docs")).toEqual({ canonical: "/docs", languages: { "zh-CN": "/docs?lang=zh", en: "/docs?lang=en", "x-default": "/docs" } });
  });
  it("lesson metadata is bilingual, canonical, with og + twitter", () => {
    for (const lang of ["zh", "en"] as const) {
      const m = lessonMetadata(e, lang);
      expect(m.title).toBe(e.title[lang]);
      expect(m.description).toBe(e.summary[lang]);
      expect(m.alternates?.canonical).toBe(`/learn/three/${e.slug}`);
      expect(m.openGraph).toMatchObject({ title: e.title[lang], description: e.summary[lang], url: `/learn/three/${e.slug}`, type: "article", locale: lang === "zh" ? "zh_CN" : "en_US" });
      expect(m.twitter).toMatchObject({ card: "summary_large_image", title: e.title[lang] });
      expect((m.keywords as string[])).toEqual(expect.arrayContaining(e.tags));
    }
    expect(lessonMetadata(e, "zh").title).not.toBe(lessonMetadata(e, "en").title);
  });
  it("track metadata uses the track title and description", () => {
    const zh = trackMetadata("webgl", "zh"), en = trackMetadata("webgl", "en");
    expect(zh.title).toBe("WebGL 与着色器");
    expect(en.title).toBe("WebGL & Shaders");
    expect(en.description?.length).toBeGreaterThan(20);
    expect(en.alternates?.canonical).toBe("/learn/webgl");
  });
  it("doc metadata uses the doc title and a plain-text excerpt of its body", () => {
    const d = DOCS[0];
    const m = docMetadata(d, "en");
    expect(m.title).toBe(d.title.en);
    expect(m.description!.length).toBeGreaterThan(20);
    expect(m.description!.length).toBeLessThanOrEqual(160);
    expect(m.description).not.toMatch(/[#*`>]/);
    expect(m.alternates?.canonical).toBe(`/docs/${d.slug}`);
  });
  it("generic pages and shared snippets", () => {
    const p = pageMetadata("/playground", "T", "D", "en");
    expect(p).toMatchObject({ title: "T", description: "D", alternates: { canonical: "/playground" } });
    const s = sharedMetadata({ id: "A".repeat(22), title: "My <galaxy>", code: "x", exampleId: null, updatedAt: 1 }, "en");
    expect(s.title).toBe("My <galaxy>");
    expect(s.robots).toMatchObject({ index: false });
    expect(s.alternates?.canonical).toBe(`/s/${"A".repeat(22)}`);
    expect(s.openGraph).toMatchObject({ url: `/s/${"A".repeat(22)}` });
  });
});

describe("og model", () => {
  it("carries bilingual title, track, difficulty and a brand gradient per track", () => {
    const e = examples.find((x) => x.category === "gpu")!;
    const m = lessonOgModel(e);
    expect(m.title).toEqual(e.title);
    expect(m.track.en).toBe("GPU & WebGPU Compute");
    expect(m.difficulty.en).toMatch(/Beginner|Intermediate|Advanced/);
    expect(m.gradient).toHaveLength(3);
    for (const c of m.gradient) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    expect(lessonOgModel(examples.find((x) => x.category === "three")!).gradient).not.toEqual(m.gradient);
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 });
  });
});

describe("?lang= override", () => {
  it("accepts only known languages", () => {
    expect(langFromQuery("?lang=en")).toBe("en");
    expect(langFromQuery("lang=zh&x=1")).toBe("zh");
    expect(langFromQuery("?lang=fr")).toBeNull();
    expect(langFromQuery("")).toBeNull();
  });
});

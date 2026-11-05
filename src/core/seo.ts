/**
 * SEO: canonical site URL, sitemap/robots builders and per-page metadata. Pure functions, so they are unit-tested
 * (tests/core/seo.test.ts) and the app/ files only wire them up. Language follows the tp-lang cookie; `?lang=` overrides it.
 */
import type { Metadata, MetadataRoute } from "next";
import { CATEGORIES, examplePath, type Category, type Example } from "./examples";
import { translate, type MessageKey } from "./i18n";
import type { Lang } from "./userdata";
import { sharePath, type SharedSnippet } from "./share";

export const SITE_URL = "https://3d.827722.xyz";
export const OG_SIZE = { width: 1200, height: 630 } as const;

export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

const OG_LOCALE: Record<Lang, string> = { zh: "zh_CN", en: "en_US" };
const HREFLANG: Record<Lang, string> = { zh: "zh-CN", en: "en" };

export { langFromQuery } from "./lang-query";

export function langAlternates(path: string): NonNullable<Metadata["alternates"]> {
  return { canonical: path, languages: { "zh-CN": `${path}?lang=zh`, en: `${path}?lang=en`, "x-default": path } };
}

/** Plain-text excerpt of our markdown subset, for meta descriptions. */
export function excerpt(md: string, max = 155): string {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`#>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Shared shape for every page: title, description, canonical + hreflang alternates, Open Graph and Twitter card. */
export function pageMetadata(path: string, title: string, description: string, lang: Lang, extra: { type?: "website" | "article"; keywords?: string[]; image?: string } = {}): Metadata {
  const m: Metadata = {
    title,
    description,
    alternates: langAlternates(path),
    openGraph: { title, description, url: path, siteName: "3D Playground", type: extra.type ?? "website", locale: OG_LOCALE[lang], alternateLocale: [OG_LOCALE[lang === "zh" ? "en" : "zh"]], ...(extra.image ? { images: [{ url: extra.image, ...OG_SIZE }] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(extra.image ? { images: [extra.image] } : {}) },
  };
  if (extra.keywords) m.keywords = extra.keywords;
  return m;
}

export const homeMetadata = (lang: Lang) => pageMetadata("/", `${translate(lang, "app.name")} · ${translate(lang, "app.tagline")}`, translate(lang, "app.description"), lang);

export function lessonMetadata(e: Pick<Example, "category" | "slug" | "title" | "summary" | "tags" | "keyApis">, lang: Lang): Metadata {
  const keywords = [...e.tags, ...e.keyApis.slice(0, 6), translate(lang, `cat.${e.category}.title` as MessageKey)];
  return pageMetadata(examplePath(e), e.title[lang], e.summary[lang], lang, { type: "article", keywords });
}

export const trackMetadata = (c: Category, lang: Lang) =>
  pageMetadata(`/learn/${c}`, translate(lang, `cat.${c}.title` as MessageKey), translate(lang, `cat.${c}.desc` as MessageKey), lang);

export const docMetadata = (d: { slug: string; title: Record<Lang, string>; body: Record<Lang, string> }, lang: Lang) =>
  pageMetadata(`/docs/${d.slug}`, d.title[lang], excerpt(d.body[lang]), lang, { type: "article" });

/** Shared snippets are reachable by link only: not indexed, not in the sitemap. */
export function sharedMetadata(s: SharedSnippet, lang: Lang): Metadata {
  const m = pageMetadata(sharePath(s.id), s.title, translate(lang, "share.metaDescription"), lang, { type: "article" });
  return { ...m, robots: { index: false, follow: false } };
}

export function sitemapEntries({ examples, docs, lastModified = new Date() }: { examples: Pick<Example, "category" | "slug">[]; docs: { slug: string }[]; lastModified?: Date }): MetadataRoute.Sitemap {
  const entry = (path: string, priority: number, changeFrequency: "weekly" | "monthly"): MetadataRoute.Sitemap[number] => {
    const url = path === "/" ? `${SITE_URL}/` : absoluteUrl(path);
    return { url, lastModified, changeFrequency, priority, alternates: { languages: { [HREFLANG.zh]: `${url}?lang=zh`, [HREFLANG.en]: `${url}?lang=en` } } };
  };
  const list = [
    entry("/", 1, "weekly"),
    ...CATEGORIES.map((c) => entry(`/learn/${c}`, 0.9, "weekly")),
    ...examples.map((e) => entry(examplePath(e), 0.8, "monthly")),
    entry("/playground", 0.7, "monthly"),
    entry("/docs", 0.6, "monthly"),
    ...docs.map((d) => entry(`/docs/${d.slug}`, 0.5, "monthly")),
  ];
  const seen = new Set<string>();
  return list.filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true)));
}

export function robotsConfig(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/me", "/settings", "/login", "/register"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

/* ---------- Open Graph images ---------- */
export const TRACK_GRADIENT: Record<Category, [string, string, string]> = {
  three: ["#4f46e5", "#7c3aed", "#06b6d4"],
  webgl: ["#db2777", "#7c3aed", "#f59e0b"],
  gpu: ["#059669", "#0ea5e9", "#6366f1"],
};
export const HOME_GRADIENT: [string, string, string] = ["#7c3aed", "#2563eb", "#06b6d4"];

export interface OgModel { title: Record<Lang, string>; track: Record<Lang, string>; difficulty: Record<Lang, string>; gradient: [string, string, string]; category: Category }
export function lessonOgModel(e: Pick<Example, "category" | "title" | "difficulty">): OgModel {
  const both = (k: MessageKey) => ({ zh: translate("zh", k), en: translate("en", k) });
  return { title: e.title, track: both(`cat.${e.category}.title` as MessageKey), difficulty: both(`diff.${e.difficulty}` as MessageKey), gradient: TRACK_GRADIENT[e.category], category: e.category };
}

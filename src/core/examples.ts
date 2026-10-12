import { z } from "zod";

/** The three learning tracks. Order here is the order shown in the UI. */
export const CATEGORIES = ["three", "webgl", "gpu"] as const;
export type Category = (typeof CATEGORIES)[number];

const text = z.object({ zh: z.string().trim().min(1), en: z.string().trim().min(1) });
const textList = z.object({ zh: z.array(z.string().trim().min(1)).min(1), en: z.array(z.string().trim().min(1)).min(1) });

export const exampleMetaSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  order: z.number().int().min(1),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  requires: z.enum(["webgl", "webgl2", "webgpu"]),
  tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1).max(8),
  title: text,
  summary: text,
  concepts: text,
  keyApis: z.array(z.string().min(1)).min(1).max(16),
  tryThis: textList,
});
export type ExampleMeta = z.infer<typeof exampleMetaSchema>;
export type Example = ExampleMeta & { category: Category; code: string };
/** What lists, search and the command palette need: no long text, no code. */
export type ExampleSummary = Pick<Example, "category" | "slug" | "order" | "difficulty" | "requires" | "tags" | "title" | "summary">;

export const ALLOWED_IMPORT = /^(three|three\/webgpu|three\/tsl|three\/addons\/[\w./-]+\.js)$/;

export const exampleId = (e: { category: Category; slug: string }) => `${e.category}/${e.slug}`;
export const examplePath = (e: { category: Category; slug: string }) => `/learn/${e.category}/${e.slug}`;

export function sortExamples<T extends { category: Category; order: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.order - b.order);
}

export function toSummary(e: Example): ExampleSummary {
  const { category, slug, order, difficulty, requires, tags, title, summary } = e;
  return { category, slug, order, difficulty, requires, tags, title, summary };
}

/** Previous / next within the same category, for J/K navigation. */
export function neighbours<T extends { category: Category; slug: string; order: number }>(list: T[], current: { category: Category; slug: string }) {
  const same = sortExamples(list.filter((e) => e.category === current.category));
  const i = same.findIndex((e) => e.slug === current.slug);
  return { prev: i > 0 ? same[i - 1] : null, next: i >= 0 && i < same.length - 1 ? same[i + 1] : null, index: i, total: same.length };
}

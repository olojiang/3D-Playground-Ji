/** Lesson catalog for server components. The full text/code never ships to the client except for the page that shows it. */
import raw from "@/generated/examples.json";
import { sortExamples, toSummary, CATEGORIES, type Category, type Example, type ExampleSummary } from "@/core/examples";

const ALL: Example[] = sortExamples((raw as unknown as (Example & { dir?: string })[]).map(({ dir: _dir, ...e }) => e as Example));

export const allExamples = () => ALL;
export const summaries = (): ExampleSummary[] => ALL.map(toSummary);
export const isCategory = (c: string): c is Category => (CATEGORIES as readonly string[]).includes(c);
export const getExample = (category: string, slug: string) => ALL.find((e) => e.category === category && e.slug === slug) ?? null;
export const byCategory = (c: Category) => ALL.filter((e) => e.category === c);

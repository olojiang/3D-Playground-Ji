/** Fuzzy search for the command palette and lesson search. Matches both languages regardless of UI language. */
import type { ExampleSummary } from "./examples";

/** Score how well `query` matches `text` (0 = no match). Substring beats subsequence; word starts get a bonus. */
export function fuzzyScore(text: string, query: string): number {
  const t = text.toLowerCase(), q = query.toLowerCase().trim();
  if (!q) return 1;
  const idx = t.indexOf(q);
  if (idx >= 0) return 100 - Math.min(idx, 50) + (idx === 0 || /[\s\-·/]/.test(t[idx - 1]) ? 30 : 0) + (t.length === q.length ? 50 : 0);
  let ti = 0, score = 0, streak = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const j = t.indexOf(ch, ti);
    if (j < 0) return 0;
    streak = j === ti ? streak + 1 : 0;
    score += 1 + streak;
    ti = j + 1;
  }
  return Math.min(60, score * 2);
}

export function searchExamples(list: ExampleSummary[], query: string, lang: "zh" | "en"): ExampleSummary[] {
  const q = query.trim();
  if (!q) return list;
  return list
    .map((e) => {
      const other = lang === "zh" ? "en" : "zh";
      const s = Math.max(
        fuzzyScore(e.title[lang], q) * 3, fuzzyScore(e.title[other], q) * 2.5,
        ...e.tags.map((t) => fuzzyScore(t, q) * 2),
        fuzzyScore(e.summary[lang], q) > 60 ? fuzzyScore(e.summary[lang], q) : 0,
        fuzzyScore(e.summary[other], q) > 60 ? fuzzyScore(e.summary[other], q) * 0.8 : 0,
      );
      return { e, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.e);
}

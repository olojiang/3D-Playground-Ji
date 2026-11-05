import { renderOgCard } from "@/server/og";
import { lessonOgModel, OG_SIZE, HOME_GRADIENT } from "@/core/seo";
import { allExamples, getExample } from "@/server/catalog";

export const alt = "3D Playground lesson";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return allExamples().map((e) => ({ category: e.category, slug: e.slug }));
}

export default async function Image({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params;
  const e = getExample(category, slug);
  if (!e) return renderOgCard({ eyebrow: "", title: "3D Playground", gradient: HOME_GRADIENT });
  const m = lessonOgModel(e);
  return renderOgCard({ eyebrow: m.track.en, title: m.title.zh, subtitle: m.title.en, chips: [m.track.zh, `${m.difficulty.zh} · ${m.difficulty.en}`], gradient: m.gradient });
}

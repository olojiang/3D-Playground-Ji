import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { allExamples, getExample } from "@/server/catalog";
import { LessonView } from "@/components/LessonView";
import { isLang } from "@/core/userdata";

type P = { params: Promise<{ category: string; slug: string }> };

export function generateStaticParams() {
  return allExamples().map((e) => ({ category: e.category, slug: e.slug }));
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { category, slug } = await params;
  const e = getExample(category, slug);
  const l = (await cookies()).get("tp-lang")?.value;
  const lang = isLang(l) ? l : "zh";
  return e ? { title: e.title[lang], description: e.summary[lang] } : {};
}

export default async function LessonPage({ params }: P) {
  const { category, slug } = await params;
  const e = getExample(category, slug);
  if (!e) notFound();
  return <LessonView key={`${e.category}/${e.slug}`} example={e} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allExamples, getExample } from "@/server/catalog";
import { LessonView } from "@/components/LessonView";
import { lessonMetadata } from "@/core/seo";
import { requestLang } from "@/server/lang";

type P = { params: Promise<{ category: string; slug: string }> };

export function generateStaticParams() {
  return allExamples().map((e) => ({ category: e.category, slug: e.slug }));
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { category, slug } = await params;
  const e = getExample(category, slug);
  return e ? lessonMetadata(e, await requestLang()) : {};
}

export default async function LessonPage({ params }: P) {
  const { category, slug } = await params;
  const e = getExample(category, slug);
  if (!e) notFound();
  return <LessonView key={`${e.category}/${e.slug}`} example={e} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { docMetadata } from "@/core/seo";
import { requestLang } from "@/server/lang";
import { DOCS, docBySlug } from "@/content/docs";
import { DocsView } from "@/components/DocsView";

type P = { params: Promise<{ slug: string }> };
export const generateStaticParams = () => DOCS.map((d) => ({ slug: d.slug }));

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const d = docBySlug((await params).slug);
  return d ? docMetadata(d, await requestLang()) : {};
}

export default async function DocPage({ params }: P) {
  const { slug } = await params;
  if (!docBySlug(slug)) notFound();
  return <DocsView slug={slug} />;
}

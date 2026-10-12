import { notFound } from "next/navigation";
import { DOCS, docBySlug } from "@/content/docs";
import { DocsView } from "@/components/DocsView";

type P = { params: Promise<{ slug: string }> };
export const generateStaticParams = () => DOCS.map((d) => ({ slug: d.slug }));

export default async function DocPage({ params }: P) {
  const { slug } = await params;
  if (!docBySlug(slug)) notFound();
  return <DocsView slug={slug} />;
}

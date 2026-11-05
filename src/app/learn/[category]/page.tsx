import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { trackMetadata } from "@/core/seo";
import { requestLang } from "@/server/lang";
import { CATEGORIES } from "@/core/examples";
import { isCategory } from "@/server/catalog";
import { TrackView } from "@/components/TrackView";

type P = { params: Promise<{ category: string }> };
export const generateStaticParams = () => CATEGORIES.map((category) => ({ category }));

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { category } = await params;
  return isCategory(category) ? trackMetadata(category, await requestLang()) : {};
}

export default async function TrackPage({ params }: P) {
  const { category } = await params;
  if (!isCategory(category)) notFound();
  return <TrackView category={category} />;
}

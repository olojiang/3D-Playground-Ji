import { notFound } from "next/navigation";
import { CATEGORIES } from "@/core/examples";
import { isCategory } from "@/server/catalog";
import { TrackView } from "@/components/TrackView";

type P = { params: Promise<{ category: string }> };
export const generateStaticParams = () => CATEGORIES.map((category) => ({ category }));

export default async function TrackPage({ params }: P) {
  const { category } = await params;
  if (!isCategory(category)) notFound();
  return <TrackView category={category} />;
}

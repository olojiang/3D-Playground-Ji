import type { Metadata } from "next";
import { HomeView } from "@/components/HomeView";
import { homeMetadata } from "@/core/seo";
import { requestLang } from "@/server/lang";

export async function generateMetadata(): Promise<Metadata> {
  const m = homeMetadata(await requestLang());
  return { ...m, title: { absolute: String(m.title) } };
}

export default function HomePage() {
  return <HomeView />;
}

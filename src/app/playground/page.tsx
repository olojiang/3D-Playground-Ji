import type { Metadata } from "next";
import { Suspense } from "react";
import { PlaygroundView } from "@/components/PlaygroundView";
import { pageMetadata } from "@/core/seo";
import { translate } from "@/core/i18n";
import { requestLang } from "@/server/lang";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await requestLang();
  return pageMetadata("/playground", translate(lang, "pg.title"), translate(lang, "pg.subtitle"), lang);
}

export default function PlaygroundPage() {
  return <Suspense><PlaygroundView /></Suspense>;
}

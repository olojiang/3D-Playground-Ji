import type { Metadata } from "next";
import { DocsView } from "@/components/DocsView";
import { DOCS } from "@/content/docs";
import { pageMetadata, excerpt } from "@/core/seo";
import { translate } from "@/core/i18n";
import { requestLang } from "@/server/lang";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await requestLang();
  return pageMetadata("/docs", translate(lang, "nav.docs"), excerpt(DOCS[0].body[lang]), lang);
}

export default function DocsIndex() {
  return <DocsView slug={DOCS[0].slug} />;
}

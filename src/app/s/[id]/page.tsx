import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SHARE_ID } from "@/core/share";
import { sharedMetadata } from "@/core/seo";
import { getSharedSnippet } from "@/server/repo";
import { requestLang } from "@/server/lang";
import { SharedView } from "@/components/SharedView";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

const load = cache(async (id: string) => (SHARE_ID.test(id) ? getSharedSnippet(id).catch(() => null) : null));

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const s = await load((await params).id);
  return s ? sharedMetadata(s, await requestLang()) : { robots: { index: false } };
}

export default async function SharedPage({ params }: P) {
  const s = await load((await params).id);
  if (!s) notFound();
  return <SharedView snippet={s} />;
}

import { renderOgCard } from "@/server/og";
import { translate } from "@/core/i18n";
import { HOME_GRADIENT, TRACK_GRADIENT, OG_SIZE } from "@/core/seo";
import { SHARE_ID } from "@/core/share";
import { getSharedSnippet } from "@/server/repo";
import { getExample } from "@/server/catalog";

export const alt = "3D Playground shared snippet";
export const size = OG_SIZE;
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = SHARE_ID.test(id) ? await getSharedSnippet(id).catch(() => null) : null;
  const [cat, slug] = s?.exampleId?.split("/") ?? [];
  const lesson = cat && slug ? getExample(cat, slug) : null;
  return renderOgCard({
    eyebrow: translate("en", "share.sharedSnippet"),
    title: s?.title ?? "3D Playground",
    subtitle: lesson ? translate("en", "share.basedOn", { title: lesson.title.en }) : translate("en", "share.readOnly"),
    chips: lesson ? [lesson.title.zh] : ["Three.js", "WebGL", "WebGPU"],
    gradient: lesson ? TRACK_GRADIENT[lesson.category] : HOME_GRADIENT,
  });
}

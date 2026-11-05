import { renderOgCard } from "@/server/og";
import { translate } from "@/core/i18n";
import { HOME_GRADIENT, OG_SIZE } from "@/core/seo";
import { summaries } from "@/server/catalog";

export const alt = "3D Playground";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return renderOgCard({
    eyebrow: translate("en", "home.eyebrow"),
    title: translate("zh", "home.title"),
    subtitle: translate("en", "app.tagline"),
    chips: ["Three.js", "WebGL / GLSL", "WebGPU", translate("en", "home.lessons", { count: summaries().length })],
    gradient: HOME_GRADIENT,
  });
}

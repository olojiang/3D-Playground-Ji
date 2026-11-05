/**
 * Open Graph card renderer (next/og). One look for home, lessons and shared snippets: dark canvas, brand gradient,
 * bilingual title. CJK glyphs come from a Google Fonts subset of exactly the text on the card; if that fetch
 * fails the card still renders (Latin-only text, default font).
 */
import { ImageResponse } from "next/og";
import { OG_SIZE } from "@/core/seo";

/** All subset files Google serves for exactly this text (it may split one request into several unicode ranges). */
async function loadFont(text: string, weight: 600 | 800): Promise<ArrayBuffer[] | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@${weight}&text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(5000) })).text();
    const urls = [...css.matchAll(/src: url\((.+?)\) format\('(opentype|truetype)'\)/g)].map((m) => m[1]);
    if (!urls.length) return null;
    const bufs = await Promise.all(urls.map(async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(5000) }); return r.ok ? r.arrayBuffer() : null; }));
    return bufs.every(Boolean) ? (bufs as ArrayBuffer[]) : null;
  } catch { return null; }
}

const hasCjk = (s: string) => /[\u3000-\u9fff\uff00-\uffef]/.test(s);

export interface OgCard { eyebrow: string; title: string; subtitle?: string; chips?: string[]; gradient: [string, string, string]; footer?: string }

export async function renderOgCard(card: OgCard): Promise<ImageResponse> {
  const footer = card.footer ?? "3d.827722.xyz";
  const allText = [card.eyebrow, card.title, card.subtitle ?? "", ...(card.chips ?? []), footer, "3D Playground ·"].join(" ");
  const [bold, semi] = await Promise.all([loadFont(allText, 800), loadFont(allText, 600)]);
  const fontsOk = !!bold && !!semi;
  // Without the web font only plain ASCII is safe (the default font has no CJK, and a missing glyph aborts the render).
  const show = (s: string | undefined) => {
    if (!s) return "";
    if (fontsOk) return s;
    return hasCjk(s) ? "" : s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7e]/g, "").trim();
  };
  const [a, b, c] = card.gradient;
  const title = show(card.title) || show(card.subtitle) || "3D Playground";
  const subtitle = show(card.title) ? show(card.subtitle) : "";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: "#08080b", color: "#f5f5f7", ...(fontsOk ? { fontFamily: "Noto Sans SC" } : {}), position: "relative" }}>
        <div style={{ position: "absolute", top: -220, right: -160, width: 760, height: 760, borderRadius: 9999, display: "flex", backgroundImage: `radial-gradient(circle at 50% 50%, ${a}cc, ${b}66 38%, transparent 66%)` }} />
        <div style={{ position: "absolute", bottom: -260, left: -200, width: 640, height: 640, borderRadius: 9999, display: "flex", backgroundImage: `radial-gradient(circle at 50% 50%, ${c}55, transparent 66%)` }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, display: "flex", backgroundImage: `linear-gradient(135deg, ${a}, ${b} 55%, ${c})` }} />
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>3D Playground</div>
          {show(card.eyebrow) && <div style={{ display: "flex", marginLeft: 8, fontSize: 24, fontWeight: 600, color: "#a1a1aa" }}>{`· ${show(card.eyebrow)}`}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1000 }}>
          <div style={{ display: "flex", fontSize: title.length > 18 ? 64 : 80, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5 }}>{title}</div>
          {subtitle && <div style={{ display: "flex", fontSize: 34, fontWeight: 600, color: "#c4c4cc", lineHeight: 1.25 }}>{subtitle}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {(card.chips ?? []).map(show).filter(Boolean).map((chip) => (
              <div key={chip} style={{ display: "flex", padding: "10px 20px", borderRadius: 999, fontSize: 24, fontWeight: 600, border: "1.5px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)" }}>{chip}</div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: "#a1a1aa" }}>{show(footer)}</div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, display: "flex", backgroundImage: `linear-gradient(90deg, ${a}, ${b}, ${c})` }} />
      </div>
    ),
    {
      ...OG_SIZE,
      ...(fontsOk ? { fonts: [
        ...bold!.map((data) => ({ name: "Noto Sans SC", data, weight: 800 as const, style: "normal" as const })),
        ...semi!.map((data) => ({ name: "Noto Sans SC", data, weight: 600 as const, style: "normal" as const })),
      ] } : {}),
    },
  );
}

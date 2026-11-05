import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import { renderOgCard } from "@/server/og";
import { lessonOgModel, OG_SIZE } from "@/core/seo";
import { allExamples } from "@/server/catalog";

const PNG = [0x89, 0x50, 0x4e, 0x47];
afterEach(() => vi.unstubAllGlobals());

describe("OG card renderer", () => {
  it("still renders (ASCII only) when the CJK web font cannot be fetched — regression: build crashed on a lesson card", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const e = allExamples().find((x) => x.slug === "shader-debugging") ?? allExamples()[0];
    const m = lessonOgModel(e);
    const res = await renderOgCard({ eyebrow: m.track.en, title: m.title.zh, subtitle: m.title.en, chips: [m.track.zh, `${m.difficulty.zh} · ${m.difficulty.en}`], gradient: m.gradient });
    const buf = new Uint8Array(await res.arrayBuffer());
    expect([...buf.slice(0, 4)]).toEqual(PNG);
    expect(res.headers.get("content-type")).toBe("image/png");
  });
  it.runIf(process.env.OG_NET === "1")("renders the bilingual card with the web font (manual visual check)", async () => {
    const e = allExamples().find((x) => x.category === "webgl")!;
    const m = lessonOgModel(e);
    const res = await renderOgCard({ eyebrow: m.track.en, title: m.title.zh, subtitle: m.title.en, chips: [m.track.zh, `${m.difficulty.zh} · ${m.difficulty.en}`], gradient: m.gradient });
    fs.writeFileSync(process.env.OG_OUT || "og-lesson.png", new Uint8Array(await res.arrayBuffer()));
    expect(OG_SIZE.width).toBe(1200);
  });
});

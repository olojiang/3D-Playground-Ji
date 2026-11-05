import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import raw from "@/generated/examples.json";
import { CATEGORIES } from "@/core/examples";

type Raw = { category: string; slug: string; order: number; requires: string; code: string };
const all = raw as Raw[];
const root = path.resolve(import.meta.dirname, "../..");
const count = (c: string) => all.filter((e) => e.category === c).length;
const find = (id: string) => all.find((e) => `${e.category}/${e.slug}` === id);

describe("round-2 lessons", () => {
  it.each([
    ["three/gltf-skeletal-animation", "webgl"],
    ["webgl/shadow-mapping", "webgl2"],
    ["webgl/deferred-rendering", "webgl2"],
    ["gpu/webgpu-ray-tracing", "webgpu"],
  ])("%s exists and requires %s", (id, requires) => {
    const e = find(id);
    expect(e, id).toBeTruthy();
    expect(e!.requires).toBe(requires);
  });

  it("are placed in the suggested order", () => {
    const after = (a: string, b: string) => expect(find(b)!.order, `${b} right after ${a}`).toBe(find(a)!.order + 1);
    after("three/animation", "three/gltf-skeletal-animation");
    after("webgl/lighting-glsl", "webgl/shadow-mapping");
    after("webgl/shadow-mapping", "webgl/deferred-rendering");
    after("gpu/image-compute", "gpu/webgpu-ray-tracing");
  });

  it("the skinned model ships locally with a CC0 credit", () => {
    expect(fs.existsSync(path.join(root, "public/models/RobotExpressive.glb"))).toBe(true);
    expect(fs.readFileSync(path.join(root, "public/models/README.md"), "utf8")).toMatch(/CC0/);
    expect(find("three/gltf-skeletal-animation")!.code).toMatch(/\/models\/RobotExpressive\.glb/);
  });

  it("deferred rendering handles a missing EXT_color_buffer_float", () => {
    expect(find("webgl/deferred-rendering")!.code).toMatch(/EXT_color_buffer_float/);
  });

  it("the WebGPU ray tracer avoids global_invocation_id (crashes SwiftShader)", () => {
    expect(find("gpu/webgpu-ray-tracing")!.code).not.toMatch(/global_invocation_id/);
  });
});

describe("lesson counts stay in sync with the catalog", () => {
  const total = all.length;
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  it("totals 40 lessons (14 Three.js · 14 WebGL · 12 GPU)", () => {
    expect([count("three"), count("webgl"), count("gpu")]).toEqual([14, 14, 12]);
    expect(total).toBe(40);
  });
  it("README states the real totals in both languages", () => {
    expect(readme).toContain(`${total} 节可实时运行`);
    expect(readme).toContain(`${total} runnable lessons`);
    expect(readme).toContain(`${total} 节课全部`);
    expect(readme).not.toMatch(/\b36 (节|runnable)/);
    for (const c of CATEGORIES) {
      expect(readme).toMatch(new RegExp(`（${count(c)}）`));
      expect(readme).toMatch(new RegExp(`\\(${count(c)}\\)\\*\\*`));
    }
  });
  it("model assets are CORS-enabled for the sandbox iframe", () => {
    expect(fs.readFileSync(path.join(root, "next.config.mjs"), "utf8")).toMatch(/\/models\/:path\*/);
  });
});

import { describe, it, expect } from "vitest";
import { tokenize, normalizeLang } from "@/core/highlight";

const kinds = (code: string, lang: string) => tokenize(code, lang).filter((t) => t.v.trim()).map((t) => `${t.k}:${t.v.trim()}`);

describe("highlighter", () => {
  it("highlights glsl types, keywords, functions, numbers and directives", () => {
    expect(kinds("#version 300 es\nuniform vec3 c; // tint\nvoid main(){ x = mix(a, b, 0.5); }", "glsl")).toEqual(expect.arrayContaining([
      "kw:#version 300 es", "kw:uniform", "type:vec3", "com:// tint", "kw:void", "fn:main", "fn:mix", "num:0.5",
    ]));
  });
  it("highlights wgsl attributes and typed literals", () => {
    expect(kinds("@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) { let x = 1u; }", "wgsl")).toEqual(expect.arrayContaining([
      "kw:@compute", "kw:@workgroup_size", "kw:fn", "type:vec3u", "kw:let", "num:1u",
    ]));
  });
  it("highlights js strings without eating code after them", () => {
    const k = kinds('const a = "x\\"y"; new THREE.Mesh()', "js");
    expect(k).toEqual(expect.arrayContaining(['kw:const', 'str:"x\\"y"', "kw:new", "type:THREE", "fn:Mesh"]));
  });
  it("round-trips the source exactly", () => {
    const src = "fn f() -> f32 { return 1.0; } /* c */ @group(0)";
    expect(tokenize(src, "wgsl").map((t) => t.v).join("")).toBe(src);
  });
  it("falls back to plain text", () => {
    expect(normalizeLang("python")).toBe("text");
    expect(tokenize("a b", "text")).toEqual([{ k: "plain", v: "a b" }]);
  });
});

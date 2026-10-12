/**
 * Tiny syntax highlighter for read-only code blocks in articles (js/ts, glsl, wgsl).
 * Produces tokens; the React side maps token kinds to theme colours. The live editor uses CodeMirror instead.
 */
export type TokenKind = "kw" | "type" | "fn" | "num" | "str" | "com" | "punct" | "plain";
export interface Token { k: TokenKind; v: string }

const JS_KW = "import export from const let var function return if else for while do break continue new class extends async await of in typeof instanceof switch case default try catch finally throw this null undefined true false yield static get set";
const GLSL_KW = "uniform attribute varying in out inout const if else for while do break continue return discard precision highp mediump lowp layout struct void true false flat smooth centroid invariant";
const GLSL_TYPE = "float int uint bool vec2 vec3 vec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 bvec2 bvec3 bvec4 mat2 mat3 mat4 mat2x2 mat3x3 mat4x4 sampler2D sampler3D samplerCube sampler2DArray";
const WGSL_KW = "fn let var const struct return if else for loop while break continue switch case default discard override enable true false alias";
const WGSL_TYPE = "f32 f16 i32 u32 bool vec2 vec3 vec4 vec2f vec3f vec4f vec2u vec3u vec4u vec2i vec3i vec4i mat2x2 mat3x3 mat4x4 mat4x4f mat3x3f array atomic ptr sampler texture_2d texture_storage_2d texture_3d";

const set = (s: string) => new Set(s.split(" "));
const LANGS: Record<string, { kw: Set<string>; type: Set<string>; attr?: boolean; hashDirective?: boolean }> = {
  js: { kw: set(JS_KW), type: set("THREE Math Float32Array Uint32Array Uint8Array Int32Array Array Object Promise Map Set GPUBufferUsage GPUShaderStage GPUTextureUsage GPUMapMode") },
  glsl: { kw: set(GLSL_KW), type: set(GLSL_TYPE), hashDirective: true },
  wgsl: { kw: set(WGSL_KW), type: set(WGSL_TYPE), attr: true },
};
const ALIAS: Record<string, string> = { javascript: "js", ts: "js", typescript: "js", jsx: "js", tsx: "js", frag: "glsl", vert: "glsl", glsl: "glsl", wgsl: "wgsl", js: "js" };

export function normalizeLang(lang: string): "js" | "glsl" | "wgsl" | "text" {
  return (ALIAS[lang.toLowerCase()] as "js" | "glsl" | "wgsl") ?? "text";
}

export function tokenize(code: string, lang: string): Token[] {
  const L = LANGS[normalizeLang(lang)];
  if (!L) return [{ k: "plain", v: code }];
  const out: Token[] = [];
  const push = (k: TokenKind, v: string) => {
    const last = out[out.length - 1];
    if (last && last.k === k && (k === "plain" || k === "punct")) last.v += v; else out.push({ k, v });
  };
  let i = 0;
  while (i < code.length) {
    const rest = code.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^\/\/[^\n]*/.exec(rest)) || (m = /^\/\*[\s\S]*?(\*\/|$)/.exec(rest))) { push("com", m[0]); i += m[0].length; continue; }
    if (L.hashDirective && (m = /^#[a-z]+[^\n]*/.exec(rest)) && (i === 0 || code[i - 1] === "\n")) { push("kw", m[0]); i += m[0].length; continue; }
    if (normalizeLang(lang) === "js" && (m = /^(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1?/.exec(rest))) { push("str", m[0]); i += m[0].length; continue; }
    if (L.attr && (m = /^@[a-z_]+/.exec(rest))) { push("kw", m[0]); i += m[0].length; continue; }
    if ((m = /^(0x[0-9a-fA-F]+|\d+\.?\d*(e[+-]?\d+)?|\.\d+)[uifh]?/.exec(rest))) { push("num", m[0]); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) {
      const w = m[0];
      const next = code.slice(i + w.length).match(/^\s*(\(|<)/);
      push(L.kw.has(w) ? "kw" : L.type.has(w) ? "type" : next && next[1] === "(" ? "fn" : "plain", w);
      i += w.length;
      continue;
    }
    if ((m = /^[{}()[\];,.<>=+\-*/%!&|^~?:]+/.exec(rest))) { push("punct", m[0]); i += m[0].length; continue; }
    push("plain", code[i]);
    i++;
  }
  return out;
}

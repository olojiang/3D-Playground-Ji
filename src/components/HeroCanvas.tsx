"use client";
/** Home hero: a raymarched glassy torus-knot-ish blob in a raw WebGL2 fragment shader, tinted by the theme accent. */
import { useEffect, useRef } from "react";

const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
const FS = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; uniform vec3 A; uniform vec3 B; uniform vec3 BG; uniform vec2 M;
out vec4 o;
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz)-t.x, p.y); return length(q)-t.y; }
float map(vec3 p){
  p.xz *= rot(T*.25 + M.x*.6); p.xy *= rot(T*.18 + M.y*.4);
  float d = sdTorus(p, vec2(1.05, .36));
  d += .085*sin(4.*p.x + T)*sin(4.*p.y + T*1.3)*sin(4.*p.z + T*.7);
  float s = length(p) - .55;
  float k = .45; float h = clamp(.5 + .5*(s-d)/k, 0., 1.);
  return mix(s, d, h) - k*h*(1.-h);
}
vec3 nrm(vec3 p){ vec2 e = vec2(.0015, 0.); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*R) / R.y;
  vec3 ro = vec3(0., 0., 4.9), rd = normalize(vec3(uv, -1.55));
  float t = 0., d; bool hit = false;
  for (int i = 0; i < 90; i++){ d = map(ro + rd*t); if (d < .001){ hit = true; break; } t += d*.85; if (t > 10.) break; }
  float glow = exp(-2.2*length(uv - vec2(.0, .02)));
  vec3 col = BG + (A*.10 + B*.06) * glow;
  if (hit){
    vec3 p = ro + rd*t, n = nrm(p), v = -rd;
    float fres = pow(1. - max(dot(n, v), 0.), 3.);
    vec3 l = normalize(vec3(.6, .8, .5));
    float dif = max(dot(n, l), 0.);
    float spec = pow(max(dot(reflect(-l, n), v), 0.), 48.);
    vec3 irid = .5 + .5*cos(6.2831*(vec3(0., .33, .67) + dot(n, v)*1.2 + T*.05));
    vec3 base = mix(A, B, .5 + .5*n.y);
    col = base*(.18 + .55*dif) + mix(base, irid, .35)*fres*1.3 + vec3(spec);
    col = mix(col, BG, smoothstep(4., 8., t));
  }
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))*43758.5453) - .5) / 255.;
  o = vec4(col, 1.);
}`;

function cssColor(name: string): [number, number, number] {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseInt(v.replace("#", ""), 16);
  return Number.isFinite(n) ? [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] : [0.4, 0.5, 1];
}

export function HeroCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uR = u("R"), uT = u("T"), uA = u("A"), uB = u("B"), uBG = u("BG"), uM = u("M");
    let colors = { a: cssColor("--accent"), b: cssColor("--accent-2"), bg: cssColor("--surface") };
    const mo = new MutationObserver(() => { colors = { a: cssColor("--accent"), b: cssColor("--accent-2"), bg: cssColor("--surface") }; });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); mouse.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; mouse.ty = ((e.clientY - r.top) / r.height - 0.5) * 2; };
    window.addEventListener("pointermove", onMove);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";
    let visible = true;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
    io.observe(canvas);
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const dpr = Math.min(devicePixelRatio, 1.5);
      const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04;
      gl.uniform2f(uR, w, h);
      gl.uniform1f(uT, reduced ? 6 : (now - start) / 1000);
      gl.uniform3fv(uA, colors.a); gl.uniform3fv(uB, colors.b); gl.uniform3fv(uBG, colors.bg);
      gl.uniform2f(uM, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); mo.disconnect(); io.disconnect(); window.removeEventListener("pointermove", onMove); gl.getExtension("WEBGL_lose_context")?.loseContext(); };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

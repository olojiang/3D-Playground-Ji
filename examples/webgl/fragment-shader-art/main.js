// Fragment shader art — one full-screen triangle, all the drawing happens per pixel.
// UV coordinates · signed distance functions (SDF) · smoothstep anti-aliasing · cosine palettes
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const gl = canvas.getContext("webgl2", { antialias: false });
if (!gl) {
  PG.status("WebGL2 is not available in this browser · 当前浏览器不支持 WebGL2");
  throw new Error("WebGL2 unavailable");
}

const vertexSrc = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); // (0,0) (2,0) (0,2)
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);            // covers the whole screen
}`;

const fragmentSrc = /* glsl */ `#version 300 es
precision highp float;
uniform vec2  iResolution;   // Shadertoy-style names
uniform float iTime;
uniform int   uCount;
uniform float uBlur;         // anti-aliasing width, in pixels
uniform int   uPalette;
uniform bool  uShowField;
out vec4 fragColor;

// --- Signed distance functions: < 0 inside, 0 on the edge, > 0 outside ---------
float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdBox(vec2 p, vec2 b, float r) {          // rounded box, half size b, corner radius r
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// --- Inigo Quilez's cosine palette: color(t) = a + b·cos(2π(c·t + d)) ---------
vec3 palette(float t) {
  vec3 a = vec3(0.5), b = vec3(0.5), c = vec3(1.0), d;
  if (uPalette == 0) d = vec3(0.00, 0.33, 0.67);       // rainbow
  else if (uPalette == 1) d = vec3(0.00, 0.10, 0.20);  // sunset
  else { c = vec3(1.0, 1.0, 0.5); d = vec3(0.80, 0.90, 0.30); } // aurora
  return a + b * cos(6.2831853 * (c * t + d));
}

void main() {
  // uv: 0..1 across the screen. p: centered, y from -1 to 1, aspect-correct.
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec2 p = (2.0 * gl_FragCoord.xy - iResolution) / iResolution.y;
  float px = 2.0 / iResolution.y;             // one pixel, in p units

  // Background: soft vertical gradient with a vignette.
  vec3 col = mix(vec3(0.03, 0.03, 0.06), vec3(0.08, 0.06, 0.14), uv.y);
  col *= 1.0 - 0.35 * dot(uv - 0.5, uv - 0.5) * 2.0;

  // Union of shapes = min of their distances.
  float d = sdBox(rot(iTime * 0.4) * p, vec2(0.28), 0.08);
  float id = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uCount) break;
    float a = float(i) / float(uCount) * 6.2831853 + iTime * 0.5;
    float r = 0.62 + 0.08 * sin(iTime * 2.0 + float(i));
    float c = sdCircle(p - r * vec2(cos(a), sin(a)), 0.09 + 0.03 * sin(iTime + float(i) * 1.7));
    if (c < d) { d = c; id = float(i + 1) / float(uCount); }
  }

  if (uShowField) {
    // Visualize the distance itself: bands every 0.05 units, orange outside, blue inside.
    vec3 f = d > 0.0 ? vec3(0.95, 0.6, 0.3) : vec3(0.35, 0.6, 0.95);
    f *= 0.6 + 0.4 * cos(d * 120.0);
    f *= 1.0 - exp(-8.0 * abs(d));
    col = mix(f, vec3(1.0), 1.0 - smoothstep(0.0, px * 2.0, abs(d)));
  } else {
    // smoothstep turns the hard edge into a ~uBlur pixel ramp → anti-aliasing.
    float fill = 1.0 - smoothstep(-uBlur * px, uBlur * px, d);
    vec3 shape = palette(id + iTime * 0.1 + length(p) * 0.3);
    col += shape * 0.25 * exp(-12.0 * max(d, 0.0));       // glow outside the shapes
    col = mix(col, shape, fill);
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, px * 1.5, abs(d + 0.012))) * 0.6); // inner rim
  }
  fragColor = vec4(pow(col, vec3(0.95)), 1.0);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error("shader compile error:\n" + gl.getShaderInfoLog(s));
  return s;
}
const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSrc));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSrc));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.error("program link error:\n" + gl.getProgramInfoLog(program));
const loc = Object.fromEntries(["iResolution", "iTime", "uCount", "uBlur", "uPalette", "uShowField"].map((n) => [n, gl.getUniformLocation(program, n)]));
const vao = gl.createVertexArray();

const params = { count: 9, blur: 1.0, palette: "rainbow", showField: false, speed: 1 };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "count", 1, 16, 1).name("circles");
gui.add(params, "blur", 0, 12, 0.1).name("smoothstep width (px)");
gui.add(params, "palette", ["rainbow", "sunset", "aurora"]);
gui.add(params, "showField").name("show distance field");
gui.add(params, "speed", 0, 3, 0.01);

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
}
new ResizeObserver(resize).observe(canvas);
resize();

let t = 0, last = 0;
function frame(now) {
  t += ((now - last) / 1000) * params.speed; last = now;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(program);
  gl.uniform2f(loc.iResolution, canvas.width, canvas.height);
  gl.uniform1f(loc.iTime, t);
  gl.uniform1i(loc.uCount, params.count);
  gl.uniform1f(loc.uBlur, params.blur);
  gl.uniform1i(loc.uPalette, ["rainbow", "sunset", "aurora"].indexOf(params.palette));
  gl.uniform1i(loc.uShowField, params.showField ? 1 : 0);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);   // 3 vertices, millions of fragments
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

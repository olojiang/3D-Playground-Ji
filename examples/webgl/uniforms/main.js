// Uniforms — values the CPU hands to every vertex and fragment of a draw call.
// u_time animates, u_resolution keeps proportions, u_mouse lets you steer the glow.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const gl = canvas.getContext("webgl2", { antialias: true });
if (!gl) {
  PG.status("WebGL2 is not available in this browser · 当前浏览器不支持 WebGL2");
  throw new Error("WebGL2 unavailable");
}

// Pass 1 — background: a full-screen triangle whose glow follows the mouse.
const bgVertex = /* glsl */ `#version 300 es
void main() {
  // gl_VertexID 0,1,2 → a triangle that covers the whole screen; no buffer needed.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const bgFragment = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 u_resolution;   // canvas size in pixels
uniform vec2 u_mouse;        // mouse in pixels (origin bottom-left)
uniform vec3 u_color;
out vec4 outColor;
void main() {
  float d = distance(gl_FragCoord.xy, u_mouse) / u_resolution.y;
  vec3 base = vec3(0.043, 0.043, 0.07);
  outColor = vec4(base + u_color * 0.35 * exp(-d * 4.0), 1.0);
}`;

// Pass 2 — the flower: vertices generated from gl_VertexID, shaped by uniforms.
const flowerVertex = /* glsl */ `#version 300 es
uniform float u_time;        // seconds since start
uniform vec2  u_resolution;
uniform float u_petals;
uniform float u_size;
uniform int   u_segments;
out float vEdge;             // 0 at the center, 1 at the rim
void main() {
  int tri = gl_VertexID / 3, corner = gl_VertexID % 3;
  float a = (float(tri) + float(corner == 2)) / float(u_segments) * 6.2831853 + u_time * 0.3;
  float r = u_size * (0.75 + 0.25 * sin(u_petals * a + u_time * 2.0)); // petals breathe over time
  vec2 p = corner == 0 ? vec2(0.0) : r * vec2(cos(a), sin(a));
  vEdge = corner == 0 ? 0.0 : 1.0;
  p.x *= u_resolution.y / u_resolution.x;  // undo the canvas aspect so circles stay round
  gl_Position = vec4(p, 0.0, 1.0);
}`;
const flowerFragment = /* glsl */ `#version 300 es
precision highp float;
uniform vec3 u_color;
uniform float u_time;
in float vEdge;
out vec4 outColor;
void main() {
  vec3 core = vec3(1.0, 0.96, 0.85);
  vec3 c = mix(core, u_color, smoothstep(0.0, 0.9, vEdge));
  c *= 0.85 + 0.15 * sin(vEdge * 18.0 - u_time * 3.0);   // ripples travel outwards
  outColor = vec4(c, 1.0);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error("shader compile error:\n" + gl.getShaderInfoLog(s));
  return s;
}
function link(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error("program link error:\n" + gl.getProgramInfoLog(p));
  return p;
}

// Look up every uniform location ONCE after linking; setting them is cheap afterwards.
function uniforms(program) {
  const out = {};
  const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(program, i).name;
    out[name] = gl.getUniformLocation(program, name);
  }
  return out;
}
const bg = link(bgVertex, bgFragment), bgU = uniforms(bg);
const flower = link(flowerVertex, flowerFragment), flowerU = uniforms(flower);
console.log("flower uniforms:", Object.keys(flowerU).join(", "));

const vao = gl.createVertexArray(); // WebGL2 needs a VAO bound even with no attributes

const params = { speed: 1, petals: 6, size: 0.55, color: "#7c5cff" };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "speed", 0, 3, 0.01).name("u_time speed");
gui.add(params, "petals", 0, 12, 1).name("u_petals");
gui.add(params, "size", 0.2, 0.9, 0.01).name("u_size");
gui.addColor(params, "color").name("u_color");

const mouse = [0, 0];
canvas.addEventListener("pointermove", (e) => {
  const r = canvas.getBoundingClientRect(), dpr = canvas.width / r.width;
  mouse[0] = (e.clientX - r.left) * dpr;
  mouse[1] = (r.bottom - e.clientY) * dpr;  // flip Y: GL's origin is bottom-left
});

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  mouse[0] = canvas.width * 0.5; mouse[1] = canvas.height * 0.5;
}
new ResizeObserver(resize).observe(canvas);
resize();

const SEGMENTS = 240;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
let t = 0, last = 0;
function frame(now) {
  t += ((now - last) / 1000) * params.speed; last = now;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.bindVertexArray(vao);

  gl.useProgram(bg);                        // uniforms belong to the CURRENT program
  gl.uniform2f(bgU.u_resolution, canvas.width, canvas.height);
  gl.uniform2fv(bgU.u_mouse, mouse);
  gl.uniform3fv(bgU.u_color, hex(params.color));
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.useProgram(flower);
  gl.uniform1f(flowerU.u_time, t);
  gl.uniform2f(flowerU.u_resolution, canvas.width, canvas.height);
  gl.uniform1f(flowerU.u_petals, params.petals);
  gl.uniform1f(flowerU.u_size, params.size);
  gl.uniform1i(flowerU.u_segments, SEGMENTS);
  gl.uniform3fv(flowerU.u_color, hex(params.color));
  gl.drawArrays(gl.TRIANGLES, 0, SEGMENTS * 3);

  PG.status(`u_time ${t.toFixed(2)} · u_mouse ${mouse.map(Math.round).join(", ")}`);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

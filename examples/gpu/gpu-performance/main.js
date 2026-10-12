// GPU performance — what actually costs GPU time, with one knob per bottleneck.
//   overdraw layers  → fill rate: every layer shades every pixel again (additive blending)
//   ALU iterations   → fragment shader complexity: math per pixel
//   texture taps     → memory bandwidth: texture reads per pixel (and how scattered they are)
//   resolution scale → how many pixels there are at all
//   vertices         → vertex shader work for the torus knot
// Frame time comes from EXT_disjoint_timer_query_webgl2 (real GPU time) when available, else rAF delta.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const gl = canvas.getContext("webgl2", { antialias: false });
if (!gl) throw new Error("WebGL2 not available");

const params = { layers: 6, iterations: 12, taps: 2, spread: 1, scale: 1, vertices: 196608, showLayers: true, showMesh: true };

// ---------- shaders ----------
function program(vs, fs) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
  const u = {};
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
    const name = gl.getActiveUniform(p, i).name;
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

// Full-screen triangle: one layer = every pixel of the render target shaded once more.
const LAYER_VS = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0; gl_Position = vec4(p, 0.0, 1.0); }`;

const LAYER_FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uLayer, uLayers, uSpread, uGain;
uniform int uIter, uTaps;
uniform sampler2D uNoise;
out vec4 outColor;
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float k = uLayer / max(uLayers, 1.0);
  float a = uTime * 0.07 * (mod(uLayer, 2.0) * 2.0 - 1.0) + uLayer * 0.9;
  p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p * (0.9 + 0.12 * uLayer);
  // ALU cost: a domain-warp loop. More iterations = more math per pixel, wobblier rings.
  vec2 q = p;
  for (int i = 0; i < uIter; i++) {
    float fi = float(i);
    q += 0.22 / (1.0 + fi * 0.35) * sin(q.yx * (1.6 + fi * 0.21) + vec2(uTime * 0.35, fi * 1.7 + uLayer));
  }
  // Bandwidth cost: uTaps texture reads. uSpread scatters them → poor cache locality.
  float tex = 0.0;
  for (int j = 0; j < uTaps; j++) {
    vec2 uv = q * 0.35 * uSpread + vec2(float(j) * 0.1371, float(j) * 0.0719) * uSpread;
    tex += texture(uNoise, uv).r;
  }
  tex = uTaps > 0 ? tex / float(uTaps) : 0.5;
  float r = length(q);
  float d = abs(fract(r * 2.2 - uTime * 0.12 + k * 0.5) - 0.5);
  float ring = smoothstep(0.09, 0.0, d) + 0.25 * smoothstep(0.35, 0.0, d);
  vec3 c = pal(k * 0.75 + r * 0.15 + 0.55) * ring * (0.45 + tex) * smoothstep(2.2, 0.3, r);
  outColor = vec4(c * uGain, 1.0);   // additive blending: each layer adds its light
}`;

// Torus knot generated purely from gl_VertexID: changing the vertex count needs no new buffers.
const MESH_VS = `#version 300 es
uniform int uSegU, uSegV;
uniform float uTime, uAspect;
out vec3 vN;
out float vU;
vec3 knot(float u) { // (2,3) torus knot centre line
  float r = 0.5 + 0.28 * cos(3.0 * u);
  return vec3(r * cos(2.0 * u), r * sin(2.0 * u), 0.32 * sin(3.0 * u));
}
void main() {
  int quad = gl_VertexID / 6, corner = gl_VertexID - quad * 6;   // 6 vertices = 2 triangles = 1 quad
  int iv = int(floor((float(quad) + 0.5) / float(uSegU))), iu = quad - iv * uSegU; // float math: avoids integer division by a uniform
  float u = float(iu + ((corner == 1 || corner == 4 || corner == 5) ? 1 : 0)) / float(uSegU) * 6.28318;
  float v = float(iv + ((corner == 2 || corner == 3 || corner == 5) ? 1 : 0)) / float(uSegV) * 6.28318;
  vec3 c = knot(u), t = normalize(knot(u + 0.001) - c);          // tube frame along the curve
  vec3 n1 = normalize(cross(t, vec3(0.0, 0.0, 1.0))), n2 = cross(t, n1);
  vec3 n = cos(v) * n1 + sin(v) * n2;
  vec3 p = c + n * 0.1;
  float a = uTime * 0.4;                                         // spin around Y and X
  mat3 ry = mat3(cos(a), 0.0, -sin(a), 0.0, 1.0, 0.0, sin(a), 0.0, cos(a));
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(0.6), sin(0.6), 0.0, -sin(0.6), cos(0.6));
  p = rx * ry * p; vN = rx * ry * n; vU = u;
  gl_Position = vec4(p.x / uAspect * 0.95, p.y * 0.95, p.z * 0.5, 1.0);
}`;

const MESH_FS = `#version 300 es
precision highp float;
in vec3 vN;
in float vU;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  float diff = max(dot(n, normalize(vec3(0.4, 0.7, -0.6))), 0.0);
  float rim = pow(1.0 - abs(n.z), 3.0);
  vec3 base = 0.5 + 0.5 * cos(6.28318 * (vU / 6.28318 + vec3(0.6, 0.75, 0.9)));
  outColor = vec4(base * (0.15 + 0.85 * diff) + rim * vec3(0.5, 0.7, 1.0), 1.0);
}`;

const layerProg = program(LAYER_VS, LAYER_FS);
const meshProg = program(MESH_VS, MESH_FS);
gl.bindVertexArray(gl.createVertexArray()); // no attributes: everything comes from gl_VertexID

// ---------- a 1024² noise texture to read from (4 MB, no mipmaps → scattered reads really miss the cache) ----------
const NOISE = 1024;
const noiseData = new Uint8Array(NOISE * NOISE * 4);
const coarse = Float32Array.from({ length: 64 * 64 }, () => Math.random()); // smooth blobs + fine grain
const cAt = (x, y) => coarse[(y & 63) * 64 + (x & 63)];
for (let y = 0; y < NOISE; y++) for (let x = 0; x < NOISE; x++) {
  const fx = x / 16, fy = y / 16, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const top = cAt(ix, iy) * (1 - tx) + cAt(ix + 1, iy) * tx, bot = cAt(ix, iy + 1) * (1 - tx) + cAt(ix + 1, iy + 1) * tx;
  const v = (top * (1 - ty) + bot * ty) * 0.85 + Math.random() * 0.15;
  noiseData.fill(v * 255, (y * NOISE + x) * 4, (y * NOISE + x) * 4 + 4);
}
const noiseTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, noiseTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, NOISE, NOISE, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseData);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

// ---------- offscreen render target at "resolution scale", upscaled to the canvas with a blit ----------
const fbo = gl.createFramebuffer(), colorRB = gl.createRenderbuffer(), depthRB = gl.createRenderbuffer();
let rtW = 0, rtH = 0;
function sizeTarget() {
  const w = Math.max(1, Math.floor(canvas.width * params.scale)), h = Math.max(1, Math.floor(canvas.height * params.scale));
  if (w === rtW && h === rtH) return;
  rtW = w; rtH = h;
  gl.bindRenderbuffer(gl.RENDERBUFFER, colorRB);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthRB);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorRB);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRB);
}

// ---------- GPU timer queries (Chrome desktop usually exposes this; many browsers hide it) ----------
const timerExt = gl.getExtension("EXT_disjoint_timer_query_webgl2");
const pending = [];
let gpuMs = null, frameMs = 16.7, lastT = performance.now();
function pollTimers() {
  while (pending.length) {
    const q = pending[0];
    if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;  // results arrive a few frames later
    const disjoint = gl.getParameter(timerExt.GPU_DISJOINT_EXT);      // e.g. a power-state change: discard
    const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
    if (!disjoint) gpuMs = gpuMs === null ? ns / 1e6 : gpuMs + (ns / 1e6 - gpuMs) * 0.1;
    gl.deleteQuery(pending.shift());
  }
}

// ---------- GUI ----------
const gui = new GUI({ title: "Parameters" });
gui.add(params, "layers", 0, 40, 1).name("overdraw layers");
gui.add(params, "iterations", 0, 200, 1).name("ALU iterations");
gui.add(params, "taps", 0, 32, 1).name("texture taps");
gui.add(params, "spread", 1, 64, 1).name("texture spread");
gui.add(params, "scale", 0.25, 2, 0.05).name("resolution scale");
gui.add(params, "vertices", { "6k": 6144, "49k": 49152, "197k": 196608, "786k": 786432, "3.1M": 3145728 });
gui.add(params, "showLayers").name("draw layers");
gui.add(params, "showMesh").name("draw mesh");

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.max(2, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.floor(canvas.clientHeight * dpr));
}
new ResizeObserver(resize).observe(canvas);
resize();

let statusT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  frameMs += (now - lastT - frameMs) * 0.1;
  lastT = now;
  const time = now / 1000;
  sizeTarget();
  if (timerExt) pollTimers();
  let query = null;
  if (timerExt && pending.length < 4) {
    query = gl.createQuery();
    gl.beginQuery(timerExt.TIME_ELAPSED_EXT, query); // measures GPU time of everything until endQuery
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, rtW, rtH);
  gl.clearColor(0.043, 0.043, 0.07, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 1. Overdraw: N full-screen layers, additively blended → N × pixels fragment invocations.
  const layers = params.showLayers ? params.layers : 0;
  if (layers > 0) {
    const { p, u } = layerProg;
    gl.useProgram(p);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform2f(u.uRes, rtW, rtH);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uLayers, layers);
    gl.uniform1f(u.uSpread, params.spread);
    gl.uniform1f(u.uGain, 1.1 / Math.sqrt(layers));
    gl.uniform1i(u.uIter, params.iterations);
    gl.uniform1i(u.uTaps, params.taps);
    gl.bindTexture(gl.TEXTURE_2D, noiseTex);
    for (let i = 0; i < layers; i++) {
      gl.uniform1f(u.uLayer, i);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
  }

  // 2. Vertex work: a torus knot with params.vertices vertices (opaque, depth-tested).
  const segV = 32, segU = Math.max(8, Math.round(params.vertices / 6 / segV));
  if (params.showMesh) {
    const { p, u } = meshProg;
    gl.useProgram(p);
    gl.enable(gl.DEPTH_TEST);
    gl.uniform1i(u.uSegU, segU);
    gl.uniform1i(u.uSegV, segV);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uAspect, rtW / rtH);
    gl.drawArrays(gl.TRIANGLES, 0, segU * segV * 6);
    gl.disable(gl.DEPTH_TEST);
  }

  // 3. Upscale the render target to the canvas (bilinear). Low scale = fewer pixels, blurrier image.
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  gl.blitFramebuffer(0, 0, rtW, rtH, 0, 0, canvas.width, canvas.height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  if (query) { gl.endQuery(timerExt.TIME_ELAPSED_EXT); pending.push(query); }

  // Work counters: these are what the knobs actually change.
  if (now - statusT > 250) {
    statusT = now;
    const px = rtW * rtH, frags = px * layers;
    const timing = timerExt && gpuMs !== null
      ? `GPU time ${gpuMs.toFixed(2)} ms (timer query) · frame ${frameMs.toFixed(1)} ms`
      : `frame ${frameMs.toFixed(1)} ms (rAF delta — capped by vsync; no timer query here)`;
    PG.status(`${timing}\n` +
      `${rtW}×${rtH} px · ${(frags / 1e6).toFixed(2)} M layer fragments · ${(frags * params.iterations / 1e6).toFixed(0)} M loop steps · ` +
      `${(frags * params.taps / 1e6).toFixed(1)} M texture reads · ${(params.showMesh ? segU * segV * 6 : 0).toLocaleString()} vertices`);
  }
}
requestAnimationFrame(frame);

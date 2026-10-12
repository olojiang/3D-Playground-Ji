// Framebuffers & post-processing — render the scene into a texture, then filter that texture.
// Pass 1: scene → framebuffer (color texture). Pass 2: full-screen quad → blur, chromatic aberration, vignette.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const gl = canvas.getContext("webgl2", { antialias: false });
if (!gl) {
  PG.status("WebGL2 is not available in this browser · 当前浏览器不支持 WebGL2");
  throw new Error("WebGL2 unavailable");
}

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
  const loc = {};
  for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
    const name = gl.getActiveUniform(p, i).name;
    loc[name] = gl.getUniformLocation(p, name);
  }
  return { p, loc };
}

// ---- Pass 1: the scene — 400 instanced glowing discs orbiting, plus a crisp grid ----
const scene = link(/* glsl */ `#version 300 es
uniform float uTime;
uniform vec2 uResolution;
out vec2 vLocal;
out vec3 vColor;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  // gl_InstanceID: which disc; gl_VertexID: which corner of its quad (two triangles).
  float id = float(gl_InstanceID);
  vec2 corner = vec2[6](vec2(-1,-1), vec2(1,-1), vec2(1,1), vec2(-1,-1), vec2(1,1), vec2(-1,1))[gl_VertexID];
  float radius = 0.15 + 0.85 * hash(id);
  float angle = hash(id * 1.7) * 6.2831 + uTime * (0.15 + 0.4 * hash(id * 3.1)) * (hash(id * 5.3) > 0.5 ? 1.0 : -1.0);
  vec2 center = radius * vec2(cos(angle), sin(angle) * 0.75);
  float size = 0.01 + 0.04 * hash(id * 7.7);
  vLocal = corner;
  vColor = 0.55 + 0.45 * cos(6.2831 * (hash(id * 9.1) * 0.35 + vec3(0.55, 0.65, 0.8)));
  vec2 p = center + corner * size;
  p.x *= uResolution.y / uResolution.x;
  gl_Position = vec4(p, 0.0, 1.0);
}`, /* glsl */ `#version 300 es
precision highp float;
in vec2 vLocal;
in vec3 vColor;
out vec4 outColor;
void main() {
  float d = length(vLocal);
  float a = smoothstep(1.0, 0.0, d);
  outColor = vec4(vColor * (a * a + smoothstep(0.35, 0.2, d)), 1.0); // additive blend adds this
}`);

const fullscreenVS = /* glsl */ `#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// The grid backdrop (drawn into the same framebuffer before the discs).
const grid = link(fullscreenVS, /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uResolution;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec2 p = (vUV - 0.5) * uResolution / uResolution.y * 12.0;
  vec2 g = abs(fract(p) - 0.5) / fwidth(p);       // distance to grid lines, in pixels
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  vec3 c = vec3(0.04, 0.04, 0.07) + line * vec3(0.12, 0.12, 0.2);
  outColor = vec4(c, 1.0);
}`);

// ---- Pass 2: post-process, reading the scene texture ---------------------------
const post = link(fullscreenVS, /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uTexel;          // 1 / texture size
uniform float uBlur;          // blur radius in pixels
uniform float uAberration;    // RGB split strength
uniform float uVignette;
uniform float uSplit;         // x position of the before/after line
in vec2 vUV;
out vec4 outColor;

vec3 blurred(vec2 uv) {
  // 5×5 Gaussian-ish kernel, spaced by the blur radius.
  vec3 sum = vec3(0.0); float wsum = 0.0;
  for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) {
    float w = exp(-float(x * x + y * y) / 4.0);
    sum += texture(uScene, uv + vec2(x, y) * uTexel * uBlur * 0.5).rgb * w;
    wsum += w;
  }
  return sum / wsum;
}
void main() {
  if (vUV.x < uSplit) { outColor = texture(uScene, vUV); return; } // untouched "before"
  vec2 dir = vUV - 0.5;
  vec2 off = dir * uAberration * 0.02;                // more split near the edges
  vec3 c = vec3(blurred(vUV + off).r, blurred(vUV).g, blurred(vUV - off).b);
  c *= 1.0 - uVignette * smoothstep(0.2, 0.8, length(dir * vec2(1.0, 0.8)));
  outColor = vec4(c, 1.0);
}`);

// ---- The framebuffer: a texture to draw into ------------------------------------
const sceneTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, sceneTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
const fbo = gl.createFramebuffer();

function allocateTarget(w, h) {
  gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); // empty storage
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) console.error("framebuffer incomplete: 0x" + status.toString(16));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

const vao = gl.createVertexArray();
const params = { blur: 2, aberration: 1.2, vignette: 0.6, split: 0, discs: 400 };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "blur", 0, 12, 0.1).name("blur radius (px)");
gui.add(params, "aberration", 0, 4, 0.01).name("chromatic aberration");
gui.add(params, "vignette", 0, 1, 0.01);
gui.add(params, "split", 0, 1, 0.01).name("before | after");
gui.add(params, "discs", 10, 2000, 10).name("instances");

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  allocateTarget(canvas.width, canvas.height);  // the target must match the new size
}
new ResizeObserver(resize).observe(canvas);
resize();

function frame(now) {
  const w = canvas.width, h = canvas.height;
  gl.bindVertexArray(vao);
  gl.viewport(0, 0, w, h);

  // Pass 1 → offscreen texture.
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.useProgram(grid.p);
  gl.uniform2f(grid.loc.uResolution, w, h);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);                  // additive: overlapping glows brighten
  gl.useProgram(scene.p);
  gl.uniform1f(scene.loc.uTime, now / 1000);
  gl.uniform2f(scene.loc.uResolution, w, h);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, params.discs);
  gl.disable(gl.BLEND);

  // Pass 2 → the screen (framebuffer null), sampling what we just drew.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(post.p);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  gl.uniform1i(post.loc.uScene, 0);
  gl.uniform2f(post.loc.uTexel, 1 / w, 1 / h);
  gl.uniform1f(post.loc.uBlur, params.blur);
  gl.uniform1f(post.loc.uAberration, params.aberration);
  gl.uniform1f(post.loc.uVignette, params.vignette);
  gl.uniform1f(post.loc.uSplit, params.split);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}
PG.status("scene → framebuffer texture → post shader → screen");
requestAnimationFrame(frame);

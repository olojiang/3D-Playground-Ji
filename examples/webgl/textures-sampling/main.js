// Textures & sampling — pixel data generated in JS, two texture units, wrap and filter modes.
// A floor receding into the distance makes filtering (and the need for mipmaps) easy to see.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const gl = canvas.getContext("webgl2", { antialias: true });
if (!gl) {
  PG.status("WebGL2 is not available in this browser · 当前浏览器不支持 WebGL2");
  throw new Error("WebGL2 unavailable");
}

const vertexSrc = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aUV;
uniform mat4 uViewProjection;
uniform float uRepeat;
uniform vec2 uScroll;
out vec2 vUV;       // texture coordinates (0..1 = one copy of the texture)
out vec2 vMaskUV;
out float vDepth;   // distance from the camera, for fog
void main() {
  vUV = aUV * uRepeat + uScroll;   // > 1 means the wrap mode decides what we see
  vMaskUV = aUV;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
  vDepth = gl_Position.w;           // w = view-space depth after a perspective projection
}`;
const fragmentSrc = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uPattern;   // reads from texture unit 0
uniform sampler2D uTint;      // reads from texture unit 1
in vec2 vUV;
in vec2 vMaskUV;
in float vDepth;
out vec4 outColor;
void main() {
  vec3 pattern = texture(uPattern, vUV).rgb;
  vec3 tint = texture(uTint, vMaskUV).rgb;     // a smooth gradient, never repeated
  float fog = smoothstep(2.5, 11.0, vDepth);   // fade out toward the horizon
  vec3 c = mix(pattern * tint, vec3(0.043, 0.043, 0.07), fog);
  outColor = vec4(c, 1.0);
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
const loc = Object.fromEntries(["uViewProjection", "uRepeat", "uScroll", "uPattern", "uTint"].map((n) => [n, gl.getUniformLocation(program, n)]));

// ---- Texture 1: a 64×64 pattern built pixel by pixel -------------------------
const N = 64;
const pixels = new Uint8Array(N * N * 4);    // RGBA, one byte per channel
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const i = (y * N + x) * 4;
  const checker = ((x >> 4) + (y >> 4)) & 1;
  // Ring coverage 0..1 with a soft 1-pixel edge, so the texture itself is anti-aliased.
  const ring = Math.min(Math.max(2.6 - Math.abs(Math.hypot(x - 31.5, y - 31.5) - 20), 0), 1);
  const line = x < 2 || y < 2;
  let c = checker ? [206, 202, 214] : [34, 32, 52];
  c = c.map((v, k) => v + ([232, 185, 49][k] - v) * ring);
  if (line) c = [124, 92, 255];
  pixels.set([...c, 255], i);
}
const pattern = gl.createTexture();
gl.activeTexture(gl.TEXTURE0);               // select unit 0, then bind into it
gl.bindTexture(gl.TEXTURE_2D, pattern);
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
gl.generateMipmap(gl.TEXTURE_2D);            // builds 16×16, 8×8 … 1×1 averages

// ---- Texture 2: a 1×64 color ramp on unit 1 ---------------------------------
const ramp = new Uint8Array(64 * 4);
for (let i = 0; i < 64; i++) {
  const t = i / 63;
  ramp.set([255 * (0.75 + 0.25 * t), 255 * (0.85 - 0.1 * t), 255, 255], i * 4);
}
const tint = gl.createTexture();
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, tint);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, ramp);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);  // no mipmaps for this one
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

// ---- Geometry: a big floor quad (x, y, z, u, v) ------------------------------
const S = 12;
const quad = new Float32Array([-S, 0, 0, 0, 0, S, 0, 0, 1, 0, S, 0, -2 * S, 1, 1, -S, 0, 0, 0, 0, S, 0, -2 * S, 1, 1, -S, 0, -2 * S, 0, 1]);
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);

// Optional anisotropic filtering (sharper at grazing angles), if the GPU offers it.
const aniso = gl.getExtension("EXT_texture_filter_anisotropic");

const params = { minFilter: "LINEAR_MIPMAP_LINEAR", magFilter: "LINEAR", wrap: "REPEAT", repeat: 16, scroll: true, anisotropy: 1 };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "minFilter", ["NEAREST", "LINEAR", "NEAREST_MIPMAP_NEAREST", "LINEAR_MIPMAP_NEAREST", "LINEAR_MIPMAP_LINEAR"]).name("MIN_FILTER (far)");
gui.add(params, "magFilter", ["NEAREST", "LINEAR"]).name("MAG_FILTER (near)");
gui.add(params, "wrap", ["REPEAT", "MIRRORED_REPEAT", "CLAMP_TO_EDGE"]).name("WRAP_S / WRAP_T");
gui.add(params, "repeat", 0.5, 48, 0.5).name("uv repeat");
gui.add(params, "scroll");
if (aniso) gui.add(params, "anisotropy", 1, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT), 1);

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
}
new ResizeObserver(resize).observe(canvas);
resize();

// A fixed camera low above the floor: perspective × "move the world down and back".
function viewProjection(aspect) {
  const f = 1 / Math.tan((55 * Math.PI) / 360), near = 0.1, far = 50, nf = 1 / (near - far);
  const P = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  const a = 0.32, c = Math.cos(a), s = Math.sin(a);           // tilt the camera down
  const V = [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, -1.4 * c + 1.5 * s, -1.4 * s - 1.5 * c, 1]; // eye at (0, 1.4, 1.5)
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) out[col * 4 + r] += P[k * 4 + r] * V[col * 4 + k];
  return out;
}

function frame(now) {
  // Sampler state lives on the texture object: set it on unit 0's texture.
  gl.activeTexture(gl.TEXTURE0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl[params.minFilter]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl[params.magFilter]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl[params.wrap]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl[params.wrap]);
  if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, params.anisotropy);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.043, 0.043, 0.07, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniform1i(loc.uPattern, 0);   // a sampler uniform stores a texture UNIT number
  gl.uniform1i(loc.uTint, 1);
  gl.uniform1f(loc.uRepeat, params.repeat);
  gl.uniform2f(loc.uScroll, 0, params.scroll ? (now / 1000) * 0.15 : 0);
  gl.uniformMatrix4fv(loc.uViewProjection, false, viewProjection(canvas.width / canvas.height));
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  requestAnimationFrame(frame);
}
PG.status(`pattern ${N}×${N} on unit 0 · ramp 1×64 on unit 1`);
requestAnimationFrame(frame);

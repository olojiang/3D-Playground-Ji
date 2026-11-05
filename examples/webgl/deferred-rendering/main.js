// Deferred rendering in raw WebGL 2.
// 1. Geometry pass: draw every object ONCE into a G-buffer — several textures written at the same
//    time (MRT): world position, normal, albedo.
// 2. Lighting pass: draw each point light as a sphere ("light volume") with additive blending; only
//    the pixels inside it read the G-buffer and get lit. Cost ≈ pixels × lights touching them.
// 3. Compose: tone-map the accumulated light, or show any G-buffer channel.
// Drag to orbit, wheel to zoom.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const gl = canvas.getContext("webgl2", { antialias: false }); // MRT targets are not multisampled
if (!gl) throw new Error("WebGL 2 is not available");
// Rendering INTO float textures is an extension in WebGL 2. Without it we fall back to 8-bit targets
// and rebuild the position from the depth buffer instead of storing it.
const floatTargets = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
const MAX_LIGHTS = 256;
const NEAR = 0.1, FAR = 100; // camera clip planes (also used to linearise depth for display)

// ── tiny column-major mat4 helpers ───────────────────────────────────────────
const M = {
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  perspective(fovy, aspect, n, f) { const t = 1 / Math.tan(fovy / 2); return new Float32Array([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]); },
  lookAt(e, c, up) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const z = nrm(sub(e, c)), x = nrm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  },
  invert(m) { // general 4×4 inverse (cofactors)
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b = [a00 * a11 - a01 * a10, a00 * a12 - a02 * a10, a00 * a13 - a03 * a10, a01 * a12 - a02 * a11, a01 * a13 - a03 * a11, a02 * a13 - a03 * a12,
      a20 * a31 - a21 * a30, a20 * a32 - a22 * a30, a20 * a33 - a23 * a30, a21 * a32 - a22 * a31, a21 * a33 - a23 * a31, a22 * a33 - a23 * a32];
    const d = 1 / (b[0] * b[11] - b[1] * b[10] + b[2] * b[9] + b[3] * b[8] - b[4] * b[7] + b[5] * b[6]);
    return new Float32Array([
      (a11 * b[11] - a12 * b[10] + a13 * b[9]) * d, (a02 * b[10] - a01 * b[11] - a03 * b[9]) * d, (a31 * b[5] - a32 * b[4] + a33 * b[3]) * d, (a22 * b[4] - a21 * b[5] - a23 * b[3]) * d,
      (a12 * b[8] - a10 * b[11] - a13 * b[7]) * d, (a00 * b[11] - a02 * b[8] + a03 * b[7]) * d, (a32 * b[2] - a30 * b[5] - a33 * b[1]) * d, (a20 * b[5] - a22 * b[2] + a23 * b[1]) * d,
      (a10 * b[10] - a11 * b[8] + a13 * b[6]) * d, (a01 * b[8] - a00 * b[10] - a03 * b[6]) * d, (a30 * b[4] - a31 * b[2] + a33 * b[0]) * d, (a21 * b[2] - a20 * b[4] - a23 * b[0]) * d,
      (a11 * b[7] - a10 * b[9] - a12 * b[6]) * d, (a00 * b[9] - a01 * b[7] + a02 * b[6]) * d, (a31 * b[1] - a30 * b[3] - a32 * b[0]) * d, (a20 * b[3] - a21 * b[1] + a22 * b[0]) * d]);
  },
};

// ── geometry (position + normal) and per-instance data ───────────────────────
function box() {
  const v = [], idx = [];
  for (const [a, b, c, s] of [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]]) {
    const base = v.length / 6;
    for (const [u, w] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = [0, 0, 0], n = [0, 0, 0]; p[a] = u * 0.5 * s; p[b] = w * 0.5; p[c] = 0.5 * s; n[c] = s; v.push(...p, ...n); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { v: new Float32Array(v), i: new Uint16Array(idx) };
}
function sphere(seg = 32, rings = 16) {
  const v = [], idx = [];
  for (let y = 0; y <= rings; y++) for (let x = 0; x <= seg; x++) {
    const th = (y / rings) * Math.PI, ph = (x / seg) * Math.PI * 2, n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    v.push(n[0] * 0.5, n[1] * 0.5, n[2] * 0.5, ...n);
  }
  for (let y = 0; y < rings; y++) for (let x = 0; x < seg; x++) { const a = y * (seg + 1) + x, b = a + seg + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  return { v: new Float32Array(v), i: new Uint16Array(idx) };
}
// One VAO per (mesh, instance list). Instance layout: position(3) scale(3) color(3) emissive(1).
function makeBatch(geo, instances) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, geo.v, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.i, gl.STATIC_DRAW);
  const ibuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
  gl.bufferData(gl.ARRAY_BUFFER, instances, gl.DYNAMIC_DRAW);
  [[2, 3, 0], [3, 3, 12], [4, 3, 24], [5, 1, 36]].forEach(([loc, size, off]) => {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 40, off);
    gl.vertexAttribDivisor(loc, 1); // advance once per instance, not per vertex
  });
  gl.bindVertexArray(null);
  return { vao, ibuf, count: geo.i.length, instances: instances.length / 10, data: instances };
}
const hsl = (h, s, l) => { const f = (n) => { const k = (n + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
const BOX = box(), BALL = sphere();
const ground = makeBatch(BOX, new Float32Array([0, -0.25, 0, 30, 0.5, 30, 0.22, 0.22, 0.26, 0]));
const cubes = [], balls = [];
for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) {
  const h = 0.4 + ((((x * 7 + z * 13) % 5) + 5) % 5) * 0.35, c = hsl(((x + z + 8) * 0.07) % 1, 0.25, 0.72);
  if ((x + z) & 1) balls.push(x * 1.6, 0.45, z * 1.6, 0.9, 0.9, 0.9, ...c, 0);
  else cubes.push(x * 1.6, h / 2, z * 1.6, 0.7, h, 0.7, ...c, 0);
}
const cubeBatch = makeBatch(BOX, new Float32Array(cubes)), ballBatch = makeBatch(BALL, new Float32Array(balls));
const lightMarkers = makeBatch(BALL, new Float32Array(MAX_LIGHTS * 10));            // tiny emissive balls at each light
const lightVolumes = makeBatch(sphere(16, 8), new Float32Array(MAX_LIGHTS * 10));   // one bounding sphere per light

// ── shaders ──────────────────────────────────────────────────────────────────
function program(vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, "#version 300 es\nprecision highp float;\nprecision highp int;\n" + src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  ["aPos", "aNormal", "iPos", "iScale", "iColor", "iEmissive"].forEach((n, i) => gl.bindAttribLocation(p, i, n));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
  const u = {};
  for (let k = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); k < n; k++) { const name = gl.getActiveUniform(p, k).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

// Geometry pass: no lighting at all — just write surface attributes into three targets at once.
const gbufProg = program(`
in vec3 aPos, aNormal, iPos, iScale, iColor; in float iEmissive;
uniform mat4 uViewProj;
out vec3 vWorld, vNormal, vColor; out float vEmissive;
void main() {
  vWorld = iPos + aPos * iScale;
  vNormal = normalize(aNormal / iScale);   // inverse-transpose of a pure scale
  vColor = iColor; vEmissive = iEmissive;
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}`, `
in vec3 vWorld, vNormal, vColor; in float vEmissive;
uniform bool uPackNormals;
layout(location = 0) out vec4 gPosition;  // RGBA16F: world xyz
layout(location = 1) out vec4 gNormal;    // RGBA16F, or RGBA8 packed to [0,1]
layout(location = 2) out vec4 gAlbedo;    // RGBA8: colour + emissive flag
void main() {
  vec3 n = normalize(vNormal);
  gPosition = vec4(vWorld, 1.0);
  gNormal = vec4(uPackNormals ? n * 0.5 + 0.5 : n, 1.0);
  gAlbedo = vec4(vColor, vEmissive);
}`);

// Shared G-buffer decoding for the lighting and compose passes.
const GBUF_GLSL = `
uniform highp sampler2D gPosition, gNormal, gAlbedo, gDepth;
uniform bool uReconstruct, uPackNormals;
uniform mat4 uInvViewProj;
uniform vec2 uResolution;
vec3 worldPos(ivec2 c) {
  if (!uReconstruct) return texelFetch(gPosition, c, 0).xyz;
  // Fallback: rebuild the position from depth + pixel coordinate with the inverse view-projection.
  vec4 ndc = vec4((vec2(c) + 0.5) / uResolution * 2.0 - 1.0, texelFetch(gDepth, c, 0).r * 2.0 - 1.0, 1.0);
  vec4 w = uInvViewProj * ndc;
  return w.xyz / w.w;
}
vec3 worldNormal(ivec2 c) { vec3 n = texelFetch(gNormal, c, 0).xyz; return normalize(uPackNormals ? n * 2.0 - 1.0 : n); }`;

// Lighting pass: a sphere per light (instanced). Each covered pixel adds THIS light's contribution.
const volumeProg = program(`
in vec3 aPos, aNormal, iPos, iScale, iColor;
uniform mat4 uViewProj;
flat out vec3 vLight, vColor; flat out float vRadius;
void main() {
  vLight = iPos; vColor = iColor; vRadius = iScale.x;
  gl_Position = uViewProj * vec4(iPos + aPos * 2.2 * iScale.x, 1.0); // unit sphere has radius 0.5 (+10% margin)
}`, `${GBUF_GLSL}
flat in vec3 vLight, vColor; flat in float vRadius;
uniform vec3 uEye;
uniform float uCountUnit;
out vec4 outColor;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 albedo = texelFetch(gAlbedo, c, 0);
  if (texelFetch(gDepth, c, 0).r >= 1.0 || albedo.a > 0.5) discard; // sky or light marker
  vec3 P = worldPos(c), N = worldNormal(c), V = normalize(uEye - P);
  vec3 Lv = vLight - P;
  float d2 = dot(Lv, Lv);
  if (d2 > vRadius * vRadius) discard;                 // inside the sphere's screen area but out of range
  float d = sqrt(d2);
  vec3 L = Lv / d;
  float window = pow(clamp(1.0 - pow(d / vRadius, 4.0), 0.0, 1.0), 2.0); // fades to exactly 0 at the radius
  float att = window / (d2 + 1.0);
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 40.0) * 0.5;
  outColor = vec4((albedo.rgb * diff + spec) * vColor * att, uCountUnit); // alpha counts lights per pixel
}`);

// Compose pass: one full-screen triangle → tone-mapped image or a G-buffer debug view.
const composeProg = program(`
void main() { vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0; gl_Position = vec4(p, 0.0, 1.0); }`, `${GBUF_GLSL}
uniform highp sampler2D uAccum;
uniform int uView;
uniform float uCountUnit;
out vec4 outColor;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 frag = gl_FragCoord.xy;
  ivec2 c = ivec2(frag);
  int view = uView;
  if (view == 6) {                                     // 2×2 overview of the G-buffer
    vec2 halfRes = uResolution * 0.5;
    bvec2 hi = greaterThanEqual(frag, halfRes);
    c = ivec2((frag - vec2(hi) * halfRes) * 2.0);
    view = hi.y ? (hi.x ? 2 : 1) : (hi.x ? 0 : 3);     // TL position · TR normal · BL albedo · BR final
  }
  float depth = texelFetch(gDepth, c, 0).r;
  vec4 albedo = texelFetch(gAlbedo, c, 0);
  vec3 color;
  if (view == 1) color = depth >= 1.0 ? vec3(0.0) : fract(worldPos(c) * 0.25);
  else if (view == 2) color = depth >= 1.0 ? vec3(0.0) : worldNormal(c) * 0.5 + 0.5;
  else if (view == 3) color = albedo.rgb;
  else if (view == 4) {                                // depth is non-linear: convert back to eye distance
    float lin = 2.0 * ${NEAR.toFixed(2)} * ${FAR.toFixed(1)} / (${(FAR + NEAR).toFixed(2)} - (depth * 2.0 - 1.0) * ${(FAR - NEAR).toFixed(2)});
    color = vec3(1.0 - clamp((lin - 10.0) / 25.0, 0.0, 1.0));
  }
  else if (view == 5) {
    float n = texelFetch(uAccum, c, 0).a / uCountUnit;
    color = n < 0.5 ? vec3(0.02, 0.02, 0.06) : mix(vec3(0.1, 0.2, 0.9), vec3(1.0, 0.3, 0.1), clamp(n / 16.0, 0.0, 1.0)) + max(n - 16.0, 0.0) / 32.0;
  } else {
    vec3 hdr = depth >= 1.0 ? vec3(0.0016, 0.0016, 0.004)
             : albedo.a > 0.5 ? albedo.rgb * 4.0                     // emissive light markers
             : albedo.rgb * 0.03 + texelFetch(uAccum, c, 0).rgb;     // ambient + all lights
    color = pow(aces(hdr), vec3(1.0 / 2.2));
  }
  outColor = vec4(color, 1.0);
}`);

// ── G-buffer: one framebuffer, several colour attachments + a depth texture ──
let gbuf = null;
function makeTex(internal, w, h) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return t;
}
function makeGBuffer(w, h) {
  if (gbuf) { gbuf.textures.forEach((t) => t && gl.deleteTexture(t)); gl.deleteFramebuffer(gbuf.fbo); gl.deleteFramebuffer(gbuf.accumFbo); }
  const position = floatTargets ? makeTex(gl.RGBA16F, w, h) : null;
  const normal = makeTex(floatTargets ? gl.RGBA16F : gl.RGBA8, w, h);
  const albedo = makeTex(gl.RGBA8, w, h);
  const depth = makeTex(gl.DEPTH_COMPONENT24, w, h);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  if (position) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, position, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, normal, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, albedo, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  // MRT: fragment output location i goes to COLOR_ATTACHMENTi (or nowhere with NONE).
  gl.drawBuffers([position ? gl.COLOR_ATTACHMENT0 : gl.NONE, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) console.error("G-buffer incomplete: 0x" + status.toString(16));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // Light accumulation target (HDR when float rendering is available).
  const accum = makeTex(floatTargets ? gl.RGBA16F : gl.RGBA8, w, h);
  const accumFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, accumFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, accum, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gbuf = { fbo, accumFbo, w, h, position, normal, albedo, depth, accum, textures: [position, normal, albedo, depth, accum] };
}

const lights = Array.from({ length: MAX_LIGHTS }, (_, i) => ({
  r: 1.2 + Math.sqrt((i * 0.618) % 1) * 6.6, phase: i * 2.399, speed: 0.15 + ((i * 0.377) % 1) * 0.35, y: 0.25 + ((i * 0.233) % 1) * 1.2,
  color: hsl((i * 0.618) % 1, 0.9, 0.55),
}));
const COUNT_UNIT = floatTargets ? 1 : 1 / 255; // how much one light adds to the accumulation alpha

// ── GUI ──────────────────────────────────────────────────────────────────────
const VIEWS = { "final (lit)": 0, "position": 1, "normal": 2, "albedo": 3, "depth": 4, "lights per pixel": 5, "G-buffer 2×2": 6 };
const params = { view: 0, lights: 96, radius: 2.4, intensity: 2.2, speed: 1, markers: true };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "view", VIEWS).name("buffer");
gui.add(params, "lights", 1, MAX_LIGHTS, 1).name("point lights");
gui.add(params, "radius", 1, 8, 0.1).name("light radius");
gui.add(params, "intensity", 1, 20, 0.1);
gui.add(params, "speed", 0, 3, 0.01).name("animation speed");
gui.add(params, "markers").name("light markers");

// ── camera orbit ─────────────────────────────────────────────────────────────
let yaw = 0.7, pitch = 0.68, dist = 21, drag = null;
canvas.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  yaw += (e.clientX - drag[0]) * 0.006; pitch = Math.min(1.45, Math.max(0.1, pitch + (e.clientY - drag[1]) * 0.006));
  drag = [e.clientX, e.clientY];
});
canvas.addEventListener("pointerup", () => (drag = null));
canvas.addEventListener("wheel", (e) => { e.preventDefault(); dist = Math.min(35, Math.max(5, dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
}
new ResizeObserver(resize).observe(canvas);
resize();

function drawBatch(b, count = b.instances) {
  gl.bindVertexArray(b.vao);
  gl.drawElementsInstanced(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0, count);
}
function bindGBuffer(prog, extra = []) {
  const tex = [["gPosition", gbuf.position || gbuf.albedo], ["gNormal", gbuf.normal], ["gAlbedo", gbuf.albedo], ["gDepth", gbuf.depth], ...extra];
  tex.forEach(([name, tx], unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx); gl.uniform1i(prog.u[name], unit); });
  gl.activeTexture(gl.TEXTURE0);
}
function setDecode(prog, invViewProj) {
  gl.uniform1i(prog.u.uReconstruct, !floatTargets);
  gl.uniform1i(prog.u.uPackNormals, !floatTargets);
  gl.uniformMatrix4fv(prog.u.uInvViewProj, false, invViewProj);
  gl.uniform2f(prog.u.uResolution, canvas.width, canvas.height);
  gl.uniform1f(prog.u.uCountUnit, COUNT_UNIT);
}

let t = 0, last = 0;
function frame(ms) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, ms / 1000 - last); last = ms / 1000;
  t += dt * params.speed;
  if (!gbuf || gbuf.w !== canvas.width || gbuf.h !== canvas.height) makeGBuffer(canvas.width, canvas.height);

  // Animate lights on the CPU → per-instance data for the volumes and the markers.
  const n = params.lights;
  for (let i = 0; i < n; i++) {
    const L = lights[i], a = L.phase + t * L.speed * (i & 1 ? 1 : -1);
    const x = Math.cos(a) * L.r, z = Math.sin(a * 1.3) * L.r, y = L.y + Math.sin(t * 2 + i) * 0.15;
    const k = params.intensity;
    lightVolumes.data.set([x, y, z, params.radius, params.radius, params.radius, L.color[0] * k, L.color[1] * k, L.color[2] * k, 0], i * 10);
    lightMarkers.data.set([x, y, z, 0.12, 0.12, 0.12, ...L.color, 1], i * 10);
  }
  for (const b of [lightVolumes, lightMarkers]) { gl.bindBuffer(gl.ARRAY_BUFFER, b.ibuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data, 0, n * 10); }

  const eye = [Math.cos(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.sin(yaw) * Math.cos(pitch) * dist];
  const viewProj = M.mul(M.perspective(0.75, canvas.width / canvas.height, NEAR, FAR), M.lookAt(eye, [0, 0.4, 0], [0, 1, 0]));
  const invViewProj = M.invert(viewProj);

  // ── 1. Geometry pass → G-buffer (MRT) ──
  gl.bindFramebuffer(gl.FRAMEBUFFER, gbuf.fbo);
  gl.viewport(0, 0, gbuf.w, gbuf.h);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
  if (gbuf.position) gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
  gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
  gl.clearBufferfv(gl.COLOR, 2, [0, 0, 0, 0]);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.useProgram(gbufProg.p);
  gl.uniformMatrix4fv(gbufProg.u.uViewProj, false, viewProj);
  gl.uniform1i(gbufProg.u.uPackNormals, !floatTargets);
  drawBatch(ground); drawBatch(cubeBatch); drawBatch(ballBatch);
  if (params.markers) drawBatch(lightMarkers, n);

  // ── 2. Lighting pass → accumulation buffer, additive ──
  gl.bindFramebuffer(gl.FRAMEBUFFER, gbuf.accumFbo);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);
  gl.cullFace(gl.FRONT);                  // draw the BACK of each sphere: still works when the camera is inside
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(volumeProg.p);
  bindGBuffer(volumeProg);
  setDecode(volumeProg, invViewProj);
  gl.uniformMatrix4fv(volumeProg.u.uViewProj, false, viewProj);
  gl.uniform3fv(volumeProg.u.uEye, eye);
  drawBatch(lightVolumes, n);
  gl.disable(gl.BLEND); gl.cullFace(gl.BACK);

  // ── 3. Compose → screen ──
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(composeProg.p);
  bindGBuffer(composeProg, [["uAccum", gbuf.accum]]);
  setDecode(composeProg, invViewProj);
  gl.uniform1i(composeProg.u.uView, params.view);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const objects = ground.instances + cubeBatch.instances + ballBatch.instances;
  PG.status(`G-buffer ${gbuf.w}×${gbuf.h}: ${floatTargets ? "position RGBA16F · normal RGBA16F" : "no float targets → normal RGBA8, position rebuilt from depth"} · albedo RGBA8 · depth 24-bit\n` +
    `${objects} objects drawn once + ${n} light volumes · forward: ${objects * n} object-light pairs`);
}
requestAnimationFrame(frame);

// Shadow mapping by hand in raw WebGL 2.
// Pass 1 renders the scene from the light into a depth texture (the shadow map).
// Pass 2 renders from the camera; each fragment is projected into light space and its depth is
// compared with the stored one: farther than the stored depth → something blocks the light → shadow.
// Drag to orbit, wheel to zoom.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const gl = canvas.getContext("webgl2", { antialias: true });
if (!gl) throw new Error("WebGL 2 is not available");

// ── tiny column-major mat4 helpers ───────────────────────────────────────────
const M = {
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  perspective(fovy, aspect, n, f) { const t = 1 / Math.tan(fovy / 2); return new Float32Array([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]); },
  ortho(l, r, b, t, n, f) { return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]); },
  lookAt(e, c, up) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const z = nrm(sub(e, c)), x = nrm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  },
  // translate · rotateY · scale
  trs(t, ry, s) { const c = Math.cos(ry), n = Math.sin(ry); return new Float32Array([c * s[0], 0, -n * s[0], 0, 0, s[1], 0, 0, n * s[2], 0, c * s[2], 0, t[0], t[1], t[2], 1]); },
};

// ── geometry: interleaved position + normal ──────────────────────────────────
function box() {
  const v = [], idx = [];
  const faces = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]];
  for (const [a, b, c, s] of faces) {
    const base = v.length / 6;
    for (const [u, w] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 0, 0], n = [0, 0, 0];
      p[a] = u * 0.5 * s; p[b] = w * 0.5; p[c] = 0.5 * s; n[c] = s;
      v.push(...p, ...n);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { v: new Float32Array(v), i: new Uint16Array(idx) };
}
function sphere(seg = 48, rings = 24) {
  const v = [], idx = [];
  for (let y = 0; y <= rings; y++) for (let x = 0; x <= seg; x++) {
    const th = (y / rings) * Math.PI, ph = (x / seg) * Math.PI * 2;
    const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    v.push(n[0] * 0.5, n[1] * 0.5, n[2] * 0.5, ...n);
  }
  for (let y = 0; y < rings; y++) for (let x = 0; x < seg; x++) {
    const a = y * (seg + 1) + x, b = a + seg + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  return { v: new Float32Array(v), i: new Uint16Array(idx) };
}
function upload({ v, i }) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, i, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  gl.bindVertexArray(null);
  return { vao, count: i.length };
}
const BOX = upload(box()), BALL = upload(sphere());

// ── shaders ──────────────────────────────────────────────────────────────────
function program(vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, "#version 300 es\nprecision highp float;\n" + src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.bindAttribLocation(p, 0, "aPos"); gl.bindAttribLocation(p, 1, "aNormal");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
  const u = {};
  for (let k = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); k < n; k++) { const name = gl.getActiveUniform(p, k).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}
// Pass 1: only depth matters, so the fragment shader is empty.
const depthProg = program(`
in vec3 aPos; uniform mat4 uLightVP, uModel;
void main() { gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`, `void main() {}`);

// Pass 2: lighting + shadow test.
const sceneProg = program(`
in vec3 aPos; in vec3 aNormal;
uniform mat4 uViewProj, uModel, uLightVP;
out vec3 vNormal; out vec3 vWorld; out vec4 vLightClip;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNormal = transpose(inverse(mat3(uModel))) * aNormal;
  vLightClip = uLightVP * w;                       // the same point, seen from the light
  gl_Position = uViewProj * w;
}`, `
in vec3 vNormal; in vec3 vWorld; in vec4 vLightClip;
uniform highp sampler2D uShadowMap;
uniform vec3 uLightDir, uColor, uEye;
uniform float uBias;
uniform bool uSlopeBias, uShadows;
uniform int uPcfRadius;                            // 0 = single hard sample
out vec4 outColor;

float shadowFactor(float NdotL) {
  vec3 p = vLightClip.xyz / vLightClip.w * 0.5 + 0.5; // NDC → [0,1] texture coords + depth
  if (p.z > 1.0 || any(lessThan(p.xy, vec2(0.0))) || any(greaterThan(p.xy, vec2(1.0)))) return 1.0;
  // Bias pushes the comparison a little toward the light to kill "shadow acne".
  // Slope-scaled: surfaces at grazing angles to the light need more.
  float bias = uSlopeBias ? uBias * (0.2 + 2.0 * sqrt(1.0 - NdotL * NdotL) / max(NdotL, 0.05)) : uBias;
  float current = p.z - bias;
  vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
  float lit = 0.0, taps = 0.0;
  // PCF: average the 0/1 results of several neighbouring comparisons → soft edges.
  for (int y = -3; y <= 3; y++) for (int x = -3; x <= 3; x++) {
    if (abs(x) > uPcfRadius || abs(y) > uPcfRadius) continue;
    float stored = texture(uShadowMap, p.xy + vec2(x, y) * texel).r;
    lit += current > stored ? 0.0 : 1.0;
    taps += 1.0;
  }
  return lit / taps;
}

void main() {
  vec3 N = normalize(vNormal), L = normalize(uLightDir), V = normalize(uEye - vWorld);
  float NdotL = max(dot(N, L), 0.0);
  float s = uShadows ? shadowFactor(NdotL) : 1.0;
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 48.0) * 0.35;
  vec3 ambient = mix(vec3(0.05, 0.05, 0.10), vec3(0.12, 0.11, 0.16), N.y * 0.5 + 0.5) * uColor;
  vec3 c = ambient + s * (uColor * NdotL + spec) * vec3(1.0, 0.93, 0.82) * 1.25;
  float fog = smoothstep(18.0, 34.0, length(vWorld - uEye));
  c = mix(c, vec3(0.043, 0.043, 0.07), fog);
  outColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`);

// Debug view: draw the depth texture as a grey image in a corner.
const quadProg = program(`
out vec2 vUv;
void main() { vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2.0; vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`, `
in vec2 vUv; uniform highp sampler2D uShadowMap; out vec4 outColor;
void main() { float d = texture(uShadowMap, vUv).r; outColor = vec4(vec3(0.85, 0.9, 1.0) * smoothstep(0.3, 0.8, d), 1.0); /* stretch contrast */ }`);

// ── the shadow map: a depth texture attached to a framebuffer ─────────────────
let shadowTex = null, shadowFbo = null, shadowSize = 0;
function makeShadowMap(size) {
  if (shadowTex) { gl.deleteTexture(shadowTex); gl.deleteFramebuffer(shadowFbo); }
  shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size); // depth textures are core in WebGL 2
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);   // depth must not be filtered here
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  shadowFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);                     // no colour at all
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) console.error("shadow framebuffer incomplete");
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  shadowSize = size;
}

// ── scene ────────────────────────────────────────────────────────────────────
const hex = (h) => [1, 3, 5].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255) ** 2.2);
const objects = [{ mesh: BOX, t: [0, -0.25, 0], s: [24, 0.5, 24], ry: 0, color: hex("#2c2c44") }];
const palette = ["#ff6b6b", "#ffd43b", "#69db7c", "#4dabf7", "#9775fa", "#f783ac"];
for (let k = 0; k < 6; k++) {
  const a = (k / 6) * Math.PI * 2, h = 1 + (k % 3) * 0.9;
  objects.push({ mesh: BOX, t: [Math.cos(a) * 4, h / 2, Math.sin(a) * 4], s: [0.9, h, 0.9], ry: a, color: hex(palette[k]), spin: k % 2 ? 0.4 : -0.3 });
}
objects.push({ mesh: BALL, t: [0, 1.6, 0], s: [2.2, 2.2, 2.2], ry: 0, color: hex("#e9ecef"), bob: true });
objects.push({ mesh: BOX, t: [0, 3.6, 0], s: [3.2, 0.12, 0.5], ry: 0, color: hex("#ff922b"), spin: 0.8 }); // floating bar: a long moving shadow

// ── GUI ──────────────────────────────────────────────────────────────────────
const params = { shadows: true, bias: 0.002, slopeBias: true, pcf: true, pcfRadius: 2, mapSize: 1024, cullFront: false,
  lightAngle: 120, lightHeight: 38, orbitLight: true, frustum: 9, showDepthMap: true };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "shadows");
const fb = gui.addFolder("Bias · acne vs peter-panning");
fb.add(params, "bias", 0, 0.05, 0.0001).name("depth bias");
fb.add(params, "slopeBias").name("slope-scaled bias");
fb.add(params, "cullFront").name("cull front faces (depth pass)");
const fp = gui.addFolder("Filtering");
fp.add(params, "pcf").name("PCF");
fp.add(params, "pcfRadius", 1, 3, 1).name("PCF radius (texels)");
fp.add(params, "mapSize", [256, 512, 1024, 2048]).name("shadow map size");
const fl = gui.addFolder("Light");
fl.add(params, "orbitLight").name("orbit light");
fl.add(params, "lightAngle", 0, 360, 1).name("azimuth (°)").decimals(0).listen();
fl.add(params, "lightHeight", 10, 85, 1).name("elevation (°)");
fl.add(params, "frustum", 4, 20, 0.5).name("ortho frustum size");
gui.add(params, "showDepthMap").name("show depth map");

// ── camera orbit ─────────────────────────────────────────────────────────────
let yaw = 0.6, pitch = 0.5, dist = 15, drag = null;
canvas.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  yaw += (e.clientX - drag[0]) * 0.006; pitch = Math.min(1.4, Math.max(0.08, pitch + (e.clientY - drag[1]) * 0.006));
  drag = [e.clientX, e.clientY];
});
canvas.addEventListener("pointerup", () => (drag = null));
canvas.addEventListener("wheel", (e) => { e.preventDefault(); dist = Math.min(30, Math.max(6, dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
}
new ResizeObserver(resize).observe(canvas);
resize();

function drawObjects(prog, time) {
  for (const o of objects) {
    const t = o.bob ? [o.t[0], o.t[1] + Math.sin(time * 1.3) * 0.35, o.t[2]] : o.t;
    gl.uniformMatrix4fv(prog.u.uModel, false, M.trs(t, o.ry + (o.spin || 0) * time, o.s));
    if (prog.u.uColor) gl.uniform3fv(prog.u.uColor, o.color);
    gl.bindVertexArray(o.mesh.vao);
    gl.drawElements(gl.TRIANGLES, o.mesh.count, gl.UNSIGNED_SHORT, 0);
  }
}

let last = 0;
function frame(ms) {
  requestAnimationFrame(frame);
  const time = ms / 1000, dt = Math.min(0.05, time - last); last = time;
  if (params.mapSize !== shadowSize) makeShadowMap(params.mapSize);
  if (params.orbitLight) params.lightAngle = (params.lightAngle + dt * 12) % 360;

  // Light: a directional light → orthographic projection looking at the scene centre.
  const az = (params.lightAngle * Math.PI) / 180, el = (params.lightHeight * Math.PI) / 180;
  const lightDir = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
  const f = params.frustum;
  const lightVP = M.mul(M.ortho(-f, f, -f, f, 1, 40), M.lookAt(lightDir.map((x) => x * 20), [0, 0, 0], [0, 1, 0]));

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

  // ── Pass 1: depth from the light ──
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
  gl.viewport(0, 0, shadowSize, shadowSize);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.cullFace(params.cullFront ? gl.FRONT : gl.BACK); // back faces in the map → less acne, more peter-panning
  gl.useProgram(depthProg.p);
  gl.uniformMatrix4fv(depthProg.u.uLightVP, false, lightVP);
  drawObjects(depthProg, time);
  gl.cullFace(gl.BACK);

  // ── Pass 2: the camera view, testing every fragment against the shadow map ──
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.043, 0.043, 0.07, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const eye = [Math.cos(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.sin(yaw) * Math.cos(pitch) * dist];
  const viewProj = M.mul(M.perspective(0.8, canvas.width / canvas.height, 0.1, 80), M.lookAt(eye, [0, 1, 0], [0, 1, 0]));
  gl.useProgram(sceneProg.p);
  gl.uniformMatrix4fv(sceneProg.u.uViewProj, false, viewProj);
  gl.uniformMatrix4fv(sceneProg.u.uLightVP, false, lightVP);
  gl.uniform3fv(sceneProg.u.uLightDir, lightDir);
  gl.uniform3fv(sceneProg.u.uEye, eye);
  gl.uniform1f(sceneProg.u.uBias, params.bias);
  gl.uniform1i(sceneProg.u.uSlopeBias, params.slopeBias);
  gl.uniform1i(sceneProg.u.uShadows, params.shadows);
  gl.uniform1i(sceneProg.u.uPcfRadius, params.pcf ? params.pcfRadius : 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.uniform1i(sceneProg.u.uShadowMap, 0);
  drawObjects(sceneProg, time);

  // ── Inset: what the light "sees" (near = dark, far = bright) ──
  if (params.showDepthMap) {
    const s = Math.floor(Math.min(canvas.width, canvas.height) * 0.3);
    const pad = Math.floor(10 * Math.min(devicePixelRatio, 2));
    gl.disable(gl.DEPTH_TEST);
    gl.viewport(pad, canvas.height - s - pad, s, s);
    gl.useProgram(quadProg.p);
    gl.uniform1i(quadProg.u.uShadowMap, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const taps = params.pcf ? (2 * params.pcfRadius + 1) ** 2 : 1;
  PG.status(`shadow map ${shadowSize}² depth texture · ${taps} tap${taps > 1 ? "s" : ""} per pixel · bias ${params.bias.toFixed(4)}${params.slopeBias ? " (slope-scaled)" : ""}` +
    `\nworld texel ≈ ${((2 * f) / shadowSize * 100).toFixed(1)} cm · ${objects.length + 0} draw calls × 2 passes`);
}
requestAnimationFrame(frame);

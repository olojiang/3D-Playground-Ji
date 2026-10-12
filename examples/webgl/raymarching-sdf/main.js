// Raymarching signed distance fields — a whole 3D scene inside one fragment shader.
// Sphere tracing · SDF primitives · smooth union · normals from the gradient · soft shadows · AO
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const gl = canvas.getContext("webgl2");
if (!gl) {
  PG.status("WebGL2 is not available in this browser · 当前浏览器不支持 WebGL2");
  throw new Error("WebGL2 unavailable");
}

const vertexSrc = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const fragmentSrc = /* glsl */ `#version 300 es
precision highp float;
uniform vec2  uResolution;
uniform float uTime;
uniform float uBlend;      // smooth-union radius k
uniform float uSoftness;   // shadow penumbra factor
uniform bool  uShadows;
uniform bool  uAO;
uniform int   uSteps;
uniform vec2  uOrbit;      // camera yaw / pitch
out vec4 outColor;

// ---- SDF primitives (distance from point p to the surface) -------------------
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdTorus(vec3 p, vec2 t) { return length(vec2(length(p.xz) - t.x, p.y)) - t.y; }
float sdBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }

// Smooth minimum: blends two distances within radius k → shapes melt together.
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// The scene: returns distance; material id in m (0 floor, 1 blob).
float map(vec3 p, out float m) {
  float t = uTime;
  float s = sdSphere(p - vec3(0.0, 0.75 + 0.25 * sin(t * 1.3), 0.0), 0.55);
  vec3 tp = p - vec3(0.0, 0.55, 0.0);
  float c = cos(t * 0.7), si = sin(t * 0.7);
  tp.xy = mat2(c, -si, si, c) * tp.xy;
  float tor = sdTorus(tp, vec2(0.85, 0.16));
  float box = sdBox(p - vec3(1.0 * sin(t * 0.9), 0.35, 1.0 * cos(t * 0.9)), vec3(0.28), 0.06);
  float blob = smin(smin(s, tor, uBlend), box, uBlend);
  float floorD = p.y;                         // the plane y = 0
  m = blob < floorD ? 1.0 : 0.0;
  return min(blob, floorD);
}
float map(vec3 p) { float m; return map(p, m); }

// Normal = gradient of the distance field (central differences, tetrahedron trick).
vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0007;
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

// Soft shadow: march toward the light; how close we pass to geometry → penumbra.
float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.02;
  for (int i = 0; i < 48; i++) {
    float h = map(ro + rd * t);
    res = min(res, uSoftness * h / t);
    t += clamp(h, 0.02, 0.25);
    if (res < 0.002 || t > 8.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

// Ambient occlusion: sample the field along the normal; nearby surfaces darken.
float ambientOcclusion(vec3 p, vec3 n) {
  float occ = 0.0, w = 1.0;
  for (int i = 1; i <= 5; i++) {
    float h = 0.03 + 0.12 * float(i);
    occ += (h - map(p + n * h)) * w;
    w *= 0.7;
  }
  return clamp(1.0 - 2.5 * occ, 0.0, 1.0);
}

void main() {
  vec2 p = (2.0 * gl_FragCoord.xy - uResolution) / uResolution.y;

  // Camera: orbit around the origin, build a look-at basis, one ray per pixel.
  vec3 ro = 3.6 * vec3(cos(uOrbit.y) * sin(uOrbit.x), sin(uOrbit.y), cos(uOrbit.y) * cos(uOrbit.x));
  vec3 ta = vec3(0.0, 0.5, 0.0);
  vec3 ww = normalize(ta - ro), uu = normalize(cross(ww, vec3(0, 1, 0))), vv = cross(uu, ww);
  vec3 rd = normalize(p.x * uu + p.y * vv + 1.8 * ww);

  // Sphere tracing: step forward by the distance to the nearest surface — it is always safe.
  float t = 0.0, m = 0.0;
  bool hit = false;
  for (int i = 0; i < 200; i++) {
    if (i >= uSteps) break;
    float d = map(ro + rd * t, m);
    if (d < 0.001 * t) { hit = true; break; }
    t += d;
    if (t > 20.0) break;
  }

  vec3 sky = mix(vec3(0.05, 0.05, 0.09), vec3(0.16, 0.12, 0.26), clamp(rd.y * 2.0 + 0.4, 0.0, 1.0));
  vec3 col = sky;
  if (hit) {
    vec3 pos = ro + rd * t;
    vec3 n = calcNormal(pos);
    vec3 L = normalize(vec3(0.6, 0.8, 0.4));
    vec3 albedo = m > 0.5 ? vec3(0.95, 0.55, 0.3)
      : mix(vec3(0.12, 0.12, 0.18), vec3(0.2, 0.2, 0.28), mod(floor(pos.x * 2.0) + floor(pos.z * 2.0), 2.0)); // checker floor
    float dif = max(dot(n, L), 0.0);
    float sha = uShadows ? softShadow(pos + n * 0.002, L) : 1.0;
    float ao = uAO ? ambientOcclusion(pos, n) : 1.0;
    float spe = pow(max(dot(reflect(rd, n), L), 0.0), 32.0) * dif * sha;
    float fre = pow(1.0 - max(dot(-rd, n), 0.0), 4.0);
    col = albedo * (vec3(1.0, 0.92, 0.8) * 1.6 * dif * sha + vec3(0.3, 0.32, 0.5) * 0.45 * ao);
    col += spe * 0.8 * float(m > 0.5) + fre * 0.25 * sky * ao;
    col = mix(col, sky, 1.0 - exp(-0.004 * t * t * t)); // distance fog
  }
  col = pow(col, vec3(1.0 / 2.2));                        // linear → display gamma
  outColor = vec4(col, 1.0);
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
const names = ["uResolution", "uTime", "uBlend", "uSoftness", "uShadows", "uAO", "uSteps", "uOrbit"];
const loc = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
const vao = gl.createVertexArray();

const params = { blend: 0.3, softness: 10, shadows: true, ao: true, steps: 96, autoRotate: true, resolution: 0.6 };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "blend", 0.001, 0.8, 0.001).name("smooth union k");
gui.add(params, "softness", 2, 40, 0.5).name("shadow softness");
gui.add(params, "shadows");
gui.add(params, "ao").name("ambient occlusion");
gui.add(params, "steps", 8, 200, 1).name("max march steps");
gui.add(params, "autoRotate");
gui.add(params, "resolution", 0.25, 1, 0.05).name("render scale").onChange(resize);

// Drag to orbit the camera.
const orbit = [0.6, 0.35];
let dragging = false;
canvas.addEventListener("pointerdown", (e) => { dragging = true; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointerup", () => (dragging = false));
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  orbit[0] -= e.movementX * 0.008;
  orbit[1] = Math.min(1.3, Math.max(0.05, orbit[1] + e.movementY * 0.006));
});

// Raymarching is expensive per pixel: render below native resolution and let CSS scale up.
function resize() {
  const s = Math.min(devicePixelRatio, 2) * params.resolution;
  canvas.width = Math.round(canvas.clientWidth * s);
  canvas.height = Math.round(canvas.clientHeight * s);
}
new ResizeObserver(resize).observe(canvas);
resize();

let last = 0;
function frame(now) {
  const dt = (now - last) / 1000; last = now;
  if (params.autoRotate && !dragging) orbit[0] += dt * 0.15;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(program);
  gl.uniform2f(loc.uResolution, canvas.width, canvas.height);
  gl.uniform1f(loc.uTime, now / 1000);
  gl.uniform1f(loc.uBlend, params.blend);
  gl.uniform1f(loc.uSoftness, params.softness);
  gl.uniform1i(loc.uShadows, params.shadows ? 1 : 0);
  gl.uniform1i(loc.uAO, params.ao ? 1 : 0);
  gl.uniform1i(loc.uSteps, params.steps);
  gl.uniform2fv(loc.uOrbit, orbit);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}
PG.status("drag to orbit · 拖动旋转视角");
requestAnimationFrame(frame);

// Shader debugging — there is no printf on the GPU, so we print with COLOR.
// Debug views (normals, uv, depth, N·L heatmap, NaN finder) toggled from the GUI,
// plus a button that compiles broken shaders so you can learn to read the info log.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.debug.onShaderError = (gl, program, vs, fs) =>
  console.error("Shader error:\n" + gl.getShaderInfoLog(vs) + gl.getShaderInfoLog(fs) + gl.getProgramInfoLog(program));

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 20);
camera.position.set(0, 2.6, 7.5);

const vertexShader = /* glsl */ `
out vec3 vNormal;
out vec2 vUv;
out float vViewDepth;   // distance in front of the camera (view space)
out vec3 vWorld;
void main() {
  vUv = uv;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vViewDepth = -view.z;
  gl_Position = projectionMatrix * view;
}`;

const fragmentShader = /* glsl */ `
uniform int uView;       // which debug view
uniform float uNear, uFar;
uniform vec3 uColor;
in vec3 vNormal;
in vec2 vUv;
in float vViewDepth;
in vec3 vWorld;
out vec4 fragColor;

// Map a scalar to a heatmap and flag out-of-range values: blue < 0, red > 1.
vec3 heat(float v) {
  if (v < 0.0) return vec3(0.1, 0.3, 1.0);
  if (v > 1.0) return vec3(1.0, 0.1, 0.1);
  return 0.5 + 0.5 * cos(6.2831 * (v * 0.7 + vec3(0.55, 0.35, 0.15)));
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(0.5, 0.9, 0.4));
  vec3 c;
  if (uView == 0) {                 // shaded: the "real" result
    c = uColor * (0.2 + 0.8 * max(dot(N, L), 0.0));
  } else if (uView == 1) {          // normals: remap [-1,1] → [0,1] to see them
    c = N * 0.5 + 0.5;
  } else if (uView == 2) {          // uv: red = u, green = v, plus a checker for scale
    float k = mod(floor(vUv.x * 10.0) + floor(vUv.y * 10.0), 2.0);
    c = vec3(vUv, 0.0) * (0.75 + 0.25 * k);
  } else if (uView == 3) {          // linear depth: near white, far black
    c = vec3(1.0 - (vViewDepth - uNear) / (uFar - uNear));
  } else if (uView == 4) {          // raw N·L (unclamped) → negative values show blue
    c = heat(dot(N, L) * 1.3);
  } else {                          // NaN finder: sqrt of a negative number is NaN
    float risky = sqrt(vWorld.y - 0.3);      // undefined below y = 0.3!
    bool bad = isnan(risky) || isinf(risky) || risky != risky;
    c = bad ? vec3(1.0, 0.0, 1.0) : vec3(risky * 0.6);
  }
  fragColor = vec4(c, 1.0);
}`;

const uniforms = {
  uView: { value: 1 },
  uNear: { value: 3 },
  uFar: { value: 12 },
  uColor: { value: new THREE.Color("#c9a227") },
};
const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, glslVersion: THREE.GLSL3 });

// A small still life: different shapes stress different views.
const shapes = [
  [new THREE.TorusKnotGeometry(0.6, 0.2, 200, 32), -2.4, 1.0],
  [new THREE.SphereGeometry(0.85, 64, 32), 0, 0.9],
  [new THREE.BoxGeometry(1.3, 1.3, 1.3), 2.4, 0.7],
].map(([g, x, y]) => {
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y, 0);
  scene.add(m);
  return m;
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), material);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.2;
scene.add(floor);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 0.6, 0);

// --- Common compile errors, compiled through the raw GL context on purpose ----------
const gl = renderer.getContext();
const broken = {
  "missing semicolon": "float a = 1.0\nfragColor = vec4(a);",
  "int vs float": "float a = 1;\nfragColor = vec4(a);",
  "wrong vector size": "vec3 c = vec4(1.0);\nfragColor = vec4(c, 1.0);",
  "undeclared name": "fragColor = vec4(colour, 1.0);",
};
function compileBroken(name) {
  const src = `#version 300 es\nprecision highp float;\nout vec4 fragColor;\nvoid main() {\n${broken[name]}\n}`;
  const s = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    console.error(`[${name}] compile failed:\n${log}`); // ERROR: 0:<line>: message
    PG.status(`${name} → ${log.split("\n")[0]}`);
  }
  gl.deleteShader(s);
}

const views = { shaded: 0, normals: 1, uv: 2, "linear depth": 3, "N·L heatmap": 4, "NaN finder": 5 };
const params = { view: 1, error: "missing semicolon", compile: () => compileBroken(params.error), spin: 0.3 };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "view", views).name("debug view").onChange((v) => { uniforms.uView.value = v; PG.status(hints[v]); });
gui.add(uniforms.uNear, "value", 1, 8, 0.1).name("depth near");
gui.add(uniforms.uFar, "value", 6, 20, 0.1).name("depth far");
gui.add(params, "spin", 0, 2, 0.01);
const f = gui.addFolder("Compile errors");
f.add(params, "error", Object.keys(broken)).name("mistake");
f.add(params, "compile").name("compile it → console");

const hints = [
  "shaded: the final image",
  "normals: x→red y→green z→blue, remapped from [-1,1]",
  "uv: u→red v→green; seams and stretching jump out",
  "linear depth: white = near, black = far",
  "N·L: blue = negative (facing away), red = above 1",
  "NaN finder: magenta = sqrt(negative) → NaN",
];
PG.status(hints[1]);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  for (const m of shapes) { m.rotation.y += dt * params.spin; m.rotation.x += dt * params.spin * 0.4; }
  controls.update();
  renderer.render(scene, camera);
});

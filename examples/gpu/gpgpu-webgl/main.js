// GPGPU on WebGL2 — a water ripple simulation that lives entirely in float textures.
// The "data" is a 256×256 RGBA float texture (r = height now, g = height one step ago).
// A fragment shader computes the next step into a second texture; then the two swap (ping-pong).
// three's GPUComputationRenderer handles the render targets and the swapping for us.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const SIM = 256; // simulation resolution (texels per side)
const SIZE = 6; // world size of the water plane

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 5.2, 5.8);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.45;

// ---------- 1. The simulation: a fragment shader that runs once per texel ----------
// `heightmap` (the previous state) and `resolution` are injected by GPUComputationRenderer.
const heightShader = /* glsl */ `
uniform vec2 dropPos;      // in uv space; off-screen when there is no drop
uniform float dropRadius;
uniform float dropStrength;
uniform float damping;

void main() {
  vec2 cell = 1.0 / resolution.xy;
  vec2 uv = gl_FragCoord.xy * cell;          // this thread's texel
  vec4 h = texture2D(heightmap, uv);
  // Neighbours: the wave equation only needs the 4 adjacent texels.
  float n = texture2D(heightmap, uv + vec2(0.0, cell.y)).r;
  float s = texture2D(heightmap, uv - vec2(0.0, cell.y)).r;
  float e = texture2D(heightmap, uv + vec2(cell.x, 0.0)).r;
  float w = texture2D(heightmap, uv - vec2(cell.x, 0.0)).r;
  // Discrete wave equation: next = (sum of neighbours)/2 − previous, then damp.
  float next = ((n + s + e + w) * 0.5 - h.g) * damping;
  // Add a smooth "drop" (mouse or rain).
  float d = length(uv - dropPos) / dropRadius;
  next -= dropStrength * smoothstep(1.0, 0.0, d) * 0.5 * (1.0 + cos(min(d, 1.0) * 3.14159));
  gl_FragColor = vec4(next, h.r, 0.0, 1.0);  // r = new height, g = old height (for next step)
}`;

const gpgpu = new GPUComputationRenderer(SIM, SIM, renderer);
const initial = gpgpu.createTexture(); // Float32 RGBA DataTexture, all zeros = flat water
const heightVar = gpgpu.addVariable("heightmap", heightShader, initial);
gpgpu.setVariableDependencies(heightVar, [heightVar]); // reads its own previous state
const simU = heightVar.material.uniforms;
simU.dropPos = { value: new THREE.Vector2(-10, -10) };
simU.dropRadius = { value: 0.03 };
simU.dropStrength = { value: 0 };
simU.damping = { value: 0.99 };
const err = gpgpu.init();
if (err) console.error("GPGPU init failed:", err);

// ---------- 2. Rendering: displace a plane by the height texture ----------
const waterMat = new THREE.ShaderMaterial({
  uniforms: {
    heightmap: { value: null },
    texel: { value: 1 / SIM },
    heightScale: { value: 0.6 },
    sunDir: { value: new THREE.Vector3(0.25, 0.3, -0.9).normalize() },
    deep: { value: new THREE.Color("#04263f") },
    shallow: { value: new THREE.Color("#0f8fa3") },
  },
  vertexShader: /* glsl */ `
    uniform sampler2D heightmap;
    uniform float texel, heightScale;
    varying vec3 vNormal, vWorld;
    varying float vHeight;
    float H(vec2 uv) { return texture2D(heightmap, uv).r * heightScale; }
    void main() {
      float h = H(uv);
      // Normal from finite differences of the height field.
      float dx = H(uv + vec2(texel, 0.0)) - H(uv - vec2(texel, 0.0));
      float dy = H(uv + vec2(0.0, texel)) - H(uv - vec2(0.0, texel));
      float step = 2.0 * texel * ${SIZE.toFixed(1)};
      vNormal = normalize(vec3(-dx / step, 1.0, dy / step));
      vec3 p = vec3(position.x, h, -position.y);   // plane lies in XY: rotate into XZ
      vHeight = h;
      vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 sunDir, deep, shallow;
    varying vec3 vNormal, vWorld;
    varying float vHeight;
    vec3 sky(vec3 d) {                       // procedural sky for reflections
      float t = clamp(d.y, 0.0, 1.0);
      return mix(vec3(0.9, 0.45, 0.3), vec3(0.04, 0.08, 0.25), pow(t, 0.35));
    }
    void main() {
      vec3 n = normalize(vNormal);
      vec3 v = normalize(cameraPosition - vWorld);
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
      vec3 body = mix(deep, shallow, clamp(vHeight * 3.0 + 0.4, 0.0, 1.0));
      vec3 refl = sky(reflect(-v, n));
      float spec = pow(max(dot(reflect(-sunDir, n), v), 0.0), 400.0) * 2.5;
      vec3 col = mix(body, refl, fres) + spec * vec3(1.0, 0.9, 0.75);
      // Fade the edges into the background.
      float edge = smoothstep(${(SIZE / 2).toFixed(1)}, ${(SIZE / 2 - 0.8).toFixed(1)}, max(abs(vWorld.x), abs(vWorld.z)));
      gl_FragColor = vec4(mix(vec3(0.0033, 0.0033, 0.006), col, edge), 1.0); // background colour in linear space
      #include <colorspace_fragment>
    }`,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE, SIM - 1, SIM - 1), waterMat);
scene.add(water);

// ---------- 3. Interaction: raycast the mouse onto the water plane ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
let mouseUV = null;
canvas.addEventListener("pointermove", (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  mouseUV = ray.ray.intersectPlane(plane, hit) ? new THREE.Vector2(hit.x / SIZE + 0.5, -hit.z / SIZE + 0.5) : null;
});
canvas.addEventListener("pointerleave", () => (mouseUV = null));

const params = { rain: 6, mouseStrength: 0.012, dropSize: 0.03, damping: 0.99, heightScale: 0.6, stepsPerFrame: 3 };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "rain", 0, 30, 1).name("rain drops / s");
gui.add(params, "mouseStrength", 0, 0.05, 0.001).name("mouse strength");
gui.add(params, "dropSize", 0.01, 0.08, 0.001).name("drop size");
gui.add(params, "damping", 0.95, 0.999, 0.001).onChange((v) => (simU.damping.value = v));
gui.add(params, "heightScale", 0.2, 3, 0.01).name("height scale").onChange((v) => (waterMat.uniforms.heightScale.value = v));
gui.add(params, "stepsPerFrame", 1, 6, 1).name("sim steps / frame");

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

const timer = new THREE.Timer();
let rainAcc = 0;
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  rainAcc += dt * params.rain;
  for (let s = 0; s < params.stepsPerFrame; s++) {
    // Each step injects at most one drop: the mouse first, otherwise maybe a rain drop.
    if (s === 0 && mouseUV) {
      simU.dropPos.value.copy(mouseUV); simU.dropRadius.value = params.dropSize; simU.dropStrength.value = params.mouseStrength;
    } else if (rainAcc >= 1) {
      rainAcc -= 1;
      simU.dropPos.value.set(0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7);
      simU.dropRadius.value = params.dropSize * (0.6 + Math.random());
      simU.dropStrength.value = 0.12 * (0.5 + Math.random());
    } else simU.dropStrength.value = 0;
    gpgpu.compute(); // one simulation step = one full-screen draw into the other render target
  }
  waterMat.uniforms.heightmap.value = gpgpu.getCurrentRenderTarget(heightVar).texture;
  controls.update();
  renderer.render(scene, camera);
  PG.status(`${SIM}×${SIM} float texture · ${(SIM * SIM).toLocaleString()} cells × ${params.stepsPerFrame} steps/frame · drag to orbit, move the mouse over the water`);
});

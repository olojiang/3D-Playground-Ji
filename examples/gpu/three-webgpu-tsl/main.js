// three.js WebGPURenderer + TSL (Three Shading Language).
// TSL builds shaders from JavaScript function calls. The same node graph compiles to WGSL on WebGPU
// and to GLSL on the WebGL 2 fallback backend, so one material works everywhere.
import * as THREE from "three/webgpu";
import {
  Fn, uniform, time, positionLocal, normalLocal, normalView, positionViewDirection, mx_noise_float,
  vec3, vec4, float, cos, sin, dot, abs, pow, oneMinus, length, smoothstep, uv, instancedArray, instanceIndex,
} from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const FORCE_WEBGL = false; // set to true to try the WebGL 2 backend on purpose

// Detect the adapter ourselves only to decide about compute: a software ("fallback") adapter such as
// SwiftShader runs every shader on the CPU, where a per-frame compute pass is far too slow.
const adapter = navigator.gpu && !FORCE_WEBGL ? await navigator.gpu.requestAdapter() : null;
const softwareGPU = adapter?.info?.isFallbackAdapter === true;

// 1. Renderer: picks WebGPU when available, otherwise falls back to WebGL 2 automatically.
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: FORCE_WEBGL });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
await renderer.init(); // async: requests the adapter/device (or a WebGL 2 context)
const backend = renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL 2 (fallback)";

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 1.2, 5.5);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight("#cfe0ff", "#20102a", 1.5));
const key = new THREE.DirectionalLight("#ffffff", 2.5);
key.position.set(3, 4, 2);
scene.add(key);

// 2. Uniforms: JS-side handles whose .value is sent to the GPU every frame.
const uAmp = uniform(0.22), uFreq = uniform(1.4), uSpeed = uniform(0.5), uHue = uniform(0);

// A TSL function: cosine palette, written once, usable in any shader stage.
const palette = Fn(([x]) => vec3(0.5).add(vec3(0.5).mul(cos(vec3(0.0, 0.33, 0.67).add(x).mul(6.28318)))));

// 3. A node material: replace parts of the built-in PBR shader with our own node graphs.
const t = time.mul(uSpeed);
const noise = mx_noise_float(positionLocal.mul(uFreq).add(vec3(0, t, t.mul(0.5)))); // −1 … 1
const blobMat = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.15 });
blobMat.positionNode = positionLocal.add(normalLocal.mul(noise.mul(uAmp)));          // vertex stage: displacement
blobMat.colorNode = palette(noise.mul(0.35).add(t.mul(0.08)).add(uHue));              // fragment stage: base colour
const fresnel = pow(oneMinus(abs(dot(normalView, positionViewDirection))), 3.0);
blobMat.emissiveNode = palette(noise.mul(0.35).add(0.5).add(uHue)).mul(fresnel).mul(0.9); // glowing rim
const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 64), blobMat);
scene.add(blob);

// 4. Particles in a storage buffer, updated by a TSL compute node.
const COUNT = 20000;
const init = new Float32Array(COUNT * 3);
for (let i = 0; i < COUNT; i++) {
  const a = Math.random() * Math.PI * 2, r = 1.7 + Math.pow(Math.random(), 2) * 1.6;
  init.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.25 * r, Math.sin(a) * r], i * 3);
}
const positions = instancedArray(init, "vec3"); // a GPU storage buffer, one vec3 per particle
const uDt = uniform(0), uSwirl = uniform(0.6);
const orbit = Fn(() => {
  const p = positions.element(instanceIndex);       // this invocation's particle
  const r = length(p.xz);
  const a = uSwirl.mul(uDt).div(r.mul(r).mul(0.25)); // inner particles orbit faster (Kepler-ish)
  const c = cos(a), s = sin(a);
  const y = p.y.add(sin(time.mul(1.5).add(r.mul(4.0))).mul(0.15).mul(uDt));
  p.assign(vec3(p.x.mul(c).sub(p.z.mul(s)), y, p.x.mul(s).add(p.z.mul(c))));
})().compute(COUNT);                                // one invocation per particle

const spriteMat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const pAttr = positions.toAttribute();             // read the same buffer as a per-instance attribute
spriteMat.positionNode = pAttr;
spriteMat.scaleNode = float(0.035);
spriteMat.colorNode = Fn(() => {
  const glow = smoothstep(0.5, 0.0, length(uv().sub(0.5)));
  return vec4(palette(length(pAttr).mul(0.25).add(uHue).add(0.4)).mul(glow), glow);
})();
const particles = new THREE.Sprite(spriteMat);
particles.count = COUNT; // instanced: one sprite per particle
scene.add(particles);

const runCompute = !softwareGPU;
if (!runCompute) console.info("Software GPU adapter detected — particle compute pass skipped (they still render).");

const params = { amplitude: 0.22, frequency: 1.4, speed: 0.5, hue: 0, swirl: 0.6 };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "amplitude", 0, 0.6, 0.01).onChange((v) => (uAmp.value = v));
gui.add(params, "frequency", 0.3, 4, 0.01).onChange((v) => (uFreq.value = v));
gui.add(params, "speed", 0, 2, 0.01).onChange((v) => (uSpeed.value = v));
gui.add(params, "hue", 0, 1, 0.01).onChange((v) => (uHue.value = v));
gui.add(params, "swirl", -2, 2, 0.01).name("particle swirl").onChange((v) => (uSwirl.value = v));

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

PG.status(`three.js r${THREE.REVISION} · backend: ${backend}${navigator.gpu ? "" : " — WebGPU not available in this browser · 当前浏览器不支持 WebGPU，已回退到 WebGL 2"} · compute: ${runCompute ? "on (" + COUNT.toLocaleString() + " particles)" : "skipped (software GPU)"}`);

const timer = new THREE.Timer();
renderer.setAnimationLoop((now) => {
  timer.update(now);
  uDt.value = Math.min(timer.getDelta(), 1 / 20);
  if (runCompute) renderer.compute(orbit); // dispatch the compute node before drawing
  blob.rotation.y += uDt.value * 0.15;
  controls.update();
  renderer.render(scene, camera);
});

// Instancing — draw tens of thousands of copies of one mesh in a single draw call.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#08080f");
scene.fog = new THREE.Fog("#08080f", 16, 34);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 9, 15);

scene.add(new THREE.HemisphereLight("#bcd0ff", "#140c1c", 1.0));
const key = new THREE.DirectionalLight("#ffffff", 2.2);
key.position.set(5, 10, 4);
scene.add(key);

const params = { mode: "instanced", count: 30000, speed: 1, amplitude: 1.2, wavelength: 0.55 };
const NAIVE_CAP = 4000; // separate meshes get slow quickly, so we cap that mode
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 });

let grid = [];      // per-item (x, z, distance from centre) — shared by both modes
let instanced = null, naive = null;
const dummy = new THREE.Object3D(); // a helper we position, then copy its matrix
const color = new THREE.Color();

function layout(count) {
  const side = Math.ceil(Math.sqrt(count)), gap = 0.13;
  grid = [];
  for (let i = 0; i < count; i++) {
    const x = ((i % side) - side / 2) * gap, z = (Math.floor(i / side) - side / 2) * gap;
    grid.push({ x, z, d: Math.hypot(x, z) });
  }
  return gap;
}

function build() {
  if (instanced) { scene.remove(instanced); instanced.dispose(); instanced = null; }
  if (naive) { scene.remove(naive); naive.traverse((o) => o.material?.dispose?.()); naive = null; }
  const count = params.mode === "instanced" ? params.count : Math.min(params.count, NAIVE_CAP);
  layout(count);
  const hue = (d) => color.setHSL(0.62 - Math.min(d / 14, 1) * 0.55, 0.75, 0.55);

  if (params.mode === "instanced") {
    // ONE object, ONE draw call. Each instance has its own matrix (+ optional colour).
    instanced = new THREE.InstancedMesh(geometry, material, count);
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // we rewrite matrices every frame
    instanced.frustumCulled = false; // instances move, so skip the (whole-object) bounds check
    grid.forEach((g, i) => instanced.setColorAt(i, hue(g.d)));
    instanced.instanceColor.needsUpdate = true;
    scene.add(instanced);
  } else {
    // The naive way: a separate Mesh (and draw call) per box. Same look, far more CPU work.
    naive = new THREE.Group();
    grid.forEach((g) => {
      const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: hue(g.d).clone(), roughness: 0.35, metalness: 0.15 }));
      m.matrixAutoUpdate = false; // we write m.matrix ourselves each frame
      naive.add(m);
    });
    scene.add(naive);
  }
}

const gui = new GUI({ title: "Parameters" });
gui.add(params, "mode", ["instanced", "separate meshes"]).onChange(build);
gui.add(params, "count", 1000, 100000, 1000).onFinishChange(build);
gui.add(params, "speed", 0, 3, 0.01);
gui.add(params, "amplitude", 0, 3, 0.01);
gui.add(params, "wavelength", 0.2, 1.5, 0.01);
build();

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

const timer = new THREE.Timer();
let t = 0, frame = 0, cpuMs = 0;
renderer.setAnimationLoop((time) => {
  timer.update(time);
  t += timer.getDelta() * params.speed;
  const t0 = performance.now();

  // Per-item transform: height and bob follow a ripple travelling out from the centre.
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i];
    const wave = Math.sin(g.d / params.wavelength - t * 2.2) * Math.exp(-g.d * 0.07);
    const h = 0.12 + (wave * 0.5 + 0.5) * params.amplitude;
    dummy.position.set(g.x, h / 2, g.z);
    dummy.scale.set(0.1, h, 0.1);
    dummy.rotation.y = wave * 0.6;
    dummy.updateMatrix();
    if (instanced) instanced.setMatrixAt(i, dummy.matrix);     // write into the instance buffer
    else naive.children[i].matrix.copy(dummy.matrix);         // or set each mesh's own matrix
  }
  if (instanced) instanced.instanceMatrix.needsUpdate = true; // re-upload the whole buffer once

  controls.update();
  renderer.render(scene, camera);
  cpuMs = cpuMs * 0.9 + (performance.now() - t0) * 0.1;

  // renderer.info counts the work of the LAST render call.
  if (frame++ % 15 === 0) {
    const r = renderer.info.render;
    const capped = params.mode !== "instanced" && params.count > NAIVE_CAP ? `  (capped at ${NAIVE_CAP})` : "";
    PG.status(`${params.mode}: ${grid.length.toLocaleString()} boxes${capped}\ndraw calls ${r.calls} · triangles ${r.triangles.toLocaleString()} · CPU ${cpuMs.toFixed(1)} ms/frame`);
  }
});

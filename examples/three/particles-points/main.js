// Particles with Points — a procedural spiral galaxy of ~80k glowing sprites.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color("#04040a");
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
camera.position.set(4, 3.2, 6);

// 1. A procedural sprite: a soft radial glow drawn on a canvas. Each point becomes this image.
function glowSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const sprite = glowSprite();

const params = { count: 80000, size: 0.035, radius: 5, branches: 4, spin: 1.1, randomness: 0.3, randomPower: 3, inside: "#ffb070", outside: "#5a6bff", rotationSpeed: 0.25 };
let points = null, base = null; // base = per-particle radius + starting angle + height (for animation)

// 2. Build a BufferGeometry with a position and a colour attribute per particle.
function build() {
  if (points) { scene.remove(points); points.geometry.dispose(); points.material.dispose(); }
  const n = params.count;
  const positions = new Float32Array(n * 3), colors = new Float32Array(n * 3);
  base = new Float32Array(n * 3);
  const cIn = new THREE.Color(params.inside), cOut = new THREE.Color(params.outside), c = new THREE.Color();
  const rnd = () => Math.pow(Math.random(), params.randomPower) * (Math.random() < 0.5 ? 1 : -1) * params.randomness;
  for (let i = 0; i < n; i++) {
    const r = Math.pow(Math.random(), 1.6) * params.radius;            // more stars near the core
    const arm = ((i % params.branches) / params.branches) * Math.PI * 2;
    const angle = arm + r * params.spin;                                 // arms curl outward
    const scatter = r * 0.6 + 0.3;
    base[i * 3] = Math.max(0.02, r + rnd() * scatter);                  // jitter the radius
    base[i * 3 + 1] = angle + rnd() / scatter;                           // jitter the angle
    base[i * 3 + 2] = rnd() * scatter * 0.6;                            // disk thickness
    c.copy(cIn).lerp(cOut, Math.min(1, r / params.radius));             // warm core → cool rim
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // 3. PointsMaterial: one camera-facing square per vertex, textured with our sprite.
  const mat = new THREE.PointsMaterial({
    size: params.size,
    sizeAttenuation: true,               // farther points look smaller (perspective)
    map: sprite,
    vertexColors: true,                  // use the colour attribute
    transparent: true,
    depthWrite: false,                   // don't let sprites hide each other's soft edges
    blending: THREE.AdditiveBlending,    // overlapping points add up → bright core
  });
  points = new THREE.Points(geo, mat);
  scene.add(points);
  animate(0);
}

// Differential rotation: inner stars orbit faster than outer ones (like a real galaxy).
function animate(t) {
  const p = points.geometry.attributes.position.array;
  for (let i = 0; i < params.count; i++) {
    const r = base[i * 3];
    const a = base[i * 3 + 1] + (t * params.rotationSpeed) / (0.4 + Math.sqrt(r));
    p[i * 3] = Math.cos(a) * r;
    p[i * 3 + 1] = base[i * 3 + 2];
    p[i * 3 + 2] = Math.sin(a) * r;
  }
  points.geometry.attributes.position.needsUpdate = true;
}

// Background star dust: a second Points object, static, tiny, no attenuation.
const dust = new Float32Array(4000 * 3);
for (let i = 0; i < dust.length; i += 3) {
  const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 40);
  dust.set([v.x, v.y, v.z], i);
}
scene.add(new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(dust, 3)),
  new THREE.PointsMaterial({ size: 1.2, sizeAttenuation: false, color: "#8088aa" })));

const gui = new GUI({ title: "Parameters" });
gui.add(params, "count", 1000, 200000, 1000).onFinishChange(build);
gui.add(params, "size", 0.005, 0.15, 0.001).onChange((v) => (points.material.size = v));
gui.add(params, "radius", 1, 10, 0.1).onFinishChange(build);
gui.add(params, "branches", 2, 10, 1).onFinishChange(build);
gui.add(params, "spin", -3, 3, 0.01).onFinishChange(build);
gui.add(params, "randomness", 0, 1.5, 0.01).onFinishChange(build);
gui.add(params, "randomPower", 1, 8, 0.1).onFinishChange(build);
gui.addColor(params, "inside").onFinishChange(build);
gui.addColor(params, "outside").onFinishChange(build);
gui.add(params, "rotationSpeed", 0, 2, 0.01);
build();

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

const timer = new THREE.Timer();
let t = 0;
renderer.setAnimationLoop((time) => {
  timer.update(time);
  t += timer.getDelta();
  animate(t);
  controls.update();
  renderer.render(scene, camera);
  PG.status(`${params.count.toLocaleString()} points · 1 draw call · additive blending`);
});

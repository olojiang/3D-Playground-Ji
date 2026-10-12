// Geometry & BufferGeometry — built-in shapes, plus one we build vertex by vertex.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VertexNormalsHelper } from "three/addons/helpers/VertexNormalsHelper.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
scene.fog = new THREE.Fog("#0b0b12", 12, 24);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 5.5, 9.5);

scene.add(new THREE.HemisphereLight("#bcd4ff", "#1a1020", 1.1));
const key = new THREE.DirectionalLight("#ffffff", 2.4);
key.position.set(5, 8, 4);
scene.add(key);
const rim = new THREE.DirectionalLight("#7f5cff", 1.5);
rim.position.set(-6, 2, -5);
scene.add(rim);

// ── 1. Built-in geometries: three.js generates the vertex data for you ──────────
const builtIns = [
  new THREE.BoxGeometry(0.9, 0.9, 0.9, 2, 2, 2),
  new THREE.SphereGeometry(0.55, 32, 16),
  new THREE.TorusGeometry(0.45, 0.17, 16, 48),
  new THREE.TorusKnotGeometry(0.38, 0.13, 128, 16),
  new THREE.ConeGeometry(0.5, 1, 32),
  new THREE.IcosahedronGeometry(0.6, 0),
  new THREE.CylinderGeometry(0.4, 0.4, 1, 32),
  new THREE.CapsuleGeometry(0.3, 0.5, 8, 16),
];
const palette = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#38d9a9", "#4dabf7", "#9775fa", "#f783ac"];
const ring = new THREE.Group();
builtIns.forEach((geo, i) => {
  const a = (i / builtIns.length) * Math.PI * 2;
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: palette[i], roughness: 0.35, metalness: 0.1 }));
  mesh.position.set(Math.cos(a) * 4.2, 0.6, Math.sin(a) * 4.2);
  ring.add(mesh);
});
scene.add(ring);

// ── 2. A custom BufferGeometry: a grid surface we fill in ourselves ─────────────
// Each vertex has a position (xyz), a normal (xyz, for lighting) and a uv (for textures).
// The index lists which three vertices form each triangle, so shared vertices are stored once.
const params = { segments: 48, amplitude: 0.35, frequency: 2.2, waveSpeed: 1, wireframe: false, showNormals: false, spin: 0.15 };
const SIZE = 3.2;
let surface, normalsHelper;

// Height function and its analytic slope (used for exact normals).
const height = (x, z, t) => params.amplitude * Math.sin(params.frequency * x + t) * Math.cos(params.frequency * z + t * 0.8);
function slope(x, z, t) {
  const k = params.frequency, A = params.amplitude;
  return [A * k * Math.cos(k * x + t) * Math.cos(k * z + t * 0.8), -A * k * Math.sin(k * x + t) * Math.sin(k * z + t * 0.8)];
}

function buildSurface(n) {
  const count = (n + 1) * (n + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  for (let j = 0, v = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++, v++) {
      uvs[v * 2] = i / n;          // u runs left → right
      uvs[v * 2 + 1] = 1 - j / n;  // v runs bottom → top
    }
  }
  // Two triangles per grid cell. Counter-clockwise order (seen from above) = front face.
  const indices = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + (n + 1), d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices); // three.js picks Uint16 or Uint32 automatically
  return geo;
}

// Rewrite positions + normals in place every frame, then flag them for re-upload.
function animateSurface(geo, n, t) {
  const p = geo.attributes.position.array, nr = geo.attributes.normal.array;
  for (let j = 0, v = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++, v++) {
      const x = (i / n - 0.5) * SIZE, z = (j / n - 0.5) * SIZE;
      const [dx, dz] = slope(x, z, t);
      const len = Math.hypot(dx, 1, dz);
      p[v * 3] = x; p[v * 3 + 1] = height(x, z, t); p[v * 3 + 2] = z;
      nr[v * 3] = -dx / len; nr[v * 3 + 1] = 1 / len; nr[v * 3 + 2] = -dz / len;
    }
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.normal.needsUpdate = true;
  geo.computeBoundingSphere();
}

// A small canvas texture so you can SEE the uv coordinates on the surface.
function uvTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 256, 256, 0);
  grad.addColorStop(0, "#ff4d8d"); grad.addColorStop(0.5, "#7b5cff"); grad.addColorStop(1, "#22d3ee");
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const surfaceMat = new THREE.MeshStandardMaterial({ map: uvTexture(), roughness: 0.4, metalness: 0.05, side: THREE.DoubleSide });

function rebuild() {
  if (surface) { scene.remove(surface, normalsHelper); surface.geometry.dispose(); normalsHelper.dispose(); }
  surface = new THREE.Mesh(buildSurface(params.segments), surfaceMat);
  surface.position.y = 0.4;
  animateSurface(surface.geometry, params.segments, 0);
  normalsHelper = new VertexNormalsHelper(surface, 0.15, "#ffe066");
  normalsHelper.visible = params.showNormals;
  scene.add(surface, normalsHelper);
  const g = surface.geometry;
  PG.status(`custom surface: ${g.attributes.position.count} vertices · ${g.index.count / 3} triangles · index ${g.index.array.constructor.name}`);
}
rebuild();

const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: "#12121c", roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.2;
scene.add(floor);

const gui = new GUI({ title: "Parameters" });
gui.add(params, "segments", 2, 120, 1).onFinishChange(rebuild);
gui.add(params, "amplitude", 0, 0.8, 0.01);
gui.add(params, "frequency", 0.5, 5, 0.1);
gui.add(params, "waveSpeed", 0, 4, 0.1);
gui.add(params, "wireframe").onChange((v) => { surfaceMat.wireframe = v; ring.children.forEach((m) => (m.material.wireframe = v)); });
gui.add(params, "showNormals").onChange((v) => (normalsHelper.visible = v));
gui.add(params, "spin", 0, 1, 0.01);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 0.4, 0);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

const timer = new THREE.Timer();
let waveTime = 0;
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  waveTime += dt * params.waveSpeed;
  animateSurface(surface.geometry, params.segments, waveTime);
  if (params.showNormals) normalsHelper.update();
  ring.rotation.y += dt * params.spin;
  ring.children.forEach((m, i) => { m.rotation.x += dt * 0.5; m.rotation.y += dt * (0.3 + i * 0.05); });
  controls.update();
  renderer.render(scene, camera);
});

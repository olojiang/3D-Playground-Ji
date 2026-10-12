// Raycasting — turn a mouse position into "which 3D object is under the pointer?".
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
scene.fog = new THREE.Fog("#0b0b12", 14, 30);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 7, 11);

scene.add(new THREE.HemisphereLight("#cfe0ff", "#1a1422", 1.1));
const key = new THREE.DirectionalLight("#ffffff", 2);
key.position.set(4, 9, 5);
scene.add(key);

// A field of pickable objects. Each gets its OWN material so we can recolour one at a time.
const geos = [new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.SphereGeometry(0.42, 32, 16), new THREE.ConeGeometry(0.4, 0.9, 24), new THREE.TorusGeometry(0.32, 0.13, 16, 40), new THREE.OctahedronGeometry(0.48)];
const pickables = [];
const N = 9;
for (let i = 0; i < N; i++) {
  for (let j = 0; j < N; j++) {
    const hue = 0.55 + ((i + j) / (2 * N)) * 0.35;
    const mesh = new THREE.Mesh(geos[(i * 3 + j) % geos.length], new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue % 1, 0.55, 0.55), roughness: 0.4, metalness: 0.1 }));
    mesh.position.set((i - (N - 1) / 2) * 1.25, 0.5, (j - (N - 1) / 2) * 1.25);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    mesh.name = `item ${i}-${j}`;
    mesh.userData.spin = 0.2 + Math.random() * 0.6;
    scene.add(mesh);
    pickables.push(mesh);
  }
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: "#14141e", roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Visual feedback for the hit: a dot at the point and a short line along the surface normal.
const hitDot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 8), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
const normalLine = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.6, "#ffe066", 0.15, 0.08);
scene.add(hitDot, normalLine);

// ── The raycaster ─────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
// Pointer in NDC (normalized device coordinates): x and y both go from -1 to +1,
// with +y UP (the opposite of CSS pixels, where y grows downward).
const pointer = new THREE.Vector2(0.18, -0.12); // start slightly off-centre so a hover is visible
let pointerInside = true;

function toNDC(e) {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}
canvas.addEventListener("pointermove", (e) => { toNDC(e); pointerInside = true; });
canvas.addEventListener("pointerleave", () => (pointerInside = false));

// Click vs drag: OrbitControls also uses the pointer, so only treat tiny movements as clicks.
let downAt = null;
canvas.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
canvas.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
  toNDC(e);
  select(hovered);
});

const params = { hoverColor: "#ffffff", selectColor: "#ff4fa3", showRay: true, clearSelection: () => select(null) };
let hovered = null, selected = null;

function paint(obj) {
  if (!obj) return;
  const m = obj.material;
  if (obj === selected) { m.emissive.set(params.selectColor); m.emissiveIntensity = 0.6; }
  else if (obj === hovered) { m.emissive.set(params.hoverColor); m.emissiveIntensity = 0.25; }
  else { m.emissive.set("#000000"); }
  obj.scale.setScalar(obj === selected ? 1.25 : obj === hovered ? 1.1 : 1);
}
function select(obj) {
  const prev = selected;
  selected = obj === selected ? null : obj; // clicking the selection again deselects it
  paint(prev); paint(selected);
}

select(pickables[Math.floor(pickables.length / 2)]); // start with the centre item selected

const gui = new GUI({ title: "Parameters" });
gui.addColor(params, "hoverColor");
gui.addColor(params, "selectColor").onChange(() => paint(selected));
gui.add(params, "showRay").name("show hit point + normal");
gui.add(params, "clearSelection");

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;

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
  for (const m of pickables) m.rotation.y += dt * m.userData.spin;
  controls.update();

  // 1. Build a ray from the camera through the pointer. 2. Test it against our objects.
  raycaster.setFromCamera(pointer, camera);
  const hits = pointerInside ? raycaster.intersectObjects(pickables, false) : []; // sorted nearest-first
  const hit = hits[0] ?? null;
  if ((hit?.object ?? null) !== hovered) {
    const prev = hovered;
    hovered = hit?.object ?? null;
    paint(prev); paint(hovered);
    canvas.style.cursor = hovered ? "pointer" : "";
  }
  hitDot.visible = normalLine.visible = !!hit && params.showRay;
  if (hit) {
    hitDot.position.copy(hit.point);
    // hit.normal is in the object's local space → transform it to world space.
    const n = hit.normal.clone().transformDirection(hit.object.matrixWorld);
    normalLine.position.copy(hit.point);
    normalLine.setDirection(n);
  }
  const h = hit ? `${hit.object.name} · distance ${hit.distance.toFixed(2)} · face ${hit.faceIndex}` : "nothing";
  PG.status(`pointer NDC (${pointer.x.toFixed(2)}, ${pointer.y.toFixed(2)})  ·  hits ${hits.length}  ·  nearest: ${h}\nselected: ${selected ? selected.name : "none (click an object)"}`);
  renderer.render(scene, camera);
});

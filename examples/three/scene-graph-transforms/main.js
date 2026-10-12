// Scene graph & transforms — a solar system built from nested pivots.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#07070d");
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
camera.position.set(0, 9, 15);

// Background stars (decoration).
const starPos = new Float32Array(3000 * 3);
for (let i = 0; i < starPos.length; i++) starPos[i] = (Math.random() - 0.5) * 300;
const stars = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ size: 0.6, color: "#9aa4c8", sizeAttenuation: true })));

scene.add(new THREE.AmbientLight("#ffffff", 0.06));

// ── The hierarchy ─────────────────────────────────────────────────────────────
// solarSystem (Object3D)
//  ├─ sun (Mesh) + PointLight
//  └─ earthOrbit (pivot, rotates) → earthFrame (offset along x)
//        ├─ earth (Mesh, spins on its own axis)
//        └─ moonOrbit (pivot, rotates) → moon (Mesh, offset along x)
// Rotating a pivot carries everything below it. That is the whole trick.
const solarSystem = new THREE.Object3D();
scene.add(solarSystem);

const sun = new THREE.Mesh(new THREE.SphereGeometry(1.4, 64, 32), new THREE.MeshBasicMaterial({ color: "#ffcf5a" }));
const glow = new THREE.Mesh(new THREE.SphereGeometry(1.75, 64, 32), new THREE.MeshBasicMaterial({ color: "#ff9a2e", transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
sun.add(glow);
solarSystem.add(sun);
solarSystem.add(new THREE.PointLight("#fff2d6", 220, 0, 2));

const sphere = (r, color, extra = {}) => new THREE.Mesh(new THREE.SphereGeometry(r, 48, 24), new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }));
const orbitLine = (radius, color = "#3a3a55") => {
  const pts = new THREE.EllipseCurve(0, 0, radius, radius).getPoints(128).map((p) => new THREE.Vector3(p.x, 0, p.y));
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }));
};

// A planet = pivot at the parent's origin + a frame pushed out to the orbit radius.
function addPlanet(parent, { radius, size, color, speed, tilt = 0, extra }) {
  const pivot = new THREE.Object3D();          // rotation.y of this = position along the orbit
  pivot.rotation.y = Math.random() * Math.PI * 2;
  parent.add(pivot);
  const frame = new THREE.Object3D();          // local position (radius, 0, 0) relative to the pivot
  frame.position.x = radius;
  frame.rotation.z = tilt;                     // axial tilt lives here so the spin axis tilts too
  pivot.add(frame);
  const body = sphere(size, color, extra);
  frame.add(body);
  parent.add(orbitLine(radius));
  return { pivot, frame, body, speed };
}

const planets = [
  addPlanet(solarSystem, { radius: 3, size: 0.25, color: "#b5a49a", speed: 1.6 }),
  addPlanet(solarSystem, { radius: 4.6, size: 0.42, color: "#e9b872", speed: 1.1 }),
  addPlanet(solarSystem, { radius: 6.6, size: 0.48, color: "#3e8ef7", speed: 0.75, tilt: 0.41, extra: { emissive: "#0a1a40" } }),
  addPlanet(solarSystem, { radius: 9.4, size: 0.85, color: "#d9a066", speed: 0.4, tilt: 0.47 }),
];
const earth = planets[2], saturn = planets[3];

// Moon: its pivot is a child of Earth's FRAME, so it follows Earth around the Sun.
const moon = addPlanet(earth.frame, { radius: 0.95, size: 0.13, color: "#cfcfd8", speed: 3.2 });
// Saturn's ring is a child of Saturn's frame: it inherits the tilt but not the spin.
const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.7, 96), new THREE.MeshStandardMaterial({ color: "#c8b48a", side: THREE.DoubleSide, transparent: true, opacity: 0.75 }));
ring.rotation.x = -Math.PI / 2;
saturn.frame.add(ring);

// Axes helpers on each frame show every node's LOCAL coordinate system.
const axes = [];
for (const p of [...planets, moon]) { const a = new THREE.AxesHelper(p.body.geometry.parameters.radius * 2.2); a.visible = false; p.frame.add(a); axes.push(a); }

// A marker that lives directly in the scene and is moved to the Moon's WORLD position.
const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.26, 48), new THREE.MeshBasicMaterial({ color: "#7cf2c2", side: THREE.DoubleSide }));
scene.add(marker);

// ── GUI ──────────────────────────────────────────────────────────────────────
const params = { speed: 1, showAxes: false, showOrbits: true, systemScale: 1, earthRadius: 6.6, followMoon: true };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "speed", 0, 5, 0.01).name("time speed");
gui.add(params, "systemScale", 0.4, 1.6, 0.01).name("scale (root)").onChange((v) => solarSystem.scale.setScalar(v));
gui.add(params, "earthRadius", 5.5, 8, 0.01).name("earth frame.position.x").onChange((v) => (earth.frame.position.x = v));
gui.add(params, "showAxes").name("local axes").onChange((v) => axes.forEach((a) => (a.visible = v)));
gui.add(params, "showOrbits").onChange((v) => scene.traverse((o) => { if (o.isLineLoop) o.visible = v; }));
gui.add(params, "followMoon").name("world-space marker");

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
const world = new THREE.Vector3();
let frameCount = 0;
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta() * params.speed;
  for (const p of [...planets, moon]) {
    p.pivot.rotation.y += dt * p.speed * 0.3; // orbit: rotate the pivot
    p.body.rotation.y += dt * 1.5;            // day: rotate the body itself
  }
  sun.rotation.y += dt * 0.1;

  // Local vs world: moon.body.position is (0,0,0) in its frame, but its world position moves.
  scene.updateMatrixWorld();
  moon.body.getWorldPosition(world);
  marker.visible = params.followMoon;
  marker.position.copy(world);
  marker.quaternion.copy(camera.quaternion); // billboard: face the camera
  if (frameCount++ % 10 === 0) {
    const l = moon.frame.position;
    PG.status(`moon  local (frame.position): ${l.x.toFixed(2)}, ${l.y.toFixed(2)}, ${l.z.toFixed(2)}\nmoon  world (getWorldPosition): ${world.x.toFixed(2)}, ${world.y.toFixed(2)}, ${world.z.toFixed(2)}`);
  }
  controls.update();
  renderer.render(scene, camera);
});

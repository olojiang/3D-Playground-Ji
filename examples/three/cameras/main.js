// Cameras — perspective vs orthographic, the view frustum, and near/far clipping.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
scene.add(new THREE.HemisphereLight("#cfdcff", "#1a1420", 1.2));
const key = new THREE.DirectionalLight("#ffffff", 1.8);
key.position.set(5, 10, 3);
scene.add(key);

// A field of columns at many depths, so clipping and perspective are easy to read.
const colGeo = new THREE.BoxGeometry(0.5, 1, 0.5);
for (let x = -5; x <= 5; x++) {
  for (let z = -5; z <= 5; z++) {
    if (Math.abs(x) < 2 && Math.abs(z) < 2) continue;
    const h = 0.4 + Math.random() * 1.8;
    const m = new THREE.Mesh(colGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.55 + (x + z) * 0.02, 0.5, 0.5), roughness: 0.5 }));
    m.scale.y = h;
    m.position.set(x * 1.2, h / 2, z * 1.2);
    scene.add(m);
  }
}
const hero = new THREE.Mesh(new THREE.TorusKnotGeometry(0.6, 0.22, 160, 24), new THREE.MeshStandardMaterial({ color: "#ff8fab", roughness: 0.3, metalness: 0.2 }));
hero.position.y = 1.1;
scene.add(hero);
scene.add(new THREE.GridHelper(16, 32, "#3a3a50", "#222230"));

// ── Two "subject" cameras we can switch between ────────────────────────────────
// Perspective: a pyramid-shaped frustum — far things look smaller.
const persp = new THREE.PerspectiveCamera(50, 1, 1, 15);
// Orthographic: a box-shaped frustum — size does not change with distance.
const ortho = new THREE.OrthographicCamera(-4, 4, 3, -3, 1, 15);
// CameraHelper draws a camera's frustum (yellow/red/cyan lines) so we can see it from outside.
const perspHelper = new THREE.CameraHelper(persp);
const orthoHelper = new THREE.CameraHelper(ortho);
scene.add(perspHelper, orthoHelper);

// The observer: a second camera that watches the subject camera from far away.
const observer = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
observer.position.set(16, 14, 18);
const controls = new OrbitControls(observer, canvas);
controls.enableDamping = true;

const params = { type: "perspective", view: "split", fov: 50, near: 1, far: 15, orthoHeight: 8, zoom: 1, orbit: true };
let subject = persp;
let subjectAspect = 1;

function updateCameras() {
  subject = params.type === "perspective" ? persp : ortho;
  persp.fov = params.fov;
  persp.aspect = subjectAspect;
  for (const cam of [persp, ortho]) { cam.near = params.near; cam.far = Math.max(params.far, params.near + 0.1); cam.zoom = params.zoom; }
  // An orthographic camera is defined by a box: left/right/top/bottom in world units.
  const hh = params.orthoHeight / 2;
  Object.assign(ortho, { top: hh, bottom: -hh, left: -hh * subjectAspect, right: hh * subjectAspect });
  persp.updateProjectionMatrix(); // REQUIRED after changing any projection parameter
  ortho.updateProjectionMatrix();
  perspHelper.visible = subject === persp;
  orthoHelper.visible = subject === ortho;
  perspHelper.update(); orthoHelper.update();
}

const gui = new GUI({ title: "Parameters" });
gui.add(params, "type", ["perspective", "orthographic"]).onChange(updateCameras);
gui.add(params, "view", ["split", "observer", "subject camera"]).onChange(resize);
gui.add(params, "fov", 10, 120, 1).name("fov (perspective)").onChange(updateCameras);
gui.add(params, "orthoHeight", 1, 20, 0.1).name("height (orthographic)").onChange(updateCameras);
gui.add(params, "near", 0.1, 10, 0.1).onChange(updateCameras);
gui.add(params, "far", 1, 30, 0.1).onChange(updateCameras);
gui.add(params, "zoom", 0.2, 4, 0.01).onChange(updateCameras);
gui.add(params, "orbit").name("move subject camera");

let W = 1, H = 1;
function resize() {
  W = canvas.clientWidth; H = canvas.clientHeight;
  renderer.setSize(W, H, false);
  const split = params.view === "split";
  observer.aspect = (split ? W / 2 : W) / H;
  observer.updateProjectionMatrix();
  subjectAspect = (split ? W / 2 : W) / H;
  updateCameras();
}
new ResizeObserver(resize).observe(canvas);
resize();

// Draw one camera into one rectangle of the canvas (CSS pixels, origin bottom-left).
function view(cam, x, w, showHelper) {
  perspHelper.visible = showHelper && subject === persp;
  orthoHelper.visible = showHelper && subject === ortho;
  renderer.setViewport(x, 0, w, H);
  renderer.setScissor(x, 0, w, H);
  renderer.render(scene, cam);
}

const timer = new THREE.Timer();
let t = 0, frame = 0;
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  if (params.orbit) t += dt * 0.3;
  for (const cam of [persp, ortho]) { cam.position.set(Math.cos(t) * 9.5, 4, Math.sin(t) * 9.5); cam.lookAt(0, 0.6, 0); }
  perspHelper.update(); orthoHelper.update(); // helpers follow the camera's matrices
  hero.rotation.y += dt * 0.6;
  controls.update();

  renderer.setScissorTest(true);
  if (params.view === "split") {
    view(observer, 0, W / 2, true);
    view(subject, W / 2, W / 2, false);
    renderer.setScissor(W / 2 - 1, 0, 2, H); // a thin divider between the two views
    renderer.setClearColor("#2a2a3a");
    renderer.clear();
    renderer.setClearColor("#000000");
  }
  else if (params.view === "observer") view(observer, 0, W, true);
  else view(subject, 0, W, false);
  renderer.setScissorTest(false);

  if (frame++ % 10 === 0) {
    const desc = subject.isPerspectiveCamera ? `fov ${subject.fov}°` : `box ${(subject.right - subject.left).toFixed(1)}×${(subject.top - subject.bottom).toFixed(1)}`;
    PG.status(`${params.view === "split" ? "left: observer (sees the frustum) · right: what the subject camera sees\n" : ""}${subject.type} · ${desc} · near ${subject.near} · far ${subject.far} · zoom ${subject.zoom}`);
  }
});

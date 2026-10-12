// Materials — the same shape, seven different shading models side by side.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 2.2, 13);

// An environment map gives Standard/Physical something to reflect (metals look black without one).
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envMap;
scene.environmentIntensity = 0.35;

// Lights: Basic and Normal ignore them; the others react in their own way.
scene.add(new THREE.AmbientLight("#ffffff", 0.15));
const key = new THREE.DirectionalLight("#ffffff", 2.2);
key.position.set(3, 5, 6);
scene.add(key);
const orbitLight = new THREE.PointLight("#ff7ac6", 30, 0, 2); // moving coloured highlight
scene.add(orbitLight);
orbitLight.add(new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: "#ff7ac6" })));

// Toon needs a gradient map: a tiny texture whose few texels become hard light bands.
const toonRamp = new THREE.DataTexture(new Uint8Array([40, 40, 40, 255, 130, 130, 130, 255, 255, 255, 255, 255]), 3, 1);
toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter; // Nearest = no blending between bands
toonRamp.needsUpdate = true;

const params = {
  color: "#4f8cff", roughness: 0.3, metalness: 0.0, shininess: 80, clearcoat: 0.8, sheen: 0.0,
  envIntensity: 0.35, flatShading: false, wireframe: false, rotate: true,
};
const c = params.color;
const materials = [
  ["MeshBasic", new THREE.MeshBasicMaterial({ color: c })],                        // unlit, flat colour
  ["MeshLambert", new THREE.MeshLambertMaterial({ color: c })],                    // diffuse only, per-pixel
  ["MeshPhong", new THREE.MeshPhongMaterial({ color: c, shininess: params.shininess, specular: "#444" })], // + specular highlight
  ["MeshStandard", new THREE.MeshStandardMaterial({ color: c, roughness: params.roughness, metalness: params.metalness })], // PBR
  ["MeshPhysical", new THREE.MeshPhysicalMaterial({ color: c, roughness: params.roughness, metalness: params.metalness, clearcoat: params.clearcoat, clearcoatRoughness: 0.05 })],
  ["MeshToon", new THREE.MeshToonMaterial({ color: c, gradientMap: toonRamp })],   // cel shading
  ["MeshNormal", new THREE.MeshNormalMaterial()],                                  // normal → RGB, debug view
];

// Text labels drawn into a canvas and shown on a Sprite (always faces the camera).
function label(text) {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 64;
  const g = cv.getContext("2d");
  g.font = "600 26px ui-sans-serif, -apple-system, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "rgba(230,230,240,0.9)";
  g.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.6, 0.4, 1);
  return s;
}

const geometry = new THREE.TorusKnotGeometry(0.42, 0.15, 160, 24);
const meshes = [];
const spacing = 1.55;
materials.forEach(([name, mat], i) => {
  const x = (i - (materials.length - 1) / 2) * spacing;
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, 0.8, 0);
  scene.add(mesh);
  meshes.push(mesh);
  const l = label(name);
  l.position.set(x, -0.15, 0);
  scene.add(l);
  // a small pedestal under each sample
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.08, 48), new THREE.MeshStandardMaterial({ color: "#1b1b28", roughness: 0.6 }));
  ped.position.set(x, 0.12, 0);
  scene.add(ped);
});

// GUI: every change is applied to whichever materials actually have that property.
const each = (fn) => materials.forEach(([, m]) => fn(m));
const gui = new GUI({ title: "Parameters" });
gui.addColor(params, "color").onChange((v) => each((m) => m.color && m.color.set(v)));
const pbr = gui.addFolder("PBR (Standard / Physical)");
pbr.add(params, "roughness", 0, 1, 0.01).onChange((v) => each((m) => "roughness" in m && (m.roughness = v)));
pbr.add(params, "metalness", 0, 1, 0.01).onChange((v) => each((m) => "metalness" in m && (m.metalness = v)));
pbr.add(params, "clearcoat", 0, 1, 0.01).onChange((v) => (materials[4][1].clearcoat = v));
pbr.add(params, "sheen", 0, 1, 0.01).onChange((v) => (materials[4][1].sheen = v));
pbr.add(params, "envIntensity", 0, 2, 0.01).onChange((v) => (scene.environmentIntensity = v));
gui.add(params, "shininess", 1, 300, 1).name("shininess (Phong)").onChange((v) => (materials[2][1].shininess = v));
gui.add(params, "flatShading").onChange((v) => each((m) => { if ("flatShading" in m) { m.flatShading = v; m.needsUpdate = true; } }));
gui.add(params, "wireframe").onChange((v) => each((m) => (m.wireframe = v)));
gui.add(params, "rotate");

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 0.6, 0);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Pull the camera back on narrow screens so all seven samples stay in view.
  camera.position.setLength(Math.max(11, 13 * (1.6 / camera.aspect)));
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const t = timer.getElapsed(), dt = timer.getDelta();
  orbitLight.position.set(Math.sin(t * 0.7) * 5.5, 1.8 + Math.sin(t * 1.3) * 0.6, 2.2);
  if (params.rotate) meshes.forEach((m) => (m.rotation.y += dt * 0.4));
  controls.update();
  renderer.render(scene, camera);
});

// PBR & environment lighting — image-based lighting, MeshPhysicalMaterial layers, tone mapping.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1;

const scene = new THREE.Scene();
const DARK = new THREE.Color("#0b0b12");
scene.background = DARK;
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(1.0, 2.2, 8.5);

// 1. Environment: render a procedural room once, then PMREM pre-filters it into
//    mip levels for every roughness. scene.environment lights ALL PBR materials.
const pmrem = new THREE.PMREMGenerator(renderer);
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
scene.environment = envTexture;

// A soft key light adds a defined highlight on top of the image-based lighting.
const key = new THREE.DirectionalLight("#ffffff", 0.8);
key.position.set(3, 6, 4);
scene.add(key);

// Something colourful behind the glass, so transmission (refraction) has something to bend.
const backdrop = new THREE.Group();
for (let i = 0; i < 14; i++) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.2, 0.25), new THREE.MeshStandardMaterial({ color: "#000", emissive: new THREE.Color().setHSL(i / 14, 0.9, 0.45), emissiveIntensity: 1.6 }));
  bar.position.set((i - 6.5) * 0.6, 1.6, -3);
  bar.material.envMapIntensity = 0;
  backdrop.add(bar);
}
scene.add(backdrop);

const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ color: "#0d0d14", roughness: 0.55, metalness: 0, envMapIntensity: 0.2 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// 2. Three MeshPhysicalMaterial "layers", each one an extra term on top of Standard PBR.
const carPaint = new THREE.MeshPhysicalMaterial({ color: "#b0102a", metalness: 0.6, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.03 });
const glass = new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0, roughness: 0.04, transmission: 1, thickness: 1.2, ior: 1.5, attenuationColor: "#bfe8ff", attenuationDistance: 2.5 });
const bubble = new THREE.MeshPhysicalMaterial({ color: "#222228", metalness: 1, roughness: 0.18, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [120, 480] });

const pedestal = new THREE.CylinderGeometry(0.75, 0.85, 0.3, 64);
const pedMat = new THREE.MeshStandardMaterial({ color: "#1d1d28", roughness: 0.5, metalness: 0.3 });
const samples = [
  [new THREE.SphereGeometry(0.85, 96, 48), carPaint, -2.3],
  [new THREE.SphereGeometry(0.85, 96, 48), glass, 0],
  [new THREE.TorusKnotGeometry(0.5, 0.2, 200, 32), bubble, 2.3],
].map(([geo, mat, x]) => {
  const ped = new THREE.Mesh(pedestal, pedMat);
  ped.position.set(x, 0.15, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 1.25, 0);
  scene.add(ped, mesh);
  return mesh;
});

// ── GUI ──────────────────────────────────────────────────────────────────────
const TONE = { None: THREE.NoToneMapping, Linear: THREE.LinearToneMapping, Reinhard: THREE.ReinhardToneMapping, Cineon: THREE.CineonToneMapping, ACESFilmic: THREE.ACESFilmicToneMapping, AgX: THREE.AgXToneMapping, Neutral: THREE.NeutralToneMapping };
const params = { toneMapping: "AgX", exposure: 1, envIntensity: 1, showEnvironment: false, blur: 0.4, rotate: true };
const gui = new GUI({ title: "Parameters" });
const fr = gui.addFolder("Renderer & environment");
fr.add(params, "toneMapping", Object.keys(TONE)).onChange((v) => {
  renderer.toneMapping = TONE[v];
  PG.status(`toneMapping: ${v} · exposure ${params.exposure}`);
});
fr.add(params, "exposure", 0.1, 3, 0.01).onChange((v) => (renderer.toneMappingExposure = v));
fr.add(params, "envIntensity", 0, 3, 0.01).onChange((v) => (scene.environmentIntensity = v));
fr.add(params, "showEnvironment").name("env as background").onChange((v) => (scene.background = v ? envTexture : DARK));
fr.add(params, "blur", 0, 1, 0.01).name("backgroundBlurriness").onChange((v) => (scene.backgroundBlurriness = v));
scene.backgroundBlurriness = params.blur;
const fc = gui.addFolder("Clearcoat (car paint)");
fc.addColor({ c: "#b0102a" }, "c").name("color").onChange((v) => carPaint.color.set(v));
fc.add(carPaint, "roughness", 0, 1, 0.01).name("base roughness");
fc.add(carPaint, "clearcoat", 0, 1, 0.01);
fc.add(carPaint, "clearcoatRoughness", 0, 1, 0.01);
const ft = gui.addFolder("Transmission (glass)");
ft.add(glass, "transmission", 0, 1, 0.01);
ft.add(glass, "roughness", 0, 1, 0.01);
ft.add(glass, "thickness", 0, 4, 0.01);
ft.add(glass, "ior", 1, 2.333, 0.01);
ft.add(glass, "dispersion", 0, 10, 0.1);
const fi = gui.addFolder("Iridescence (thin film)");
fi.add(bubble, "iridescence", 0, 1, 0.01);
fi.add(bubble, "iridescenceIOR", 1, 2.333, 0.01);
fi.add(bubble, "roughness", 0, 1, 0.01);
fi.add(bubble.iridescenceThicknessRange, "1", 100, 1200, 1).name("film thickness max (nm)");
gui.add(params, "rotate");
[fc, ft, fi].forEach((f) => f.close());
PG.status(`toneMapping: ${params.toneMapping} · environment: RoomEnvironment via PMREMGenerator`);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(1.0, 1.0, 0); // offset so the GUI does not cover the samples
controls.maxPolarAngle = Math.PI * 0.49;

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
  if (params.rotate) samples.forEach((m) => { m.rotation.y += dt * 0.4; m.rotation.x += dt * 0.1; });
  controls.update();
  renderer.render(scene, camera);
});

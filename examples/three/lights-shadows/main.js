// Lights & Shadows — five light types, their helpers, and shadow maps.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// 1. Turn shadows on at the renderer. PCFShadowMap + light.shadow.radius gives soft edges
//    (PCFSoftShadowMap is deprecated since r186 and falls back to PCF).
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(7, 6, 9);

// ── The set: a floor that RECEIVES shadows and objects that CAST them ───────────
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: "#1c1c26", roughness: 0.85 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const props = new THREE.Group();
const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.24, 160, 24), mat("#e8e6f0"));
knot.position.y = 1.6;
props.add(knot);
[["#ff6b6b", -2.6, 1.2], ["#4dabf7", 2.4, -1.4], ["#ffd43b", 1.8, 2.2], ["#69db7c", -2, -2.4]].forEach(([c, x, z], i) => {
  const m = new THREE.Mesh(i % 2 ? new THREE.BoxGeometry(1, 1, 1) : new THREE.SphereGeometry(0.6, 48, 24), mat(c));
  m.position.set(x, i % 2 ? 0.5 : 0.6, z);
  props.add(m);
});
for (let i = 0; i < 10; i++) { // a ring of thin pillars throws nice long shadows
  const a = (i / 10) * Math.PI * 2;
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 16), mat("#8b8ba0"));
  p.position.set(Math.cos(a) * 4.6, 1.2, Math.sin(a) * 4.6);
  props.add(p);
}
props.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
scene.add(props);

// ── The lights ────────────────────────────────────────────────────────────────
// Ambient: equal light everywhere, no direction, no shadows.
const ambient = new THREE.AmbientLight("#ffffff", 0.08);
// Hemisphere: sky colour from above, ground colour from below. Cheap "outdoor" fill.
const hemi = new THREE.HemisphereLight("#8fb6ff", "#2a1a14", 0.35);
// Directional: parallel rays (the sun). Its shadow uses an ORTHOGRAPHIC shadow camera.
const sun = new THREE.DirectionalLight("#fff1dc", 1.6);
sun.position.set(-5, 8, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 25 });
sun.shadow.bias = -0.0005;
sun.shadow.radius = 4;
// Point: shines in all directions from one spot (a bulb). Shadow = 6 renders (cube map).
const bulb = new THREE.PointLight("#ff8a3d", 25, 12, 2);
bulb.castShadow = true;
bulb.shadow.mapSize.set(512, 512);
bulb.shadow.radius = 4;
bulb.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8), new THREE.MeshBasicMaterial({ color: "#ffb37a" })));
// Spot: a cone with soft edge (penumbra). Shadow uses a PERSPECTIVE shadow camera.
const spot = new THREE.SpotLight("#7fd4ff", 60, 20, Math.PI / 8, 0.4, 1.5);
spot.position.set(5, 7, -2);
spot.castShadow = true;
spot.shadow.mapSize.set(1024, 1024);
spot.shadow.radius = 4;
scene.add(spot.target); // the target must be in the scene for its matrix to update
scene.add(ambient, hemi, sun, bulb, spot);

// Helpers draw where a light is and where it points.
const helpers = {
  sun: new THREE.DirectionalLightHelper(sun, 1),
  sunShadow: new THREE.CameraHelper(sun.shadow.camera),
  bulb: new THREE.PointLightHelper(bulb, 0.3),
  spot: new THREE.SpotLightHelper(spot),
};
Object.values(helpers).forEach((h) => { h.visible = false; scene.add(h); });
helpers.spot.visible = true;

// ── GUI ──────────────────────────────────────────────────────────────────────
const params = { animate: true, helpers: true, shadowCamera: false, shadowType: "PCF", radius: 4, mapSize: 2048 };
const gui = new GUI({ title: "Parameters" });
const lightFolder = (name, light, helperKeys = []) => {
  const f = gui.addFolder(name);
  f.add(light, "visible").name("on");
  f.add(light, "intensity", 0, name === "Spot" ? 150 : name === "Point" ? 60 : 4, 0.01);
  if (light.color) f.addColor({ c: "#" + light.color.getHexString() }, "c").name("color").onChange((v) => light.color.set(v));
  if (light.castShadow !== undefined && !light.isAmbientLight && !light.isHemisphereLight) f.add(light, "castShadow");
  f.close();
  return f;
};
lightFolder("Ambient", ambient);
lightFolder("Hemisphere", hemi);
lightFolder("Directional", sun);
lightFolder("Point", bulb);
const sf = lightFolder("Spot", spot);
sf.add(spot, "angle", 0.1, Math.PI / 3, 0.01);
sf.add(spot, "penumbra", 0, 1, 0.01);
const sh = gui.addFolder("Shadows");
sh.add(params, "shadowType", ["Basic", "PCF", "VSM"]).onChange((v) => {
  renderer.shadowMap.type = { Basic: THREE.BasicShadowMap, PCF: THREE.PCFShadowMap, VSM: THREE.VSMShadowMap }[v];
});
sh.add(params, "radius", 0, 12, 0.5).name("blur radius").onChange((v) => [sun, bulb, spot].forEach((l) => (l.shadow.radius = v)));
sh.add(params, "mapSize", [256, 512, 1024, 2048, 4096]).name("sun mapSize").onChange((v) => {
  sun.shadow.mapSize.set(v, v);
  sun.shadow.map?.dispose(); sun.shadow.map = null; // force the shadow map to be re-created
});
sh.add(params, "shadowCamera").name("show sun shadow camera").onChange((v) => (helpers.sunShadow.visible = v));
gui.add(params, "helpers").name("light helpers").onChange((v) => { helpers.sun.visible = helpers.bulb.visible = helpers.spot.visible = v; });
gui.add(params, "animate");
helpers.sun.visible = helpers.bulb.visible = true;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
controls.maxPolarAngle = Math.PI * 0.48;

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
  if (params.animate) t += timer.getDelta();
  bulb.position.set(Math.cos(t * 0.8) * 2.6, 1.2 + Math.sin(t * 1.7) * 0.4, Math.sin(t * 0.8) * 2.6);
  spot.target.position.set(Math.sin(t * 0.5) * 2, 0, Math.cos(t * 0.5) * 2);
  knot.rotation.y = t * 0.6;
  helpers.spot.update();
  helpers.sun.update();
  controls.update();
  renderer.render(scene, camera);
});

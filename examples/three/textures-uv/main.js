// Textures & UVs — procedural textures, how UVs map them, and every sampling knob.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
scene.fog = new THREE.Fog("#0b0b12", 8, 26);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(1.2, 2.4, 7.4);

scene.add(new THREE.HemisphereLight("#ffffff", "#30304a", 1.6));
const key = new THREE.DirectionalLight("#ffffff", 1.6);
key.position.set(3, 6, 5);
scene.add(key);

// ── Texture 1: CanvasTexture — draw with the 2D canvas API, upload as a texture ──
function makeUvGrid() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  const n = 8, s = 512 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // hue follows u (x), lightness follows v (y): you can read the UV from the colour
      g.fillStyle = `hsl(${(x / n) * 300}, 70%, ${(x + y) % 2 ? 38 : 52}%)`;
      g.fillRect(x * s, y * s, s, s);
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.font = "bold 20px ui-monospace, monospace";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String.fromCharCode(65 + x) + (n - y), x * s + s / 2, y * s + s / 2);
    }
  }
  // Mark the corners: canvas (0,0) is top-left, but UV (0,0) is BOTTOM-left (flipY handles it).
  g.fillStyle = "#fff"; g.font = "bold 26px ui-sans-serif, sans-serif"; g.textAlign = "left";
  g.fillText("uv 0,0", 8, 512 - 18);
  g.lineWidth = 6; g.strokeStyle = "#fff"; g.strokeRect(3, 3, 506, 506);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; // colour textures are authored in sRGB
  return tex;
}

// ── Texture 2: DataTexture — raw bytes in a typed array (here a tiny 16×16 pattern) ──
function makeDataTexture() {
  const size = 16, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x - 7.5, y - 7.5) / 10.6;              // distance from centre
      const ringOn = Math.sin(d * 18) > 0;
      data[i] = ringOn ? 255 : 30;                                 // R
      data[i + 1] = Math.round(80 + 175 * (1 - d));               // G
      data[i + 2] = ringOn ? 120 : 220;                            // B
      data[i + 3] = 255;                                           // A
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true; // DataTexture defaults to no mipmaps; we want to compare min filters
  tex.needsUpdate = true; // DataTextures must be flagged once data is ready
  return tex;
}

const textures = { canvas: makeUvGrid(), data: makeDataTexture() };
const maxAniso = renderer.capabilities.getMaxAnisotropy();

// Three objects with different UV layouts share ONE material, so one texture.
const material = new THREE.MeshStandardMaterial({ map: textures.canvas, roughness: 0.55 });
const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), material);      // each face gets full 0..1 UVs
const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.95, 64, 32), material);  // u wraps around, v pole to pole
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.6, 0.24, 200, 32), material); // u along the tube
box.position.set(-2.3, 1.1, 0); sphere.position.set(0, 1.1, 0); knot.position.set(2.3, 1.1, 0);
scene.add(box, sphere, knot);

// A long floor seen at a grazing angle: the best place to see filtering + anisotropy.
const floorTex = makeUvGrid();
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(16, 16);
// (tinted dark with `color` so the props stand out)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, color: "#2c2c3a" }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// ── GUI ──────────────────────────────────────────────────────────────────────
const params = {
  texture: "canvas", repeatU: 1, repeatV: 1, offsetU: 0, offsetV: 0, rotation: 0,
  wrap: "Repeat", magFilter: "Linear", minFilter: "LinearMipmapLinear", anisotropy: Math.min(8, maxAniso), srgb: true, spin: true,
};
const WRAP = { Repeat: THREE.RepeatWrapping, Mirrored: THREE.MirroredRepeatWrapping, Clamp: THREE.ClampToEdgeWrapping };
const MAG = { Nearest: THREE.NearestFilter, Linear: THREE.LinearFilter };
const MIN = { Nearest: THREE.NearestFilter, Linear: THREE.LinearFilter, NearestMipmapNearest: THREE.NearestMipmapNearestFilter, LinearMipmapLinear: THREE.LinearMipmapLinearFilter };

function apply() {
  for (const tex of [textures.canvas, textures.data, floorTex]) {
    const isFloor = tex === floorTex;
    if (!isFloor) {
      tex.repeat.set(params.repeatU, params.repeatV);  // >1 tiles the image
      tex.offset.set(params.offsetU, params.offsetV);  // slides it
      tex.center.set(0.5, 0.5);                        // rotate around the middle
      tex.rotation = params.rotation;
      tex.wrapS = tex.wrapT = WRAP[params.wrap];       // what happens outside 0..1
    }
    tex.magFilter = MAG[params.magFilter];              // texel bigger than a pixel
    tex.minFilter = MIN[params.minFilter];              // texel smaller than a pixel
    tex.anisotropy = params.anisotropy;                 // sharper at grazing angles
    tex.colorSpace = params.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.needsUpdate = true; // wrap/filter/colorSpace changes need a re-upload
  }
  material.map = textures[params.texture];
  material.needsUpdate = true;
  PG.status(`map: ${params.texture} · wrap ${params.wrap} · mag ${params.magFilter} · min ${params.minFilter} · anisotropy ${params.anisotropy}/${maxAniso}`);
}

const gui = new GUI({ title: "Parameters" });
gui.add(params, "texture", ["canvas", "data"]).onChange(apply);
const uv = gui.addFolder("UV transform");
uv.add(params, "repeatU", 0.25, 6, 0.25).onChange(apply);
uv.add(params, "repeatV", 0.25, 6, 0.25).onChange(apply);
uv.add(params, "offsetU", -1, 1, 0.01).onChange(apply);
uv.add(params, "offsetV", -1, 1, 0.01).onChange(apply);
uv.add(params, "rotation", -Math.PI, Math.PI, 0.01).onChange(apply);
uv.add(params, "wrap", Object.keys(WRAP)).name("wrapS / wrapT").onChange(apply);
const smp = gui.addFolder("Sampling");
smp.add(params, "magFilter", Object.keys(MAG)).onChange(apply);
smp.add(params, "minFilter", Object.keys(MIN)).onChange(apply);
smp.add(params, "anisotropy", 1, maxAniso, 1).onChange(apply);
smp.add(params, "srgb").name("colorSpace = sRGB").onChange(apply);
gui.add(params, "spin");
apply();

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(1.2, 0.9, 0); // offset so the GUI does not cover the knot
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
  if (params.spin) for (const m of [box, sphere, knot]) m.rotation.y += dt * 0.35;
  controls.update();
  renderer.render(scene, camera);
});

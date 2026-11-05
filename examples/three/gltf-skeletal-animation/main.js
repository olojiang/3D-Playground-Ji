// Skeletal animation — load a skinned glTF, play its clips with an AnimationMixer, cross-fade
// between them, and look at the bones that drive the mesh.
// Model: "RobotExpressive" by Tomás Laulhé (Quaternius), CC0 1.0 — served locally from /models.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

// Under the hood: three's skinning shader fetches each bone's 4×4 matrix from a float texture
// (4 texels per bone). We swap its integer "%" and "/" for float math so the lesson also runs on
// software GPUs (SwiftShader), which crash on runtime integer division. Same result everywhere.
THREE.ShaderChunk.skinning_pars_vertex = THREE.ShaderChunk.skinning_pars_vertex
  .replace("int x = j % size;", "int y = int(floor((float(j) + 0.5) / float(size)));")
  .replace("int y = j / size;", "int x = j - y * size;");

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
scene.fog = new THREE.Fog("#0b0b12", 18, 42);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(-6.5, 4.3, 12);

scene.add(new THREE.HemisphereLight("#cfd8ff", "#1a1424", 1.4));
const sun = new THREE.DirectionalLight("#fff1dc", 2.6);
sun.position.set(5, 10, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 8, bottom: -2, near: 1, far: 30 });
scene.add(sun);
const rim = new THREE.DirectionalLight("#7c5cff", 1.6);
rim.position.set(-6, 5, -6);
scene.add(rim);

// Stage: a round pad that catches the shadow, on top of a faint grid.
const pad = new THREE.Mesh(new THREE.CircleGeometry(6, 96), new THREE.MeshStandardMaterial({ color: "#181826", roughness: 0.85 }));
pad.rotation.x = -Math.PI / 2;
pad.receiveShadow = true;
scene.add(pad);
const grid = new THREE.GridHelper(60, 60, "#2a2a44", "#16162a");
grid.position.y = -0.01;
scene.add(grid);

// A glowing marker that follows the selected bone.
const marker = new THREE.Group();
marker.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 12), new THREE.MeshBasicMaterial({ color: "#ffd43b", depthTest: false })));
marker.add(new THREE.AxesHelper(0.6));
marker.traverse((o) => { o.renderOrder = 10; if (o.material) o.material.depthTest = false; });
scene.add(marker);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 2, 0);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

PG.status("loading /models/RobotExpressive.glb …");
const MODEL_URL = new URL("/models/RobotExpressive.glb", location.href).href;
let gltf;
try {
  gltf = await new GLTFLoader().loadAsync(MODEL_URL);
} catch (err) {
  PG.status("Could not load the model · 模型加载失败");
  throw err;
}

// ── 1. The skinned model ─────────────────────────────────────────────────────
const model = gltf.scene;
let skinned = null, skinnedCount = 0, rigidCount = 0;
model.traverse((o) => {
  if (o.isSkinnedMesh) skinnedCount++; else if (o.isMesh) rigidCount++; // rigid parts simply hang under a bone
  if (o.isMesh) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  if (o.isSkinnedMesh && !skinned) skinned = o; // geometry + per-vertex skinIndex/skinWeight
});
scene.add(model);
const skeleton = skinned.skeleton; // Skeleton = bones[] + boneInverses[] (the bind pose)

// SkeletonHelper draws a line from every bone to its parent (always on top).
const skeletonHelper = new THREE.SkeletonHelper(model);
skeletonHelper.visible = false;
scene.add(skeletonHelper);

// ── 2. Mixer, actions and cross-fades ────────────────────────────────────────
const mixer = new THREE.AnimationMixer(model);
const actions = {};
for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
const STATES = ["Idle", "Walking", "Running", "Dance"].filter((n) => actions[n]);
const EMOTES = ["Wave", "Jump", "Yes", "No", "ThumbsUp", "Punch"].filter((n) => actions[n]);
for (const name of EMOTES) {
  actions[name].setLoop(THREE.LoopOnce, 1);
  actions[name].clampWhenFinished = true; // hold the last frame while fading out
}

const params = { state: "Walking", fade: 0.5, warp: false, timeScale: 1, skeleton: false, model: true, bone: "Palm2R" };
let active = actions[params.state];
active.play();

// Cross-fade between two looping states: the outgoing weight goes 1→0 while the incoming goes 0→1.
function crossFadeTo(name) {
  const next = actions[name];
  if (next === active) return;
  next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
  active.crossFadeTo(next, params.fade, params.warp); // warp = also blend the playback speeds
  active = next;
}
// One-shot emotes: fade in, play once, and fade back to the current state when the clip finishes.
function playEmote(name) {
  const emote = actions[name];
  if (active === emote) return;
  active.fadeOut(0.2);
  emote.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.2).play();
  active = emote;
}
mixer.addEventListener("finished", (e) => {
  if (e.action !== active) return;                  // only the emote that is still in charge
  const back = actions[params.state];
  e.action.fadeOut(params.fade);
  back.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(params.fade).play();
  active = back;
});

// ── 3. GUI ───────────────────────────────────────────────────────────────────
const boneNames = skeleton.bones.map((b) => b.name);
const pick = ["Palm2R", "Palm2L", "LowerArmR", "ShoulderL", "Head", "Neck", "Torso_1", "Hips", "UpperLegL", "LowerLegR", "FootL"].filter((n) => boneNames.includes(n));
if (!pick.includes(params.bone)) params.bone = pick[0] ?? boneNames[0];

const gui = new GUI({ title: "Parameters" });
const fs = gui.addFolder("Clips · AnimationMixer");
fs.add(params, "state", STATES).name("state (loop)").onChange(crossFadeTo);
fs.add(params, "fade", 0, 2, 0.05).name("cross-fade (s)");
fs.add(params, "warp").name("warp time scales");
fs.add(params, "timeScale", 0, 2, 0.01).name("mixer.timeScale").onChange((v) => (mixer.timeScale = v));
const fe = gui.addFolder("Emotes (LoopOnce)");
for (const name of EMOTES) fe.add({ [name]: () => playEmote(name) }, name);
const fb = gui.addFolder("Skeleton");
fb.add(params, "skeleton").name("SkeletonHelper").onChange((v) => (skeletonHelper.visible = v));
fb.add(params, "model").name("show skin").onChange((v) => model.traverse((o) => { if (o.isMesh) o.visible = v; }));
fb.add(params, "bone", pick).name("follow bone");
fe.close();

// The bone's ancestry shows why moving a shoulder moves the whole arm.
function chain(bone) {
  const names = [];
  for (let b = bone; b && b.isBone && names.length < 6; b = b.parent) names.push(b.name);
  return names.join(" ← ");
}

// ── 4. Loop: advance the mixer, then the skinning happens on the GPU ────────────
const timer = new THREE.Timer();
const tmp = new THREE.Vector3();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  mixer.update(Math.min(timer.getDelta(), 0.1)); // clamp: a background tab must not skip whole clips
  const bone = skeleton.getBoneByName(params.bone);
  bone.getWorldPosition(tmp);
  marker.position.copy(tmp);
  bone.getWorldQuaternion(marker.quaternion);
  const playing = Object.values(actions).filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.001);
  PG.status(`${skeleton.bones.length} bones · ${gltf.animations.length} clips · ${skinnedCount} skinned meshes + ${rigidCount} rigid parts parented to bones\n` +
    playing.map((a) => `${a.getClip().name} ${(a.getEffectiveWeight() * 100).toFixed(0)}%`).join("  +  ") +
    `\nbone: ${chain(bone)}`);
  controls.update();
  renderer.render(scene, camera);
});

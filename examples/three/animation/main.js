// Animation — code-driven motion with easing (left) and keyframe clips with AnimationMixer (right).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(-1.3, 3.4, 11);

scene.add(new THREE.HemisphereLight("#c8d8ff", "#201828", 1.2));
const key = new THREE.DirectionalLight("#ffffff", 2);
key.position.set(3, 8, 6);
scene.add(key);

// ── Part 1: easing — the same 0→1 progress, reshaped by different curves ────────
// An easing function maps linear time t ∈ [0,1] to "how far along" we are.
const easings = {
  linear: (t) => t,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  easeOutBack: (t) => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  easeOutElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  easeOutBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};
// Text label on a Sprite (canvas → texture), so each lane is named in the scene.
function label(text) {
  const cv = document.createElement("canvas");
  cv.width = 320; cv.height = 64;
  const g = cv.getContext("2d");
  g.font = "600 30px ui-monospace, monospace";
  g.textAlign = "right"; g.textBaseline = "middle";
  g.fillStyle = "rgba(220,220,235,0.85)";
  g.fillText(text, 316, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.75, 0.35, 1);
  return sp;
}
const laneColors = ["#8b8ba0", "#4dabf7", "#69db7c", "#ffd43b", "#ff6b6b"];
const LANE_X0 = -4.2, LANE_X1 = -0.6;
const lanes = Object.entries(easings).map(([name, fn], i) => {
  const z = (i - 2) * 0.9;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(LANE_X1 - LANE_X0 + 0.6, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: "#2a2a3a" }));
  rail.position.set((LANE_X0 + LANE_X1) / 2, 0, z);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 16), new THREE.MeshStandardMaterial({ color: laneColors[i], roughness: 0.3, emissive: laneColors[i], emissiveIntensity: 0.15 }));
  ball.position.set(LANE_X0, 0.24, z);
  const tag = label(name);
  tag.position.set(LANE_X0 - 1.15, 0.15, z);
  scene.add(rail, ball, tag);
  return { name, fn, ball };
});

// ── Part 2: keyframes — tracks → clip → mixer → action ──────────────────────────
const hero = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#9775fa", roughness: 0.25, metalness: 0.2 }));
hero.position.set(2.0, 0.5, 0);
scene.add(hero);
const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.06, 64), new THREE.MeshStandardMaterial({ color: "#191926", roughness: 0.7 }));
pad.position.set(2.0, -0.03, 0);
scene.add(pad);
const grid = new THREE.GridHelper(20, 40, "#2a2a40", "#181826");
grid.position.y = -0.07; // just below the pad top to avoid z-fighting
scene.add(grid);

// A KeyframeTrack = property path + key times (seconds) + values (flattened).
const q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray();
const hopClip = new THREE.AnimationClip("hop", 1.6, [
  new THREE.VectorKeyframeTrack(".position", [0, 0.4, 0.8, 1.2, 1.6], [2.0, 0.5, 0, 2.0, 2.2, 0, 2.0, 0.5, 0, 2.0, 0.8, 0, 2.0, 0.5, 0]),
  new THREE.VectorKeyframeTrack(".scale", [0, 0.1, 0.4, 0.75, 0.8, 1.6], [1, 1, 1, 1.25, 0.75, 1.25, 0.9, 1.15, 0.9, 1, 1, 1, 1.3, 0.7, 1.3, 1, 1, 1]),
  // Quaternions slerp the SHORT way, so a full turn needs keys less than 180° apart.
  new THREE.QuaternionKeyframeTrack(".quaternion", [0, 0.533, 1.067, 1.6], [...q(0, 0, 0), ...q(0, (Math.PI * 2) / 3, 0), ...q(0, (Math.PI * 4) / 3, 0), ...q(0, Math.PI * 2, 0)]),
]);
const spinClip = new THREE.AnimationClip("spin & colour", 3, [
  new THREE.QuaternionKeyframeTrack(".quaternion", [0, 1, 2, 3], [...q(0, 0, 0), ...q(Math.PI / 2, 0, Math.PI / 4), ...q(Math.PI, Math.PI / 2, 0), ...q(0, 0, 0)]),
  new THREE.ColorKeyframeTrack(".material.color", [0, 1, 2, 3], [0.59, 0.46, 0.98, 0.3, 0.85, 1, 1, 0.42, 0.42, 0.59, 0.46, 0.98]),
  new THREE.VectorKeyframeTrack(".position", [0, 1.5, 3], [2.0, 1.2, 0, 2.0, 1.6, 0, 2.0, 1.2, 0]),
]);
const mixer = new THREE.AnimationMixer(hero); // the mixer resolves ".position" etc. relative to hero
const actions = { hop: mixer.clipAction(hopClip), spin: mixer.clipAction(spinClip) };
let current = actions.hop;
current.play();

// ── GUI ──────────────────────────────────────────────────────────────────────
const params = { duration: 1.8, timeScale: 1, paused: false, loop: "repeat", crossFade: () => {
  const next = current === actions.hop ? actions.spin : actions.hop;
  next.reset().play();
  current.crossFadeTo(next, 0.6, false); // blend weights over 0.6 s
  current = next;
} };
const gui = new GUI({ title: "Parameters" });
const fe = gui.addFolder("Easing (Timer-driven)");
fe.add(params, "duration", 0.5, 5, 0.1).name("duration (s)");
const fm = gui.addFolder("AnimationMixer");
fm.add(params, "timeScale", -2, 3, 0.01).onChange((v) => (mixer.timeScale = v));
fm.add(params, "paused").onChange((v) => Object.values(actions).forEach((a) => (a.paused = v)));
fm.add(params, "loop", ["repeat", "pingpong", "once"]).onChange((v) => Object.values(actions).forEach((a) => {
  a.setLoop({ repeat: THREE.LoopRepeat, pingpong: THREE.LoopPingPong, once: THREE.LoopOnce }[v], Infinity);
  a.clampWhenFinished = true;
  a.reset().play();
  if (a !== current) a.setEffectiveWeight(0);
}));
fm.add(params, "crossFade").name("crossFade hop ↔ spin");

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(-1.3, 0.8, 0);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.position.z = Math.max(11, 11 * (1.6 / camera.aspect));
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

// One Timer drives both systems: elapsed time for easing, delta time for the mixer.
const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta(), elapsed = timer.getElapsed();
  // Ping-pong a 0..1 progress value, then let each easing reshape it.
  const cycle = (elapsed / params.duration) % 2;
  const forward = cycle < 1, t = forward ? cycle : cycle - 1;
  for (const lane of lanes) {
    const e = lane.fn(t);
    const p = forward ? e : 1 - e;
    lane.ball.position.x = THREE.MathUtils.lerp(LANE_X0, LANE_X1, p);
  }
  mixer.update(dt); // advance every action by the frame's delta
  PG.status(`easing t = ${t.toFixed(2)}  ·  ${lanes.map((l) => l.name).join(" / ")}\nmixer action: ${current.getClip().name}  time ${current.time.toFixed(2)} s`);
  controls.update();
  renderer.render(scene, camera);
});

// Draw calls & instancing — the CPU cost of telling the GPU what to draw.
// Same picture, three strategies:
//   separate  : N Mesh objects  → N draw calls (CPU loops, uniforms, state per object)
//   instanced : one InstancedMesh → 1 draw call, per-instance matrix + colour in a buffer
//   merged    : all copies baked into one BufferGeometry → 1 draw call, but no per-object motion
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
scene.fog = new THREE.Fog("#0b0b12", 14, 30);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 6, 15);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight("#bcd4ff", "#1a1020", 1.4));
const sun = new THREE.DirectionalLight("#ffffff", 2.2);
sun.position.set(5, 8, 4);
scene.add(sun);

const PALETTE = ["#ff5e7e", "#ffb347", "#ffe066", "#5ce1a6", "#4cc9f0", "#7b8cff", "#c77dff", "#f4f4f8"].map((c) => new THREE.Color(c));
const baseGeo = new THREE.IcosahedronGeometry(0.12, 0); // 20 triangles each

// Deterministic layout: a spiral galaxy of N objects, with a random spin axis each.
function layout(n) {
  const items = [];
  for (let i = 0; i < n; i++) {
    const arm = i % 3, t = Math.sqrt((i + 1) / n);
    const ang = t * 9 + (arm * Math.PI * 2) / 3 + (Math.random() - 0.5) * 0.6;
    const r = 0.6 + t * 8;
    items.push({
      pos: new THREE.Vector3(Math.cos(ang) * r, (Math.random() - 0.5) * (2.2 - t * 1.6), Math.sin(ang) * r),
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      speed: 0.5 + Math.random() * 2,
      color: PALETTE[i % PALETTE.length],
    });
  }
  return items;
}

const params = { mode: "instanced", count: 5000, animate: true };
let group = null, items = [], update = () => {};
const sharedMats = PALETTE.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.1, flatShading: true }));
const q = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);

function build() {
  if (group) { scene.remove(group); group.traverse((o) => o.geometry && o.geometry !== baseGeo && o.geometry.dispose()); }
  group = new THREE.Group();
  items = layout(params.count);

  if (params.mode === "separate") {
    // N scene objects. Each one becomes its own draw call with its own matrix uniforms.
    const meshes = items.map((it, i) => {
      const mesh = new THREE.Mesh(baseGeo, sharedMats[i % sharedMats.length]);
      mesh.position.copy(it.pos);
      group.add(mesh);
      return mesh;
    });
    update = (t) => meshes.forEach((mesh, i) => mesh.quaternion.setFromAxisAngle(items[i].axis, t * items[i].speed));
  } else if (params.mode === "instanced") {
    // One object, one draw call. Per-instance transforms live in a GPU buffer (instanceMatrix).
    const inst = new THREE.InstancedMesh(baseGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1, flatShading: true }), items.length);
    items.forEach((it, i) => inst.setColorAt(i, it.color));
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // we rewrite it every frame
    group.add(inst);
    update = (t) => {
      for (let i = 0; i < items.length; i++) {
        q.setFromAxisAngle(items[i].axis, t * items[i].speed);
        inst.setMatrixAt(i, m.compose(items[i].pos, q, one));
      }
      inst.instanceMatrix.needsUpdate = true; // one buffer upload instead of N uniform updates
    };
  } else {
    // Bake every copy into one big geometry (positions already transformed, colours as attributes).
    const parts = items.map((it) => {
      const g = baseGeo.clone();
      g.applyMatrix4(m.compose(it.pos, q.setFromAxisAngle(it.axis, Math.random() * 6), one));
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < col.length; k += 3) col.set([it.color.r, it.color.g, it.color.b], k);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return g;
    });
    const merged = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1, flatShading: true }));
    parts.forEach((g) => g.dispose());
    group.add(merged);
    update = () => {}; // individual pieces can't move any more — only the whole mesh can
  }
  scene.add(group);
}
build();

const gui = new GUI({ title: "Parameters" });
gui.add(params, "mode", ["separate", "instanced", "merged"]).onChange(build);
gui.add(params, "count", 100, 30000, 100).onFinishChange(build);
gui.add(params, "animate").name("animate objects");

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

const timer = new THREE.Timer();
let cpuMs = 0, fps = 60, t = 0;
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  if (params.animate) t += dt;
  // Measure CPU time spent on our updates + three's render() (which issues the draw calls).
  const t0 = performance.now();
  update(t);
  group.rotation.y += dt * 0.05;
  controls.update();
  renderer.render(scene, camera);
  const ms = performance.now() - t0;
  cpuMs += (ms - cpuMs) * 0.1;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.1;
  const info = renderer.info.render;
  PG.status(`${params.mode} · ${params.count.toLocaleString()} objects · draw calls: ${info.calls} · triangles: ${info.triangles.toLocaleString()}\n` +
    `CPU update + render(): ${cpuMs.toFixed(2)} ms · ${fps.toFixed(0)} fps`);
});

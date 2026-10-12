// Scene · Camera · Renderer — the three objects every three.js program needs.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;

// 1. Renderer: draws into our <canvas> with WebGL.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

// 2. Scene: the container (a tree) of everything we want to draw.
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");

// 3. Camera: where we look from. fov, aspect, near, far.
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(3, 2, 4);

// A mesh = geometry (shape) + material (look).
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.4, 1.4, 1.4),
  new THREE.MeshStandardMaterial({ color: "#c9a227", metalness: 0.6, roughness: 0.25 }),
);
scene.add(cube);

// Lights: Standard materials need light to be visible.
scene.add(new THREE.HemisphereLight("#ffffff", "#202030", 1.2));
const key = new THREE.DirectionalLight("#ffffff", 2.5);
key.position.set(4, 6, 3);
scene.add(key);
scene.add(new THREE.GridHelper(10, 20, "#444", "#222"));

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const params = { speed: 0.8, fov: 50, wireframe: false };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "speed", 0, 4, 0.01);
gui.add(params, "fov", 20, 110, 1).onChange((v) => { camera.fov = v; camera.updateProjectionMatrix(); });
gui.add(params, "wireframe").onChange((v) => (cube.material.wireframe = v));

// Keep the drawing buffer and the camera aspect in sync with the canvas size.
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

// The render loop: update → render, ~60 times per second.
const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  cube.rotation.x += dt * params.speed * 0.6;
  cube.rotation.y += dt * params.speed;
  controls.update();
  renderer.render(scene, camera);
});

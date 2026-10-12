// Post-processing — render to a texture, then run full-screen passes over it.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; // applied by OutputPass at the very end

const scene = new THREE.Scene();
scene.background = new THREE.Color("#05050a");
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 2.2, 8);

scene.add(new THREE.HemisphereLight("#8090ff", "#100810", 0.4));
const key = new THREE.DirectionalLight("#ffffff", 1.2);
key.position.set(3, 5, 4);
scene.add(key);

// ── A neon scene: bright emissive parts are what bloom will pick up ────────────
const neon = (color, intensity = 3) => new THREE.MeshStandardMaterial({ color: "#000", emissive: color, emissiveIntensity: intensity });
const rings = new THREE.Group();
["#ff2e88", "#2ee6ff", "#b26bff"].forEach((c, i) => {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6 + i * 0.45, 0.035, 16, 160), neon(c, 2.2));
  ring.rotation.set(Math.PI / 2 + i * 0.35, i * 0.6, 0);
  rings.add(ring);
});
rings.position.y = 1.4;
scene.add(rings);
const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), new THREE.MeshStandardMaterial({ color: "#1b1b2e", roughness: 0.25, metalness: 0.8, flatShading: true }));
core.position.y = 1.4;
const coreWire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.82, 1), new THREE.MeshBasicMaterial({ color: "#ffd166", wireframe: true }));
core.add(coreWire);
scene.add(core);
// Floating "fireflies": tiny unlit spheres brighter than 1.0 so they bloom strongly.
const flies = [];
for (let i = 0; i < 40; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.9, 0.6).multiplyScalar(2.5) }));
  m.userData = { r: 2 + Math.random() * 3, a: Math.random() * 6.28, y: Math.random() * 3, s: 0.2 + Math.random() * 0.5 };
  flies.push(m); scene.add(m);
}
const grid = new THREE.GridHelper(30, 60, "#2a2050", "#141026");
scene.add(grid);

// ── The composer: an ordered chain of passes ───────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));                              // 1. draw the scene into a texture
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.3, 0.35); // 2. glow (strength, radius, threshold)
composer.addPass(bloom);

// 3. Our own effect: a ShaderPass runs a fragment shader once per screen pixel.
//    `tDiffuse` is filled automatically with the previous pass's output.
const LensShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAberration: { value: 0.004 }, uVignette: { value: 0.9 }, uGrain: { value: 0.04 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberration, uVignette, uGrain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 dir = vUv - 0.5;
      // chromatic aberration: sample R, G, B at slightly different offsets from the centre
      float r = texture2D(tDiffuse, vUv + dir * uAberration * 2.0).r;
      vec4 g = texture2D(tDiffuse, vUv);
      float b = texture2D(tDiffuse, vUv - dir * uAberration * 2.0).b;
      vec3 col = vec3(r, g.g, b);
      col *= 1.0 - uVignette * dot(dir, dir) * 1.6;            // vignette: darken the corners
      col *= 1.0 + (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain * 4.0; // film grain (multiplicative: black stays black)
      gl_FragColor = vec4(col, g.a);
    }`,
};
const lens = new ShaderPass(LensShader);
composer.addPass(lens);
composer.addPass(new OutputPass()); // 4. tone mapping + sRGB conversion (always last)

// ── GUI ──────────────────────────────────────────────────────────────────────
const params = { postprocessing: true, exposure: 1 };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "postprocessing").name("enable composer");
gui.add(params, "exposure", 0.2, 2.5, 0.01).onChange((v) => (renderer.toneMappingExposure = v));
const fb = gui.addFolder("UnrealBloomPass");
fb.add(bloom, "enabled");
fb.add(bloom, "strength", 0, 3, 0.01);
fb.add(bloom, "radius", 0, 1, 0.01);
fb.add(bloom, "threshold", 0, 1.5, 0.01);
const fl = gui.addFolder("Custom ShaderPass");
fl.add(lens, "enabled");
fl.add(lens.uniforms.uAberration, "value", 0, 0.03, 0.0005).name("aberration");
fl.add(lens.uniforms.uVignette, "value", 0, 2, 0.01).name("vignette");
fl.add(lens.uniforms.uGrain, "value", 0, 0.3, 0.005).name("grain");

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1.2, 0);

// The composer owns render targets, so it must be resized together with the renderer.
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const t = timer.getElapsed(), dt = timer.getDelta();
  rings.children.forEach((r, i) => { r.rotation.x += dt * (0.2 + i * 0.1); r.rotation.y += dt * (0.3 - i * 0.08); });
  core.rotation.y += dt * 0.4; core.rotation.x += dt * 0.15;
  for (const f of flies) { const u = f.userData; f.position.set(Math.cos(u.a + t * u.s) * u.r, u.y + Math.sin(t * u.s * 2 + u.a) * 0.3, Math.sin(u.a + t * u.s) * u.r); }
  lens.uniforms.uTime.value = t;
  controls.update();
  if (params.postprocessing) composer.render(dt); // replaces renderer.render(...)
  else renderer.render(scene, camera);
});

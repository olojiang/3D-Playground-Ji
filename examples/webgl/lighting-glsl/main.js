// Lighting in GLSL by hand — Lambert, Phong, Blinn-Phong and a Fresnel rim on a torus knot.
// three.js only supplies the mesh, the camera and the matrices; every lighting term is ours.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.debug.onShaderError = (gl, program, vs, fs) =>
  console.error("Shader error:\n" + gl.getShaderInfoLog(vs) + gl.getShaderInfoLog(fs) + gl.getProgramInfoLog(program));

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 1.2, 6.5);

const vertexShader = /* glsl */ `
out vec3 vNormal;    // world-space normal
out vec3 vWorld;     // world-space position
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal); // fine for rotation + uniform scale
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const fragmentShader = /* glsl */ `
uniform int   uModel;        // 0 Lambert · 1 Phong · 2 Blinn-Phong · 3 Blinn-Phong + rim
uniform vec3  uLightPos;
uniform vec3  uLightColor;
uniform vec3  uAlbedo;
uniform vec3  uAmbient;
uniform float uShininess;
uniform float uRimPower;
uniform vec3  uRimColor;
in vec3 vNormal;
in vec3 vWorld;
out vec4 fragColor;
void main() {
  vec3 N = normalize(vNormal);                 // re-normalize: interpolation shortens it
  vec3 L = normalize(uLightPos - vWorld);      // toward the light
  vec3 V = normalize(cameraPosition - vWorld); // toward the eye

  // Lambert: diffuse ∝ cos(angle between N and L)
  float NdotL = max(dot(N, L), 0.0);
  vec3 color = uAmbient * uAlbedo + uAlbedo * uLightColor * NdotL;

  float spec = 0.0;
  if (uModel == 1) {
    // Phong: reflect L about N, compare with V
    vec3 R = reflect(-L, N);
    spec = pow(max(dot(R, V), 0.0), uShininess);
  } else if (uModel >= 2) {
    // Blinn-Phong: half vector between L and V, compare with N (cheaper, nicer at grazing angles)
    vec3 H = normalize(L + V);
    spec = pow(max(dot(N, H), 0.0), uShininess * 4.0);
  }
  color += uLightColor * spec * step(0.0, dot(N, L));

  if (uModel == 3) {
    // Fresnel-style rim: surfaces seen edge-on glow
    float rim = pow(1.0 - max(dot(N, V), 0.0), uRimPower);
    color += uRimColor * rim;
  }
  fragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);   // gamma-encode for the screen
}`;

const uniforms = {
  uModel: { value: 3 },
  uLightPos: { value: new THREE.Vector3(3, 3, 3) },
  uLightColor: { value: new THREE.Color("#fff3e0") },
  uAlbedo: { value: new THREE.Color("#c9a227") },
  uAmbient: { value: new THREE.Color("#1d1d33") },
  uShininess: { value: 24 },
  uRimPower: { value: 2.5 },
  uRimColor: { value: new THREE.Color("#7c5cff") },
};
const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, glslVersion: THREE.GLSL3 });
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.38, 300, 48), material);
scene.add(knot);

// A small marker so you can see where the point light is.
const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), new THREE.MeshBasicMaterial({ color: "#fff3e0" }));
scene.add(lamp);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const models = { Lambert: 0, Phong: 1, "Blinn-Phong": 2, "Blinn-Phong + Fresnel rim": 3 };
const params = { model: 3, albedo: "#c9a227", rimColor: "#7c5cff", orbitLight: true, spin: 0.25 };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "model", models).name("lighting model").onChange((v) => (uniforms.uModel.value = v));
gui.addColor(params, "albedo").onChange((c) => uniforms.uAlbedo.value.set(c));
gui.add(uniforms.uShininess, "value", 1, 128, 1).name("shininess");
gui.add(uniforms.uRimPower, "value", 0.5, 8, 0.1).name("rim power");
gui.addColor(params, "rimColor").name("rim color").onChange((c) => uniforms.uRimColor.value.set(c));
gui.add(params, "orbitLight").name("orbit light");
gui.add(params, "spin", 0, 2, 0.01);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

const timer = new THREE.Timer();
let lightAngle = 0.8;
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  if (params.orbitLight) lightAngle += dt * 0.6;
  uniforms.uLightPos.value.set(Math.cos(lightAngle) * 3.2, 2.2, Math.sin(lightAngle) * 3.2);
  lamp.position.copy(uniforms.uLightPos.value);
  knot.rotation.y += dt * params.spin;
  controls.update();
  renderer.render(scene, camera);
});

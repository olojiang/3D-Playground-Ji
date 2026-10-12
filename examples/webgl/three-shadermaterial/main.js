// three.js ShaderMaterial & RawShaderMaterial — your own GLSL inside a three.js scene.
// The vertex shader displaces a plane into waves; the fragment shader shades it.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(4.5, 3.2, 5.5);

// Shared GLSL: the wave function, used by both materials.
const waveChunk = /* glsl */ `
uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uSpeed;
// Height of the surface at (x, z): a few crossing sine waves.
float wave(vec2 p) {
  float t = uTime * uSpeed;
  float h = sin(p.x * uFrequency + t) * 0.5
          + sin((p.x + p.y) * uFrequency * 0.7 - t * 1.3) * 0.35
          + sin(length(p) * uFrequency * 1.6 - t * 2.0) * 0.25;
  return h * uAmplitude;
}`;

// --- ShaderMaterial: three.js prepends its uniforms (projectionMatrix, modelViewMatrix,
// cameraPosition…) and attributes (position, normal, uv). We set glslVersion GLSL3, so
// three adds "#version 300 es" for us — that is why the strings do not start with it.
const vertexShader = /* glsl */ `
${waveChunk}
out float vHeight;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vec3 p = position;                      // the plane is rotated: local xy is the ground
  p.z += wave(p.xy);                      // displace along the plane's normal
  // Normal by finite differences: slope of the height field in x and y.
  float e = 0.01;
  float dx = wave(p.xy + vec2(e, 0.0)) - wave(p.xy - vec2(e, 0.0));
  float dy = wave(p.xy + vec2(0.0, e)) - wave(p.xy - vec2(0.0, e));
  vNormal = normalize(normalMatrix * normalize(vec3(-dx, -dy, 2.0 * e)));
  vHeight = p.z;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const fragmentShader = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uCrest;
uniform float uAmplitude;
in float vHeight;
in vec3 vNormal;
in vec3 vWorld;
out vec4 fragColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);   // cameraPosition is provided by three.js
  vec3 L = normalize(vec3(0.4, 1.0, 0.3));
  float h = clamp(vHeight / max(uAmplitude, 0.001) * 0.5 + 0.5, 0.0, 1.0);
  vec3 base = mix(uDeep, uCrest, smoothstep(0.2, 1.0, h));
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 60.0);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 c = base * (0.25 + 0.75 * diff) + spec * 0.6 + fresnel * vec3(0.45, 0.4, 0.8) * 0.6;
  fragColor = vec4(c, 1.0);
}`;

const uniforms = {
  uTime: { value: 0 },
  uAmplitude: { value: 0.35 },
  uFrequency: { value: 2.2 },
  uSpeed: { value: 1.2 },
  uDeep: { value: new THREE.Color("#1b1440") },
  uCrest: { value: new THREE.Color("#58e0d0") },
};

const shaderMat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, glslVersion: THREE.GLSL3 });

// --- RawShaderMaterial: NOTHING is prepended except the version line. We declare every
// matrix, attribute and the precision ourselves. Same uniforms object → same controls.
const rawMat = new THREE.RawShaderMaterial({
  uniforms,
  glslVersion: THREE.GLSL3,
  vertexShader: /* glsl */ `
precision highp float;
in vec3 position;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
${waveChunk}
out float vHeight;
void main() {
  vec3 p = position;
  p.z += wave(p.xy);
  vHeight = p.z;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}`,
  fragmentShader: /* glsl */ `
precision highp float;
uniform vec3 uDeep, uCrest;
uniform float uAmplitude;
in float vHeight;
out vec4 fragColor;
void main() {
  float h = clamp(vHeight / max(uAmplitude, 0.001) * 0.5 + 0.5, 0.0, 1.0);
  fragColor = vec4(mix(uDeep, uCrest, h), 1.0);   // unlit: height → color only
}`,
});

const geometry = new THREE.PlaneGeometry(9, 9, 220, 220); // many vertices to displace
const mesh = new THREE.Mesh(geometry, shaderMat);
mesh.rotation.x = -Math.PI / 2;
scene.add(mesh);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;

const params = { material: "ShaderMaterial", wireframe: false, deep: "#1b1440", crest: "#58e0d0" };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "material", ["ShaderMaterial", "RawShaderMaterial"]).onChange((v) => {
  mesh.material = v === "ShaderMaterial" ? shaderMat : rawMat;
});
gui.add(uniforms.uAmplitude, "value", 0, 1, 0.01).name("uAmplitude");
gui.add(uniforms.uFrequency, "value", 0.5, 6, 0.01).name("uFrequency");
gui.add(uniforms.uSpeed, "value", 0, 4, 0.01).name("uSpeed");
gui.addColor(params, "deep").name("uDeep").onChange((c) => uniforms.uDeep.value.set(c));
gui.addColor(params, "crest").name("uCrest").onChange((c) => uniforms.uCrest.value.set(c));
gui.add(params, "wireframe").onChange((v) => { shaderMat.wireframe = v; rawMat.wireframe = v; });

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

// Report shader compile errors from three.js to the console with the info log.
renderer.debug.onShaderError = (gl, program, vs, fs) => {
  console.error("Shader error:\n" + gl.getShaderInfoLog(vs) + gl.getShaderInfoLog(fs) + gl.getProgramInfoLog(program));
};

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  uniforms.uTime.value = timer.getElapsed();   // update a uniform: just set .value
  controls.update();
  renderer.render(scene, camera);
});

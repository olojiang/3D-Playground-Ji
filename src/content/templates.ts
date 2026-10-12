/** Starter programs for the Playground. They follow the same runtime contract as lessons (docs/AUTHORING-EXAMPLES.md). */
export const TEMPLATES = {
  three: `// Three.js starter — edit anything, then press Mod+Enter to run.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = PG.canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0b12");
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 1.2, 5);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const knot = new THREE.Mesh(
  new THREE.TorusKnotGeometry(1, 0.32, 220, 32),
  new THREE.MeshPhysicalMaterial({ color: "#7c9cff", roughness: 0.15, metalness: 0.2, clearcoat: 1 }),
);
scene.add(knot);
scene.add(new THREE.HemisphereLight("#ffffff", "#1b1b2b", 1.5));
const sun = new THREE.DirectionalLight("#ffffff", 3);
sun.position.set(3, 4, 2);
scene.add(sun);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  knot.rotation.y += timer.getDelta() * 0.6;
  controls.update();
  renderer.render(scene, camera);
});
`,
  webgl: `// WebGL 2 fullscreen fragment shader — a tiny Shadertoy.
const canvas = PG.canvas;
const gl = canvas.getContext("webgl2");

const vs = \`#version 300 es
in vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }\`;

const fs = \`#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
out vec4 outColor;

vec3 palette(float t) { return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + t)); }

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec2 uv0 = uv;
  vec3 col = vec3(0.0);
  for (float i = 0.0; i < 4.0; i++) {
    uv = fract(uv * 1.5) - 0.5;
    float d = length(uv) * exp(-length(uv0));
    d = sin(d * 8.0 + uTime) / 8.0;
    d = pow(0.01 / abs(d), 1.2);
    col += palette(length(uv0) + i * 0.4 + uTime * 0.4) * d;
  }
  outColor = vec4(col, 1.0);
}\`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
  return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
gl.linkProgram(prog);
gl.useProgram(prog);

gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(prog, "pos");
gl.enableVertexAttribArray(loc);
gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

const uRes = gl.getUniformLocation(prog, "uRes");
const uTime = gl.getUniformLocation(prog, "uTime");

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
new ResizeObserver(resize).observe(canvas);
resize();

requestAnimationFrame(function frame(t) {
  gl.uniform2f(uRes, canvas.width, canvas.height);
  gl.uniform1f(uTime, t / 1000);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
});
`,
  webgpu: `// WebGPU starter — adapter, device, WGSL, render pipeline.
const canvas = PG.canvas;
if (!navigator.gpu) {
  PG.status("WebGPU is not available in this browser — try Chrome/Edge 113+");
  throw new Error("WebGPU unavailable");
}
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) { PG.status("No WebGPU adapter found"); throw new Error("no adapter"); }
const device = await adapter.requestDevice();
const context = canvas.getContext("webgpu");
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format, alphaMode: "opaque" });

const shader = device.createShaderModule({ code: /* wgsl */ \`
struct Out { @builtin(position) pos: vec4f, @location(0) color: vec3f };
@group(0) @binding(0) var<uniform> time: f32;

@vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
  var p = array<vec2f, 3>(vec2f(0.0, 0.7), vec2f(-0.65, -0.5), vec2f(0.65, -0.5));
  var c = array<vec3f, 3>(vec3f(1.0, 0.3, 0.5), vec3f(0.3, 0.8, 1.0), vec3f(0.6, 1.0, 0.4));
  let a = time * 0.6;
  let r = mat2x2f(cos(a), -sin(a), sin(a), cos(a));
  var o: Out;
  o.pos = vec4f(r * p[i], 0.0, 1.0);
  o.color = c[i];
  return o;
}
@fragment fn fs(in: Out) -> @location(0) vec4f { return vec4f(in.color, 1.0); }
\` });

const pipeline = device.createRenderPipeline({
  layout: "auto",
  vertex: { module: shader, entryPoint: "vs" },
  fragment: { module: shader, entryPoint: "fs", targets: [{ format }] },
});
const uniform = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
}
new ResizeObserver(resize).observe(canvas);
resize();

requestAnimationFrame(function frame(t) {
  device.queue.writeBuffer(uniform, 0, new Float32Array([t / 1000]));
  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0.04, g: 0.04, b: 0.07, a: 1 }, loadOp: "clear", storeOp: "store" }] });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.draw(3);
  pass.end();
  device.queue.submit([enc.finish()]);
  requestAnimationFrame(frame);
});
`,
} as const;
export type TemplateId = keyof typeof TEMPLATES;

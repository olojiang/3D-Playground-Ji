// Model · View · Projection — building the matrices by hand for a spinning 3D cube.
// clip = Projection × View × Model × localPosition
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const gl = canvas.getContext("webgl2", { antialias: true });
if (!gl) {
  PG.status("WebGL2 is not available in this browser · 当前浏览器不支持 WebGL2");
  throw new Error("WebGL2 unavailable");
}

// ---- Tiny mat4 library (column-major, like GLSL) --------------------------
const mat4 = {
  identity: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  multiply(a, b) {                       // returns a × b
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  perspective(fovY, aspect, near, far) { // maps a view frustum to the clip cube
    const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  },
  lookAt(eye, target, up) {               // the inverse of the camera's placement
    const sub = (a, b) => a.map((v, i) => v - b[i]);
    const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  },
  translation: (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]),
  rotationX(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
  rotationY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
  scale: (s) => new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]),
};

// ---- Shaders ----------------------------------------------------------------
const vertexSrc = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
uniform mat4 uModel, uView, uProjection;
out vec3 vNormal;
out vec3 vColor;
void main() {
  vNormal = mat3(uModel) * aNormal;       // rotate normals with the object (no scaling here)
  vColor = aColor;
  gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
}`;
const fragmentSrc = /* glsl */ `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColor;
uniform float uTint;
out vec4 outColor;
void main() {
  vec3 L = normalize(vec3(0.5, 0.8, 0.6));
  float diffuse = max(dot(normalize(vNormal), L), 0.0);
  vec3 c = vColor * (0.28 + 0.8 * diffuse) * uTint;
  // gl_FrontFacing tells us if we are seeing a back face (only visible with culling off)
  if (!gl_FrontFacing) c = vec3(0.9, 0.1, 0.35) * 0.6;
  outColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error("shader compile error:\n" + gl.getShaderInfoLog(s));
  return s;
}
const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSrc));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSrc));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.error("program link error:\n" + gl.getProgramInfoLog(program));
const loc = Object.fromEntries(["uModel", "uView", "uProjection", "uTint"].map((n) => [n, gl.getUniformLocation(program, n)]));

// ---- Cube geometry: 6 faces × 2 triangles, counter-clockwise when seen from outside --
const faces = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], c: [0.95, 0.42, 0.32] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], c: [0.32, 0.72, 0.95] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], c: [0.95, 0.78, 0.25] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], c: [0.45, 0.85, 0.55] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], c: [0.62, 0.45, 0.98] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], c: [0.98, 0.5, 0.75] },
];
const verts = [];
for (const f of faces) {
  const corner = (a, b) => f.n.map((x, i) => (x + a * f.u[i] + b * f.v[i]) * 0.5);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) verts.push(...corner(a, b), ...f.n, ...f.c);
}
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
for (let i = 0; i < 3; i++) {
  gl.enableVertexAttribArray(i);
  gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12); // 9 floats per vertex
}

const params = { speed: 0.7, fov: 50, distance: 4.2, depthTest: true, cullBackFaces: true };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "speed", 0, 3, 0.01);
gui.add(params, "fov", 20, 110, 1).name("fov (projection)");
gui.add(params, "distance", 2.5, 9, 0.1).name("camera distance (view)");
gui.add(params, "depthTest").name("gl.DEPTH_TEST");
gui.add(params, "cullBackFaces").name("gl.CULL_FACE");

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
}
new ResizeObserver(resize).observe(canvas);
resize();

let angle = 0, last = 0;
function frame(now) {
  angle += ((now - last) / 1000) * params.speed; last = now;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.043, 0.043, 0.07, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);    // clear depth too, every frame
  params.depthTest ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST);
  params.cullBackFaces ? gl.enable(gl.CULL_FACE) : gl.disable(gl.CULL_FACE);

  gl.useProgram(program);
  const projection = mat4.perspective((params.fov * Math.PI) / 180, canvas.width / canvas.height, 0.1, 100);
  const view = mat4.lookAt([params.distance * 0.55, params.distance * 0.45, params.distance], [0, 0, 0], [0, 1, 0]);
  gl.uniformMatrix4fv(loc.uProjection, false, projection);
  gl.uniformMatrix4fv(loc.uView, false, view);
  gl.bindVertexArray(vao);

  // Big cube: model = rotY × rotX
  gl.uniformMatrix4fv(loc.uModel, false, mat4.multiply(mat4.rotationY(angle), mat4.rotationX(angle * 0.6)));
  gl.uniform1f(loc.uTint, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 36);

  // Small moon: model = orbit (rotY) × translate × spin × scale — order matters!
  const moon = [mat4.rotationY(-angle * 1.7), mat4.translation(1.6, 0.25, 0), mat4.rotationX(angle * 3), mat4.scale(0.38)]
    .reduce((a, b) => mat4.multiply(a, b));
  gl.uniformMatrix4fv(loc.uModel, false, moon);
  gl.uniform1f(loc.uTint, 1.15);
  gl.drawArrays(gl.TRIANGLES, 0, 36);

  requestAnimationFrame(frame);
}
PG.status("clip = P × V × M × position");
requestAnimationFrame(frame);

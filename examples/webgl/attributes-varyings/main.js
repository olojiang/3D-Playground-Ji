// Attributes & varyings — per-vertex colors, interpolated by the rasterizer.
// One interleaved buffer holds [x, y, r, g, b] for every vertex.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const gl = canvas.getContext("webgl2", { antialias: true });
if (!gl) {
  PG.status("WebGL2 is not available in this browser · 当前浏览器不支持 WebGL2");
  throw new Error("WebGL2 unavailable");
}

// `in` = attribute (per vertex). `out` in the vertex shader = varying.
// The rasterizer blends varyings across each triangle (barycentric interpolation).
const vertexSrc = (q) => /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec3 aColor;
${q} out vec3 vColor;      // "flat" disables interpolation
void main() {
  vColor = aColor;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const fragmentSrc = (q) => /* glsl */ `#version 300 es
precision highp float;
${q} in vec3 vColor;       // must match the vertex shader's output (name, type, qualifier)
out vec4 outColor;
void main() {
  outColor = vec4(pow(vColor, vec3(1.0 / 2.2)), 1.0); // rough gamma for nicer gradients
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error("shader compile error:\n" + gl.getShaderInfoLog(s));
  return s;
}
function link(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error("program link error:\n" + gl.getProgramInfoLog(p));
  return p;
}
const programs = { smooth: link(vertexSrc(""), fragmentSrc("")), flat: link(vertexSrc("flat"), fragmentSrc("flat")) };
// A third program ignores vColor and draws edges in translucent dark ink.
const edgeProgram = link(vertexSrc(""), `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(0.04, 0.04, 0.07, 1.0); }`);

// Build a hexagon "flower" as separate triangles: white center, rainbow rim.
const SEGMENTS = 12;
const FLOATS_PER_VERTEX = 5;                 // x, y, r, g, b
const data = new Float32Array(SEGMENTS * 3 * FLOATS_PER_VERTEX);
const hue = (h) => [0, 2, 4].map((k) => 0.5 + 0.5 * Math.cos(6.2832 * (h + k / 6))); // cosine rainbow

function fillVertices(t, aspect, radius) {
  let o = 0;
  const put = (x, y, c) => { data.set([x / aspect, y, c[0], c[1], c[2]], o); o += FLOATS_PER_VERTEX; };
  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = (i / SEGMENTS) * Math.PI * 2, a1 = ((i + 1) / SEGMENTS) * Math.PI * 2;
    // Flat-shaded triangles take their color from the LAST vertex (the "provoking vertex").
    put(0, 0, [0.95, 0.95, 1.0]);
    put(Math.cos(a0) * radius, Math.sin(a0) * radius, hue(i / SEGMENTS + t));
    put(Math.cos(a1) * radius, Math.sin(a1) * radius, hue((i + 1) / SEGMENTS + t));
  }
}

const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW); // allocate; we update each frame

// Interleaved layout: stride = bytes from one vertex to the next, offset = where the attribute starts.
const STRIDE = FLOATS_PER_VERTEX * 4;        // 5 floats × 4 bytes = 20 bytes
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);      // position at byte 0
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE, 2 * 4);  // color at byte 8
gl.bindVertexArray(null);

const params = { interpolation: "smooth", hueSpeed: 0.08, radius: 0.72, wireframe: false };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "interpolation", ["smooth", "flat"]);
gui.add(params, "hueSpeed", 0, 0.5, 0.01);
gui.add(params, "radius", 0.2, 0.95, 0.01);
gui.add(params, "wireframe").name("show triangles");

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
}
new ResizeObserver(resize).observe(canvas);
resize();

function frame(time) {
  const t = (time / 1000) * params.hueSpeed;
  fillVertices(t, canvas.width / canvas.height, params.radius);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);   // stream new colors to the GPU

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.043, 0.043, 0.07, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(programs[params.interpolation]);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, SEGMENTS * 3);
  if (params.wireframe) gl.useProgram(edgeProgram);
  if (params.wireframe) for (let i = 0; i < SEGMENTS; i++) gl.drawArrays(gl.LINE_LOOP, i * 3, 3);
  requestAnimationFrame(frame);
}
PG.status(`${SEGMENTS * 3} vertices · stride ${STRIDE} B · color offset 8 B`);
requestAnimationFrame(frame);

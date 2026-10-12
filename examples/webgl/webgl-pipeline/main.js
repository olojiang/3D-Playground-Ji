// The GPU pipeline · Hello Triangle in raw WebGL2 — no libraries, every step visible.
// vertex data → vertex shader → primitive assembly → rasterizer → fragment shader → framebuffer
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;

// 1. Context: the object every WebGL call goes through.
const gl = canvas.getContext("webgl2", { antialias: true });
if (!gl) {
  PG.status("WebGL2 is not available in this browser · 当前浏览器不支持 WebGL2");
  throw new Error("WebGL2 unavailable");
}

// 2. Shaders: two tiny programs written in GLSL ES 3.00 that run on the GPU.
// The vertex shader runs once per vertex and outputs a clip-space position.
const vertexSrc = /* glsl */ `#version 300 es
in vec2 aPosition;          // one vertex attribute, fed from a buffer
void main() {
  gl_PointSize = 14.0;      // only used when drawing POINTS
  gl_Position = vec4(aPosition, 0.0, 1.0); // clip space: x,y in [-1, 1]
}`;

// The fragment shader runs once per covered pixel and outputs its color.
// (We build it from a function so the GUI can recompile it with a new color.)
const fragmentSrc = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3));
  return /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;
void main() {
  // gl_FragCoord = this pixel's window position. A soft vertical sheen, no inputs needed.
  float sheen = 0.82 + 0.18 * sin(gl_FragCoord.y * 0.01 + gl_FragCoord.x * 0.004);
  outColor = vec4(vec3(${r}, ${g}, ${b}) * sheen, 1.0);
}`;
};

// Compile one shader and report errors with the driver's info log.
function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const kind = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
    console.error(`${kind} shader failed to compile:\n` + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// Link a vertex + fragment shader into a program (like linking object files).
function link(vsSource, fsSource) {
  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPosition"); // pin attribute to location 0
  gl.linkProgram(prog);
  gl.deleteShader(vs); gl.deleteShader(fs);    // the program keeps what it needs
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("program failed to link:\n" + gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

let program = link(vertexSrc, fragmentSrc("#e8b931"));

// 3. Buffer: upload vertex positions to GPU memory once.
const positions = new Float32Array([
   0.0,  0.62,   // top
  -0.62, -0.5,   // bottom left
   0.62, -0.5,   // bottom right
]);
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

// 4. VAO: remembers HOW to read the buffer (layout of attributes).
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.enableVertexAttribArray(0);
// location 0 ← 2 floats per vertex, tightly packed (stride 0), starting at byte 0
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

// GUI: change the primitive, recompile the fragment shader, or break it on purpose.
const params = {
  primitive: "TRIANGLES",
  color: "#e8b931",
  background: "#0b0b12",
  breakShader() {
    const broken = link(vertexSrc, `#version 300 es
precision highp float;
out vec4 outColor;
void main() { outColor = vec3(1.0); } // type error: vec3 assigned to vec4`);
    if (!broken) PG.status("Compile failed on purpose — see the console for the info log · 编译失败，查看控制台中的错误日志");
  },
};
const gui = new GUI({ title: "Parameters" });
gui.add(params, "primitive", ["TRIANGLES", "LINE_LOOP", "POINTS"]);
gui.addColor(params, "color").name("fragment color").onChange((c) => {
  const next = link(vertexSrc, fragmentSrc(c));
  if (next) { gl.deleteProgram(program); program = next; }
});
gui.addColor(params, "background");
gui.add(params, "breakShader").name("compile a broken shader");

// Keep the drawing buffer the same size as the canvas on screen (× pixel ratio).
function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
}
new ResizeObserver(resize).observe(canvas);
resize();

// 5. Draw: every frame, clear and issue one draw call.
function frame() {
  gl.viewport(0, 0, canvas.width, canvas.height); // clip space → pixels
  const bg = params.background;
  gl.clearColor(parseInt(bg.slice(1, 3), 16) / 255, parseInt(bg.slice(3, 5), 16) / 255, parseInt(bg.slice(5, 7), 16) / 255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl[params.primitive], 0, 3); // 3 vertices → 1 triangle
  requestAnimationFrame(frame);
}
PG.status("1 buffer · 1 VAO · 1 program · 1 drawArrays");
requestAnimationFrame(frame);

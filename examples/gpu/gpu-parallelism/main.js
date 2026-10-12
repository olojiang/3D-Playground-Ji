// CPU vs GPU — the same Mandelbrot image computed two ways.
// Left half: a plain JavaScript loop, one pixel after another, written into ImageData.
// Right half: a WebGL2 fragment shader, where every pixel is its own tiny thread.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
if (!gl) throw new Error("WebGL2 not available");

const params = { iterations: 300, resolution: 0.5, centerX: -0.74364, centerY: 0.13183, zoom: 60, autoZoom: false };

// ---------- shaders ----------
// One big triangle that covers the viewport: the cheapest "run the fragment shader everywhere" trick.
const VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vUv;
void main() { vec2 p = P[gl_VertexID]; vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

// Each invocation of main() computes ONE pixel. Thousands run at the same time (SIMT).
const MANDEL_FS = `#version 300 es
precision highp float;
uniform vec2 uRes;      // size of the half-viewport in pixels
uniform vec2 uOffset;   // where that half starts in window pixels
uniform vec2 uCenter;
uniform float uScale;   // complex-plane units per pixel
uniform int uIter;
out vec4 outColor;

vec3 palette(float t) { // cosine palette (Inigo Quilez)
  return 0.5 + 0.5 * cos(6.28318 * (vec3(0.95, 1.0, 1.05) * t + vec3(0.0, 0.12, 0.25)));
}
void main() {
  vec2 px = gl_FragCoord.xy - uOffset - 0.5 * uRes;
  vec2 c = uCenter + px * uScale;
  vec2 z = vec2(0.0);
  int i = 0;
  for (; i < uIter; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 256.0) break;   // threads in a warp that escape early just wait (divergence)
  }
  if (i >= uIter) { outColor = vec4(0.02, 0.02, 0.05, 1.0); return; }
  float smoothI = float(i) - log2(log2(dot(z, z))) + 4.0;  // smooth iteration count
  outColor = vec4(palette(smoothI * 0.02), 1.0);
}`;

const BLIT_FS = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 outColor;
void main() { outColor = texture(uTex, vUv); }`;

function program(fsSrc) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
  return p;
}
const mandel = program(MANDEL_FS);
const blit = program(BLIT_FS);
const U = (p, n) => gl.getUniformLocation(p, n);
gl.bindVertexArray(gl.createVertexArray());

// ---------- CPU version: the same math, one pixel at a time ----------
const cpuTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, cpuTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

function renderCPU(w, h, scale) {
  const img = new ImageData(w, h); // RGBA bytes
  const d = img.data, iter = params.iterations;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cr = params.centerX + (x + 0.5 - w / 2) * scale;
      const ci = params.centerY + (y + 0.5 - h / 2) * scale;
      let zr = 0, zi = 0, i = 0;
      for (; i < iter; i++) {
        const t = zr * zr - zi * zi + cr;
        zi = 2 * zr * zi + ci; zr = t;
        if (zr * zr + zi * zi > 256) break;
      }
      const o = (y * w + x) * 4;
      if (i >= iter) { d[o] = 5; d[o + 1] = 5; d[o + 2] = 13; }
      else {
        const t = (i - Math.log2(Math.log2(zr * zr + zi * zi)) + 4) * 0.02;
        d[o] = 255 * (0.5 + 0.5 * Math.cos(6.28318 * (0.95 * t)));
        d[o + 1] = 255 * (0.5 + 0.5 * Math.cos(6.28318 * (1.0 * t + 0.12)));
        d[o + 2] = 255 * (0.5 + 0.5 * Math.cos(6.28318 * (1.05 * t + 0.25)));
      }
      d[o + 3] = 255;
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, cpuTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // row 0 = bottom, same as gl_FragCoord
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, img.data);
}

// ---------- GPU version ----------
function drawGPU(x0, w, h, scale) {
  gl.viewport(x0, 0, w, h);
  gl.useProgram(mandel);
  gl.uniform2f(U(mandel, "uRes"), w, h);
  gl.uniform2f(U(mandel, "uOffset"), x0, 0);
  gl.uniform2f(U(mandel, "uCenter"), params.centerX, params.centerY);
  gl.uniform1f(U(mandel, "uScale"), scale);
  gl.uniform1i(U(mandel, "uIter"), params.iterations);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ---------- frame ----------
let cpuMs = 0, gpuMs = 0, dirty = true;
const px = new Uint8Array(4);
function frame(t) {
  const W = canvas.width, H = canvas.height, half = Math.floor(W / 2);
  if (params.autoZoom) { params.zoom *= 1.01; if (params.zoom > 3e4) params.zoom = 1; dirty = true; }
  const scaleFull = 3 / (H * params.zoom); // complex units per *display* pixel

  if (dirty) {
    dirty = false;
    // CPU: compute at reduced resolution (JS is slow), then stretch it over the left half.
    const cw = Math.max(8, Math.floor(half * params.resolution)), ch = Math.max(8, Math.floor(H * params.resolution));
    let t0 = performance.now();
    renderCPU(cw, ch, scaleFull / params.resolution);
    cpuMs = performance.now() - t0;
    // GPU: at FULL resolution. readPixels forces the CPU to wait until the GPU finished,
    // so the measured time includes the real work, not just queuing the command.
    t0 = performance.now();
    drawGPU(half, W - half, H, scaleFull);
    gl.readPixels(half + 1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gpuMs = performance.now() - t0;
    const cpuPx = cw * ch, gpuPx = (W - half) * H;
    PG.status(
      `CPU (JS, 1 thread): ${cpuMs.toFixed(1)} ms for ${cw}×${ch} = ${(cpuPx / 1e3).toFixed(0)}k px  →  ${(cpuPx / cpuMs / 1e3).toFixed(1)} Mpx/s\n` +
      `GPU (fragment shader): ${gpuMs.toFixed(1)} ms for ${W - half}×${H} = ${(gpuPx / 1e3).toFixed(0)}k px  →  ${(gpuPx / gpuMs / 1e3).toFixed(1)} Mpx/s` +
      `   · 左 CPU / 右 GPU · ${params.iterations} iterations`,
    );
  }
  // Draw the CPU picture into the left half and the GPU picture into the right half every frame.
  gl.viewport(0, 0, half, H);
  gl.useProgram(blit);
  gl.bindTexture(gl.TEXTURE_2D, cpuTex);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  drawGPU(half, W - half, H, scaleFull);
  // thin divider
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(half - 1, 0, 2, H);
  gl.clearColor(1, 1, 1, 0.9);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);
  requestAnimationFrame(frame);
}

const gui = new GUI({ title: "Parameters" });
const mark = () => (dirty = true);
gui.add(params, "iterations", 20, 2000, 1).onChange(mark);
gui.add(params, "resolution", 0.1, 1, 0.05).name("CPU resolution").onChange(mark);
gui.add(params, "zoom", 0.5, 30000, 0.5).listen().onChange(mark);
gui.add(params, "autoZoom").name("auto zoom (CPU every frame!)");
gui.add({ reset: () => { Object.assign(params, { centerX: -0.74364, centerY: 0.13183, zoom: 60 }); mark(); } }, "reset");

// Wheel to zoom, drag to pan.
canvas.addEventListener("wheel", (e) => { e.preventDefault(); params.zoom *= Math.exp(-e.deltaY * 0.0015); mark(); }, { passive: false });
let drag = null;
canvas.addEventListener("pointerdown", (e) => (drag = { x: e.clientX, y: e.clientY }));
addEventListener("pointerup", () => (drag = null));
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const s = (3 / (canvas.clientHeight * params.zoom));
  params.centerX -= (e.clientX - drag.x) * s; params.centerY += (e.clientY - drag.y) * s;
  drag = { x: e.clientX, y: e.clientY }; mark();
});

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.max(2, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.floor(canvas.clientHeight * dpr));
  dirty = true;
}
new ResizeObserver(resize).observe(canvas);
resize();
// Warm-up: the first draw also compiles/links the shader on the driver; keep that out of the timing.
drawGPU(0, 2, 2, 1e-3);
gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
requestAnimationFrame(frame);

// Image processing with WebGPU compute — blur, edge detection and colour grading.
// A 16×16 workgroup first copies its tile of the image (plus a border, the "halo") into fast
// workgroup-shared memory, waits at a barrier, then every thread filters from that shared tile.
// Drag on the canvas to move the before / after split.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const NO_GPU = "WebGPU is not available in this browser — try Chrome/Edge 113+ · 当前浏览器不支持 WebGPU";
const IMG_W = 1024, IMG_H = 640, TILE = 16, R = 4; // R = halo radius (max blur radius)

const COMPUTE_WGSL = /* wgsl */ `
struct Params { sigma : f32, edgeGain : f32, exposure : f32, contrast : f32,
                saturation : f32, temperature : f32, vignette : f32, _pad : f32 };
@group(0) @binding(0) var src : texture_2d<f32>;
@group(0) @binding(1) var dst : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> P : Params;

const TILE = ${TILE}u;
const R = ${R}u;
const SIDE = ${TILE + 2 * R}u;                       // tile + halo on both sides
var<workgroup> tile : array<vec4f, ${(TILE + 2 * R) ** 2}>; // shared by the 256 threads of one workgroup

// Every thread helps copy SIDE×SIDE texels into shared memory (more texels than threads → loop).
fn loadTile(wg : vec2u, lid : u32) {
  let dims = vec2i(textureDimensions(src));
  let origin = vec2i(wg * TILE) - vec2i(i32(R));
  for (var i = lid; i < SIDE * SIDE; i += TILE * TILE) {
    let c = origin + vec2i(i32(i % SIDE), i32(i / SIDE));
    tile[i] = textureLoad(src, clamp(c, vec2i(0), dims - 1), 0);
  }
  workgroupBarrier();                                 // wait until the whole tile is loaded
}
fn T(local : vec2u, dx : i32, dy : i32) -> vec4f {    // read shared memory around this pixel
  let p = vec2i(local) + vec2i(i32(R) + dx, i32(R) + dy);
  return tile[u32(p.y) * SIDE + u32(p.x)];
}
fn pixel(wg : vec2u, lid : u32) -> vec2u { return wg * TILE + vec2u(lid % TILE, lid / TILE); }
fn inside(p : vec2u) -> bool { return all(p < textureDimensions(src)); }
fn luma(c : vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

@compute @workgroup_size(${TILE}, ${TILE})
fn blur(@builtin(workgroup_id) wg : vec3u, @builtin(local_invocation_index) lid : u32) {
  loadTile(wg.xy, lid);
  let p = pixel(wg.xy, lid);
  if (!inside(p)) { return; }                         // (return AFTER the barrier, never before)
  let local = vec2u(lid % TILE, lid / TILE);
  // A Gaussian is separable: w(dx, dy) = w1(dx) · w1(dy). Compute the 1D weights once.
  var w1 : array<f32, ${2 * R + 1}>;
  for (var k = 0; k <= ${2 * R}; k++) { let d = f32(k - ${R}); w1[k] = exp(-d * d / (2.0 * P.sigma * P.sigma)); }
  var sum = vec4f(0.0);
  var wsum = 0.0;
  for (var dy = -${R}; dy <= ${R}; dy++) {
    for (var dx = -${R}; dx <= ${R}; dx++) {
      let w = w1[dx + ${R}] * w1[dy + ${R}];
      sum += T(local, dx, dy) * w;             // 81 reads, all from fast shared memory
      wsum += w;
    }
  }
  textureStore(dst, p, vec4f(sum.rgb / wsum, 1.0));
}

@compute @workgroup_size(${TILE}, ${TILE})
fn edges(@builtin(workgroup_id) wg : vec3u, @builtin(local_invocation_index) lid : u32) {
  loadTile(wg.xy, lid);
  let p = pixel(wg.xy, lid);
  if (!inside(p)) { return; }
  let l = vec2u(lid % TILE, lid / TILE);
  // Sobel operator: horizontal and vertical brightness gradients.
  let tl = luma(T(l,-1,-1).rgb); let tc = luma(T(l,0,-1).rgb); let tr = luma(T(l,1,-1).rgb);
  let ml = luma(T(l,-1, 0).rgb);                                 let mr = luma(T(l,1, 0).rgb);
  let bl = luma(T(l,-1, 1).rgb); let bc = luma(T(l,0, 1).rgb); let br = luma(T(l,1, 1).rgb);
  let gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  let gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
  let g = smoothstep(0.06, 1.0, length(vec2f(gx, gy)) * P.edgeGain);  // ignore tiny noise
  let hue = 0.5 + 0.5 * cos(6.2832 * (atan2(gy, gx) / 6.2832 + vec3f(0.0, 0.33, 0.67))); // colour by direction
  textureStore(dst, p, vec4f(mix(vec3f(0.02, 0.02, 0.04), hue, g), 1.0));
}

// Colour grading is per-pixel: no neighbours needed, so no shared memory either.
@compute @workgroup_size(${TILE}, ${TILE})
fn grade(@builtin(workgroup_id) wg : vec3u, @builtin(local_invocation_index) lid : u32) {
  let p = pixel(wg.xy, lid);
  if (!inside(p)) { return; }
  var c = textureLoad(src, p, 0).rgb * exp2(P.exposure);
  c += vec3f(P.temperature, 0.0, -P.temperature) * 0.1;           // warm ↔ cool
  c = (c - 0.5) * P.contrast + 0.5;
  c = mix(vec3f(luma(c)), c, P.saturation);
  let uv = vec2f(p) / vec2f(textureDimensions(src)) - 0.5;
  c *= 1.0 - P.vignette * dot(uv, uv) * 2.0;
  textureStore(dst, p, vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), 1.0));
}`;

const VIEW_WGSL = /* wgsl */ `
struct View { split : f32, canvasAspect : f32, imageAspect : f32, _pad : f32 };
@group(0) @binding(0) var before : texture_2d<f32>;
@group(0) @binding(1) var after : texture_2d<f32>;
@group(0) @binding(2) var samp : sampler;
@group(0) @binding(3) var<uniform> V : View;
struct VSOut { @builtin(position) pos : vec4f, @location(0) uv : vec2f };
@vertex fn vs(@builtin(vertex_index) i : u32) -> VSOut {
  var P = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o : VSOut;
  o.pos = vec4f(P[i], 0.0, 1.0);
  o.uv = P[i] * vec2f(0.5, -0.5) + 0.5;
  return o;
}
@fragment fn fs(i : VSOut) -> @location(0) vec4f {
  // "cover" fit: fill the canvas, crop what doesn't fit.
  var uv = i.uv - 0.5;
  let k = V.canvasAspect / V.imageAspect;
  if (k > 1.0) { uv.y /= k; } else { uv.x *= k; }
  uv += 0.5;
  let a = textureSample(before, samp, uv).rgb;
  let b = textureSample(after, samp, uv).rgb;
  var c = select(b, a, i.uv.x < V.split);
  let d = abs(i.uv.x - V.split) * V.canvasAspect;
  c = mix(c, vec3f(1.0), smoothstep(0.003, 0.0, d));             // divider line
  return vec4f(c, 1.0);
}`;

// A procedural "photo": sunset gradient, sun, hills, stripes and text — rich in edges and colour.
function makeImage() {
  const oc = new OffscreenCanvas(IMG_W, IMG_H), g = oc.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, IMG_H);
  sky.addColorStop(0, "#1b1446"); sky.addColorStop(0.5, "#c2477a"); sky.addColorStop(0.75, "#ffb35c");
  g.fillStyle = sky; g.fillRect(0, 0, IMG_W, IMG_H);
  g.fillStyle = "#ffe7a3"; g.beginPath(); g.arc(IMG_W * 0.42, IMG_H * 0.52, 110, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 6; k++) { g.fillStyle = "rgba(255,240,200,0.35)"; g.fillRect(IMG_W * 0.42 - 130, IMG_H * 0.5 + k * 14, 260, 4); }
  const hills = ["#3a1f5c", "#26164a", "#140c2e"];
  hills.forEach((c, k) => {
    g.fillStyle = c; g.beginPath(); g.moveTo(0, IMG_H);
    for (let x = 0; x <= IMG_W; x += 16) g.lineTo(x, IMG_H * (0.62 + k * 0.1) + Math.sin(x * 0.006 + k * 2) * 40 + Math.sin(x * 0.021 + k) * 12);
    g.lineTo(IMG_W, IMG_H); g.fill();
  });
  g.font = "bold 120px ui-sans-serif, sans-serif"; g.fillStyle = "rgba(255,255,255,0.9)"; g.fillText("GPU", 70, 190);
  g.font = "28px ui-monospace, monospace"; g.fillStyle = "#9ff3ff"; g.fillText("@compute @workgroup_size(16, 16)", 74, 240);
  for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 9}, 90%, 70%)`; g.beginPath(); g.arc(80 + i * 22, 300 + Math.sin(i) * 20, 6, 0, Math.PI * 2); g.fill(); }
  return oc;
}

async function main() {
  if (!navigator.gpu) return PG.status(NO_GPU);
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return PG.status(NO_GPU);
  const device = await adapter.requestDevice();
  device.addEventListener("uncapturederror", (e) => console.error("WebGPU error:", e.error.message));
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  async function compile(code, label) {
    const m = device.createShaderModule({ label, code });
    for (const msg of (await m.getCompilationInfo()).messages) if (msg.type === "error") console.error(`${label} WGSL line ${msg.lineNum}: ${msg.message}`);
    return m;
  }

  // Textures: the source image (uploaded once) and the filter output (a storage texture).
  const srcTex = device.createTexture({ size: [IMG_W, IMG_H], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
  device.queue.copyExternalImageToTexture({ source: makeImage() }, { texture: srcTex }, [IMG_W, IMG_H]);
  const dstTex = device.createTexture({ size: [IMG_W, IMG_H], format: "rgba8unorm", usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  // Start the "after" side as a copy of the source, so it shows the photo (not black) while pipelines compile.
  const initEnc = device.createCommandEncoder();
  initEnc.copyTextureToTexture({ texture: srcTex }, { texture: dstTex }, [IMG_W, IMG_H]);
  device.queue.submit([initEnc.finish()]);

  // One explicit bind group layout shared by all three compute entry points.
  const computeLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba8unorm" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
    ],
  });
  const paramBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const computeBG = device.createBindGroup({ layout: computeLayout, entries: [
    { binding: 0, resource: srcTex.createView() }, { binding: 1, resource: dstTex.createView() }, { binding: 2, resource: { buffer: paramBuf } },
  ] });
  device.pushErrorScope("validation");
  const cmod = await compile(COMPUTE_WGSL, "filters");
  const pipeLayout = device.createPipelineLayout({ bindGroupLayouts: [computeLayout] });
  // Pipelines are compiled on first use: createComputePipelineAsync compiles without blocking the page.
  const pipelines = {}, compiling = {};
  function requestPipeline(entryPoint) {
    if (compiling[entryPoint]) return;
    PG.status(`compiling "${entryPoint}" pipeline…`);
    compiling[entryPoint] = device.createComputePipelineAsync({ layout: pipeLayout, compute: { module: cmod, entryPoint } })
      .then((p) => { pipelines[entryPoint] = p; dirty = true; })
      .catch((e) => console.error(`Pipeline "${entryPoint}" failed:`, e.message));
  }
  const vmod = await compile(VIEW_WGSL, "view");
  const viewPipeline = device.createRenderPipeline({ layout: "auto", vertex: { module: vmod, entryPoint: "vs" }, fragment: { module: vmod, entryPoint: "fs", targets: [{ format }] } });
  const perr = await device.popErrorScope();
  if (perr) console.error("Pipeline error:", perr.message);

  const viewBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const viewBG = device.createBindGroup({ layout: viewPipeline.getBindGroupLayout(0), entries: [
    { binding: 0, resource: srcTex.createView() }, { binding: 1, resource: dstTex.createView() },
    { binding: 2, resource: device.createSampler({ magFilter: "linear", minFilter: "linear" }) }, { binding: 3, resource: { buffer: viewBuf } },
  ] });

  const params = { filter: "edges", split: 0.5, sigma: 2.5, edgeGain: 3, exposure: 0.2, contrast: 1.15, saturation: 1.4, temperature: 0.3, vignette: 0.6 };
  let dirty = true, lastMs = 0;
  const gui = new GUI({ title: "Parameters" });
  const mark = () => (dirty = true);
  gui.add(params, "filter", ["blur", "edges", "grade"]).onChange(mark);
  gui.add(params, "split", 0, 1, 0.001).listen();
  const fb = gui.addFolder("Blur"); fb.add(params, "sigma", 0.5, 4, 0.01).onChange(mark);
  const fe = gui.addFolder("Edges"); fe.add(params, "edgeGain", 0.5, 8, 0.01).name("gain").onChange(mark);
  const fg = gui.addFolder("Grade");
  ["exposure", "contrast", "saturation", "temperature", "vignette"].forEach((k, i) => fg.add(params, k, [-2, 0, 0, -1, 0][i], [2, 2, 2.5, 1, 1.5][i], 0.01).onChange(mark));

  // Drag anywhere to move the split.
  let dragging = false;
  const setSplit = (e) => { const r = canvas.getBoundingClientRect(); params.split = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  canvas.addEventListener("pointerdown", (e) => { dragging = true; setSplit(e); });
  canvas.addEventListener("pointermove", (e) => dragging && setSplit(e));
  addEventListener("pointerup", () => (dragging = false));

  function resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let framesInFlight = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (framesInFlight >= 2) return; // never queue work faster than the GPU finishes it
    const encoder = device.createCommandEncoder();
    const pipeline = pipelines[params.filter];
    if (!pipeline) requestPipeline(params.filter);
    const ranCompute = dirty && !!pipeline;
    if (ranCompute) {      // only re-filter when a parameter changed
      dirty = false;
      device.queue.writeBuffer(paramBuf, 0, new Float32Array([params.sigma, params.edgeGain, params.exposure, params.contrast, params.saturation, params.temperature, params.vignette, 0]));
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, computeBG);
      pass.dispatchWorkgroups(Math.ceil(IMG_W / TILE), Math.ceil(IMG_H / TILE));
      pass.end();
    }
    device.queue.writeBuffer(viewBuf, 0, new Float32Array([params.split, canvas.width / canvas.height, IMG_W / IMG_H, 0]));
    const rpass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }] });
    rpass.setPipeline(viewPipeline);
    rpass.setBindGroup(0, viewBG);
    rpass.draw(3);
    rpass.end();
    const t0 = performance.now();
    device.queue.submit([encoder.finish()]);
    framesInFlight++;
    device.queue.onSubmittedWorkDone().then(() => {
      framesInFlight--;
      if (!ranCompute) return;
      lastMs = performance.now() - t0;
      PG.status(`${params.filter} · ${IMG_W}×${IMG_H} px · ${Math.ceil(IMG_W / TILE)}×${Math.ceil(IMG_H / TILE)} workgroups of ${TILE}×${TILE}` +
        (params.filter === "grade" ? "" : ` · shared tile ${TILE + 2 * R}² texels`) + ` · GPU frame ${lastMs.toFixed(1)} ms · ◀ before | after ▶`);
    });
  }
  requestAnimationFrame(frame);
}
main();

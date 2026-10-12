// Game of Life on the GPU — a cellular automaton with two storage buffers (ping-pong).
// Each generation a compute pass reads grid A and writes grid B; next generation the roles swap.
// The grid is drawn with instancing: one small quad per cell, coloured by the cell's age.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const NO_GPU = "WebGPU is not available in this browser — try Chrome/Edge 113+ · 当前浏览器不支持 WebGPU";

const COMMON = /* wgsl */ `
struct Grid { w : u32, h : u32, fade : f32, _pad : f32 };
@group(0) @binding(0) var<uniform> G : Grid;
// Cell value: > 0 alive (its age in generations), < 0 recently died (fading ghost), 0 empty.
`;

const COMPUTE_WGSL = COMMON + /* wgsl */ `
@group(0) @binding(1) var<storage, read> src : array<f32>;
@group(0) @binding(2) var<storage, read_write> dst : array<f32>;

fn alive(x : u32, y : u32) -> u32 { return select(0u, 1u, src[y * G.w + x] > 0.0); }

// 8×8 = 64 threads per workgroup, each thread owns one cell.
@compute @workgroup_size(8, 8)
fn step(@builtin(workgroup_id) wg : vec3u, @builtin(local_invocation_index) lid : u32) {
  // Same as global_invocation_id.xy: workgroup position × 8 + position inside the workgroup.
  let x = wg.x * 8u + lid % 8u;
  let y = wg.y * 8u + lid / 8u;
  if (x >= G.w || y >= G.h) { return; }

  // Wrap around the edges (a torus) without a modulo.
  let xl = select(x - 1u, G.w - 1u, x == 0u);
  let xr = select(x + 1u, 0u, x + 1u == G.w);
  let yd = select(y - 1u, G.h - 1u, y == 0u);
  let yu = select(y + 1u, 0u, y + 1u == G.h);
  let n = alive(xl, yd) + alive(x, yd) + alive(xr, yd)
        + alive(xl, y)                 + alive(xr, y)
        + alive(xl, yu) + alive(x, yu) + alive(xr, yu);

  let i = y * G.w + x;
  let v = src[i];
  var out = 0.0;
  if (v > 0.0) {                       // alive: survives with 2 or 3 neighbours
    out = select(-1.0, min(v + 1.0, 200.0), n == 2u || n == 3u);
  } else {                             // empty / ghost: born with exactly 3 neighbours
    out = select(min(v + G.fade, 0.0), 1.0, n == 3u);
  }
  dst[i] = out;                        // write to the OTHER buffer — never read and write the same one
}`;

const RENDER_WGSL = COMMON + /* wgsl */ `
@group(0) @binding(1) var<storage, read> cells : array<f32>;

struct VSOut { @builtin(position) pos : vec4f, @location(0) color : vec4f, @location(1) uv : vec2f };

fn ageColor(age : f32) -> vec3f {                  // newborn → mint → teal → violet
  let t = clamp(log2(age) / 6.0, 0.0, 1.0);
  let a = mix(vec3f(1.0, 0.95, 0.6), vec3f(0.35, 1.0, 0.7), smoothstep(0.0, 0.3, t));
  let b = mix(a, vec3f(0.15, 0.65, 0.95), smoothstep(0.3, 0.65, t));
  return mix(b, vec3f(0.55, 0.3, 0.95), smoothstep(0.65, 1.0, t));
}

@vertex
fn vs(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VSOut {
  var quad = array<vec2f, 6>(vec2f(0,0), vec2f(1,0), vec2f(0,1), vec2f(0,1), vec2f(1,0), vec2f(1,1));
  // instance → (x, y). Float math keeps us away from integer division by a runtime value.
  let y = floor((f32(ii) + 0.5) / f32(G.w));
  let x = f32(ii) - y * f32(G.w);
  let v = cells[ii];
  let q = quad[vi];
  let inset = 0.08;
  let cell = vec2f(x, y) + inset + q * (1.0 - 2.0 * inset);
  var o : VSOut;
  o.pos = vec4f(cell / vec2f(f32(G.w), f32(G.h)) * 2.0 - 1.0, 0.0, 1.0);
  if (v > 0.0) { o.color = vec4f(ageColor(v), 1.0); }
  else { o.color = vec4f(vec3f(0.35, 0.25, 0.9) * (-v) * 0.45, 1.0); }   // ghost trail
  if (v == 0.0) { o.pos = vec4f(2.0, 2.0, 0.0, 1.0); }                   // empty: push off-screen
  o.uv = q;
  return o;
}

@fragment
fn fs(i : VSOut) -> @location(0) vec4f {
  let e = min(min(i.uv.x, 1.0 - i.uv.x), min(i.uv.y, 1.0 - i.uv.y));
  let bevel = 0.75 + 0.25 * smoothstep(0.0, 0.25, e);     // soft rounded-tile look
  return vec4f(i.color.rgb * bevel, 1.0);
}`;

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
  device.pushErrorScope("validation");
  const stepPipeline = device.createComputePipeline({ layout: "auto", compute: { module: await compile(COMPUTE_WGSL, "life step"), entryPoint: "step" } });
  const rmod = await compile(RENDER_WGSL, "life render");
  const drawPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: rmod, entryPoint: "vs" },
    fragment: { module: rmod, entryPoint: "fs", targets: [{ format }] },
  });
  const perr = await device.popErrorScope();
  if (perr) console.error("Pipeline error:", perr.message);

  const params = { speed: 15, cellSize: 6, density: 0.3, trails: 0.08, paused: false };
  const gridBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  let W = 0, H = 0, bufs = [], stepBG = [], drawBG = [], cur = 0, generation = 0;

  // Allocate two equally sized grids and seed one of them with random cells.
  function reset() {
    W = Math.max(8, Math.floor(canvas.width / (params.cellSize * Math.min(devicePixelRatio, 2))));
    H = Math.max(8, Math.floor(canvas.height / (params.cellSize * Math.min(devicePixelRatio, 2))));
    bufs.forEach((b) => b.destroy());
    const seed = new Float32Array(W * H);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random() < params.density ? 1 : 0;
    bufs = [0, 1].map(() => device.createBuffer({ size: seed.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }));
    device.queue.writeBuffer(bufs[0], 0, seed);
    device.queue.writeBuffer(gridBuf, 0, new Float32Array([0, 0, params.trails, 0]));
    device.queue.writeBuffer(gridBuf, 0, new Uint32Array([W, H]));
    // Ping-pong bind groups: [0] reads A writes B, [1] reads B writes A.
    stepBG = [0, 1].map((k) => device.createBindGroup({
      layout: stepPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: gridBuf } }, { binding: 1, resource: { buffer: bufs[k] } }, { binding: 2, resource: { buffer: bufs[1 - k] } }],
    }));
    drawBG = [0, 1].map((k) => device.createBindGroup({
      layout: drawPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: gridBuf } }, { binding: 1, resource: { buffer: bufs[k] } }],
    }));
    cur = 0; generation = 0;
  }

  const gui = new GUI({ title: "Parameters" });
  gui.add(params, "speed", 1, 60, 1).name("generations / s");
  gui.add(params, "cellSize", 2, 20, 1).name("cell size (px)").onFinishChange(reset);
  gui.add(params, "density", 0.05, 0.9, 0.01).onFinishChange(reset);
  gui.add(params, "trails", 0.02, 1, 0.01).onChange((v) => device.queue.writeBuffer(gridBuf, 8, new Float32Array([v])));
  gui.add(params, "paused");
  gui.add({ step: () => (pendingSteps += 1) }, "step").name("step once");
  gui.add({ reset }, "reset");

  function resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    reset();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let acc = 0, last = performance.now(), pendingSteps = 0, framesInFlight = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (framesInFlight >= 2) return; // never queue work faster than the GPU finishes it
    acc += params.paused ? 0 : ((now - last) / 1000) * params.speed;
    last = now;
    const steps = Math.min(Math.floor(acc) + pendingSteps, 4);
    acc -= Math.floor(acc); pendingSteps = 0;

    const encoder = device.createCommandEncoder();
    for (let s = 0; s < steps; s++) {
      const pass = encoder.beginComputePass();
      pass.setPipeline(stepPipeline);
      pass.setBindGroup(0, stepBG[cur]);
      pass.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8)); // a 2D grid of workgroups
      pass.end();
      cur = 1 - cur; generation++;   // swap: what we just wrote is the new "current"
    }
    const rpass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0.03, g: 0.03, b: 0.055, a: 1 }, loadOp: "clear", storeOp: "store" }],
    });
    rpass.setPipeline(drawPipeline);
    rpass.setBindGroup(0, drawBG[cur]);
    rpass.draw(6, W * H);           // one quad instance per cell
    rpass.end();
    device.queue.submit([encoder.finish()]);
    framesInFlight++;
    device.queue.onSubmittedWorkDone().then(() => framesInFlight--);
    PG.status(`${W}×${H} = ${(W * H).toLocaleString()} cells · generation ${generation} · ${Math.ceil(W / 8)}×${Math.ceil(H / 8)} workgroups of 8×8`);
  }
  requestAnimationFrame(frame);
}
main();

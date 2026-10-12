// Compute basics — your first WebGPU compute shader.
// Storage buffers in, storage buffer out, @workgroup_size, dispatchWorkgroups, then read results back on the CPU.
// The same output buffer is also read by a render pipeline to draw a live bar chart.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const NO_GPU = "WebGPU is not available in this browser — try Chrome/Edge 113+ · 当前浏览器不支持 WebGPU";
const WG = 64; // threads per workgroup (a multiple of the 32/64-wide hardware warp)

const COMPUTE_WGSL = /* wgsl */ `
struct Params { n : u32, freq : f32, phase : f32, decay : f32 };
@group(0) @binding(0) var<uniform> P : Params;
@group(0) @binding(1) var<storage, read> input : array<f32>;         // x values
@group(0) @binding(2) var<storage, read_write> output : array<f32>;  // f(x)

@compute @workgroup_size(${WG})
fn main(@builtin(workgroup_id) wg : vec3u,             // which workgroup (0 … dispatch count − 1)
        @builtin(local_invocation_index) lid : u32) {  // which thread inside it (0 … ${WG - 1})
  // Global thread index. This is exactly what @builtin(global_invocation_id).x gives you;
  // we spell it out to show how the three IDs relate.
  let i = wg.x * ${WG}u + lid;
  if (i >= P.n) { return; }     // the last workgroup may have spare threads
  let x = input[i];
  output[i] = sin(x * P.freq + P.phase) * exp(-x * P.decay);  // a damped wave
}`;

const RENDER_WGSL = /* wgsl */ `
struct View { stride : u32, bars : u32, aspect : f32, time : f32 };  // stride = n / bars, computed on the CPU
@group(0) @binding(0) var<storage, read> values : array<f32>;   // the compute output, read-only here
@group(0) @binding(1) var<uniform> V : View;

struct VSOut { @builtin(position) pos : vec4f, @location(0) color : vec3f, @location(1) uv : vec2f };

@vertex
fn vs(@builtin(vertex_index) vi : u32, @builtin(instance_index) bar : u32) -> VSOut {
  var quad = array<vec2f, 6>(vec2f(0,0), vec2f(1,0), vec2f(0,1), vec2f(0,1), vec2f(1,0), vec2f(1,1));
  let corner = quad[vi];
  let v = values[bar * V.stride];                   // sample every stride-th result
  let w = 1.8 / f32(V.bars);
  let x = -0.9 + f32(bar) * w + corner.x * w * 0.78;
  let y = corner.y * v * 0.75;                       // bars grow up or down from the centre line
  var o : VSOut;
  o.pos = vec4f(x, y, 0.0, 1.0);
  let t = f32(bar) / f32(V.bars);
  o.color = mix(vec3f(0.2, 0.75, 1.0), vec3f(1.0, 0.35, 0.65), t) * (0.55 + 0.6 * abs(v));
  o.uv = vec2f(corner.x, corner.y);
  return o;
}

@fragment
fn fs(i : VSOut) -> @location(0) vec4f {
  let tip = smoothstep(0.6, 1.0, i.uv.y);           // brighter tips
  return vec4f(i.color + tip * 0.35, 1.0);
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
  const computePipeline = device.createComputePipeline({ layout: "auto", compute: { module: await compile(COMPUTE_WGSL, "compute"), entryPoint: "main" } });
  const renderModule = await compile(RENDER_WGSL, "render");
  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderModule, entryPoint: "vs" },
    fragment: { module: renderModule, entryPoint: "fs", targets: [{ format }] },
  });
  const pipeErr = await device.popErrorScope();
  if (pipeErr) console.error("Pipeline error:", pipeErr.message);

  const params = { count: 1 << 20, freq: 40, decay: 2.5, speed: 1, bars: 96 };
  const paramsData = new ArrayBuffer(16), viewData = new ArrayBuffer(16);
  const paramsBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const viewBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  let input, output, staging, computeBG, renderBG;

  // (Re)allocate the big buffers whenever the element count changes.
  function allocate() {
    [input, output, staging].forEach((b) => b?.destroy());
    const n = params.count, bytes = n * 4;
    const xs = new Float32Array(n);
    for (let i = 0; i < n; i++) xs[i] = i / n;
    input = device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(input, 0, xs);
    output = device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    // GPU memory can't be read directly: copy into a MAP_READ "staging" buffer, then map it.
    staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    computeBG = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: paramsBuf } }, { binding: 1, resource: { buffer: input } }, { binding: 2, resource: { buffer: output } }],
    });
    renderBG = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: output } }, { binding: 1, resource: { buffer: viewBuf } }],
    });
  }

  function encodeCompute(encoder, phase) {
    const dv = new DataView(paramsData);
    dv.setUint32(0, params.count, true); dv.setFloat32(4, params.freq, true);
    dv.setFloat32(8, phase, true); dv.setFloat32(12, params.decay, true);
    device.queue.writeBuffer(paramsBuf, 0, paramsData);
    const pass = encoder.beginComputePass();
    pass.setPipeline(computePipeline);
    pass.setBindGroup(0, computeBG);
    pass.dispatchWorkgroups(Math.ceil(params.count / WG)); // e.g. 1M / 64 = 16384 workgroups
    pass.end();
  }

  // Run once on the GPU with readback, once in a JS loop, and compare.
  let busy = false, warm = false;
  async function runGPU(phase) {
    const n = params.count;
    const encoder = device.createCommandEncoder();
    encodeCompute(encoder, phase);
    encoder.copyBufferToBuffer(output, 0, staging, 0, n * 4);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);              // resolves when the GPU is done and data is visible
    const data = new Float32Array(staging.getMappedRange().slice(0)); // copy out before unmap
    staging.unmap();
    return data;
  }
  async function benchmark() {
    if (busy) return;
    busy = true;
    const n = params.count, phase = 0.5;
    // Warm-up: the very first dispatch also pays for driver-side shader compilation.
    if (!warm) { await runGPU(phase); warm = true; }
    const t0 = performance.now();
    const gpu = await runGPU(phase);
    const gpuMs = performance.now() - t0;

    const t1 = performance.now();
    const cpu = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / n; cpu[i] = Math.sin(x * params.freq + phase) * Math.exp(-x * params.decay); }
    const cpuMs = performance.now() - t1;

    let maxErr = 0;
    for (let i = 0; i < n; i += 97) maxErr = Math.max(maxErr, Math.abs(gpu[i] - cpu[i]));
    const sample = [0, 1, 2, n >> 1].map((i) => `out[${i}]=${gpu[i].toFixed(4)}`).join("  ");
    console.log(`Compute ${n.toLocaleString()} elements · GPU (dispatch + readback) ${gpuMs.toFixed(2)} ms · JS loop ${cpuMs.toFixed(2)} ms · max |GPU−JS| ${maxErr.toExponential(2)}`);
    console.log(sample);
    PG.status(`${n.toLocaleString()} elements · ${Math.ceil(n / WG)} workgroups × ${WG} threads\n` +
      `GPU dispatch + readback: ${gpuMs.toFixed(2)} ms   JS loop: ${cpuMs.toFixed(2)} ms   max error ${maxErr.toExponential(1)}\n${sample}`);
    busy = false;
  }

  allocate();
  const gui = new GUI({ title: "Parameters" });
  gui.add(params, "count", { "65k": 1 << 16, "262k": 1 << 18, "1M": 1 << 20, "2M": 1 << 21 }).name("elements").onChange(() => { allocate(); benchmark(); });
  gui.add(params, "freq", 1, 120, 0.5);
  gui.add(params, "decay", 0, 8, 0.1);
  gui.add(params, "speed", 0, 4, 0.01);
  gui.add(params, "bars", 16, 256, 1);
  gui.add({ benchmark }, "benchmark").name("▶ run benchmark");

  function resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let framesInFlight = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (framesInFlight >= 2) return; // never queue work faster than the GPU finishes it
    const dv = new DataView(viewData);
    dv.setUint32(0, Math.floor(params.count / params.bars), true); dv.setUint32(4, params.bars, true);
    dv.setFloat32(8, canvas.width / canvas.height, true); dv.setFloat32(12, t / 1000, true);
    device.queue.writeBuffer(viewBuf, 0, viewData);
    // One command buffer: compute pass writes `output`, render pass reads it. WebGPU orders them for us.
    const encoder = device.createCommandEncoder();
    if (!busy) encodeCompute(encoder, (t / 1000) * params.speed * 3);
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0.043, g: 0.043, b: 0.07, a: 1 }, loadOp: "clear", storeOp: "store" }],
    });
    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, renderBG);
    pass.draw(6, params.bars); // 6 vertices per bar, one instance per bar
    pass.end();
    device.queue.submit([encoder.finish()]);
    framesInFlight++;
    device.queue.onSubmittedWorkDone().then(() => framesInFlight--);
  }
  requestAnimationFrame(frame);
  await benchmark();
}
main();

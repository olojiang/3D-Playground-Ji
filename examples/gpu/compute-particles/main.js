// Compute particles — 130k+ particles simulated entirely on the GPU.
// A compute pass updates a storage buffer in place every frame; a render pass draws one instanced quad
// per particle, reading positions straight from that same buffer. No CPU round trip.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const NO_GPU = "WebGPU is not available in this browser — try Chrome/Edge 113+ · 当前浏览器不支持 WebGPU";
const WG = 256;

// Shared by both shaders: the particle layout and the per-frame uniforms.
const COMMON = /* wgsl */ `
struct Particle { pos : vec2f, vel : vec2f };      // 16 bytes each
struct Sim {
  attractor : vec2f,   // where particles are pulled to (mouse or a wandering point)
  dt        : f32,
  aspect    : f32,
  strength  : f32,
  swirl     : f32,
  damping   : f32,
  size      : f32,     // quad half-size in clip units
  count     : u32,
  pressed   : f32,
  _pad      : vec2f,
};
@group(0) @binding(1) var<uniform> S : Sim;
`;

const COMPUTE_WGSL = COMMON + /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> particles : array<Particle>;

@compute @workgroup_size(${WG})
fn simulate(@builtin(workgroup_id) wg : vec3u, @builtin(local_invocation_index) lid : u32) {
  let i = wg.x * ${WG}u + lid;          // global thread index = one particle
  if (i >= S.count) { return; }
  var p = particles[i];

  // Work in "square" space so the force field is round on a wide canvas.
  let pos = vec2f(p.pos.x * S.aspect, p.pos.y);
  let att = vec2f(S.attractor.x * S.aspect, S.attractor.y);
  let d = att - pos;
  let r2 = dot(d, d) + 0.02;                       // softening: no infinite force at r = 0
  let dir = d * inverseSqrt(r2);
  let mass = 0.5 + fract(sin(f32(i) * 12.9898) * 43758.5453);  // per-particle variety → spiral arms
  let k = S.strength * mass * (1.0 + 3.0 * S.pressed);
  var acc = dir * k / r2 * 0.25;                   // gravity-like pull
  acc += vec2f(-dir.y, dir.x) * S.swirl * mass / sqrt(r2) * 0.6; // tangential swirl → spirals
  acc.x /= S.aspect;

  p.vel = (p.vel + acc * S.dt) * pow(S.damping, S.dt * 60.0);
  p.pos += p.vel * S.dt;
  // Soft walls: bounce back inside the view.
  if (abs(p.pos.x) > 1.0) { p.vel.x *= -0.6; p.pos.x = clamp(p.pos.x, -1.0, 1.0); }
  if (abs(p.pos.y) > 1.0) { p.vel.y *= -0.6; p.pos.y = clamp(p.pos.y, -1.0, 1.0); }
  particles[i] = p;                                // in-place update: each thread owns one element
}`;

const RENDER_WGSL = COMMON + /* wgsl */ `
@group(0) @binding(0) var<storage, read> particles : array<Particle>;

struct VSOut { @builtin(position) pos : vec4f, @location(0) uv : vec2f, @location(1) color : vec3f };

fn heat(t : f32) -> vec3f {   // speed → colour: indigo → cyan → amber → white
  let c1 = mix(vec3f(0.25, 0.2, 0.9), vec3f(0.1, 0.8, 1.0), smoothstep(0.0, 0.35, t));
  let c2 = mix(c1, vec3f(1.0, 0.55, 0.15), smoothstep(0.35, 0.7, t));
  return mix(c2, vec3f(1.0, 0.95, 0.85), smoothstep(0.7, 1.0, t));
}

@vertex
fn vs(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VSOut {
  var quad = array<vec2f, 6>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(-1,1), vec2f(1,-1), vec2f(1,1));
  let p = particles[ii];
  let q = quad[vi];
  var o : VSOut;
  o.pos = vec4f(p.pos + q * vec2f(S.size / S.aspect, S.size), 0.0, 1.0);
  o.uv = q;
  o.color = heat(clamp(length(p.vel) * 0.6, 0.0, 1.0));
  return o;
}

@fragment
fn fs(i : VSOut) -> @location(0) vec4f {
  let fall = max(0.0, 1.0 - dot(i.uv, i.uv));      // round, soft sprite
  return vec4f(i.color * fall * fall * 0.22, 1.0); // additive blending adds these up → glow
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
  const simPipeline = device.createComputePipeline({ layout: "auto", compute: { module: await compile(COMPUTE_WGSL, "simulate"), entryPoint: "simulate" } });
  const rmod = await compile(RENDER_WGSL, "render");
  const drawPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: rmod, entryPoint: "vs" },
    fragment: {
      module: rmod, entryPoint: "fs",
      // Additive blending: dst = src + dst. Dense regions glow, order doesn't matter.
      targets: [{ format, blend: { color: { srcFactor: "one", dstFactor: "one", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one", operation: "add" } } }],
    },
  });
  const perr = await device.popErrorScope();
  if (perr) console.error("Pipeline error:", perr.message);

  const params = { count: 1 << 17, strength: 1, swirl: 0.6, damping: 0.985, size: 2.2, reset: () => allocate() };
  const simData = new ArrayBuffer(48);
  const simBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  let particleBuf, simBG, drawBG;

  function allocate() {
    particleBuf?.destroy();
    const n = params.count, init = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {           // start on a ring with a little orbital velocity
      const a = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 0.5;
      init.set([Math.cos(a) * r * 0.6, Math.sin(a) * r, -Math.sin(a) * 0.3, Math.cos(a) * 0.3], i * 4);
    }
    particleBuf = device.createBuffer({ size: init.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(particleBuf, 0, init);
    // Same buffer, two bind groups: read_write for compute, read-only for the vertex shader.
    simBG = device.createBindGroup({ layout: simPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: particleBuf } }, { binding: 1, resource: { buffer: simBuf } }] });
    drawBG = device.createBindGroup({ layout: drawPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: particleBuf } }, { binding: 1, resource: { buffer: simBuf } }] });
  }
  allocate();

  const gui = new GUI({ title: "Parameters" });
  gui.add(params, "count", { "32k": 1 << 15, "131k": 1 << 17, "262k": 1 << 18, "524k": 1 << 19, "1M": 1 << 20 }).onChange(allocate);
  gui.add(params, "strength", 0, 4, 0.01).name("attraction");
  gui.add(params, "swirl", -2, 2, 0.01);
  gui.add(params, "damping", 0.9, 1, 0.001);
  gui.add(params, "size", 0.5, 6, 0.1).name("point size (px)");
  gui.add(params, "reset");

  // Mouse attractor: hover to steer, hold the button for a stronger pull.
  const mouse = { x: 0, y: 0, inside: false, pressed: false, lastMove: -1e9 };
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = 1 - ((e.clientY - r.top) / r.height) * 2;
    mouse.inside = true; mouse.lastMove = performance.now();
  });
  canvas.addEventListener("pointerleave", () => (mouse.inside = false));
  canvas.addEventListener("pointerdown", () => (mouse.pressed = true));
  addEventListener("pointerup", () => (mouse.pressed = false));

  function resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let last = performance.now(), fpsAvg = 60;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    fpsAvg += (1 / Math.max(now - last, 1) * 1000 - fpsAvg) * 0.05;
    last = now;
    // When the mouse is idle, a point wanders on a Lissajous curve so the scene keeps moving.
    const idle = !mouse.inside || now - mouse.lastMove > 3000;
    const t = now / 1000;
    const ax = idle ? Math.sin(t * 0.53) * 0.55 : mouse.x, ay = idle ? Math.sin(t * 0.71 + 1) * 0.45 : mouse.y;
    const f = new Float32Array(simData), u = new Uint32Array(simData);
    f.set([ax, ay, dt, canvas.width / canvas.height, params.strength, params.swirl, params.damping, (params.size * 2) / canvas.height]);
    u[8] = params.count;
    f[9] = mouse.pressed ? 1 : 0;
    device.queue.writeBuffer(simBuf, 0, simData);

    const encoder = device.createCommandEncoder();
    const cpass = encoder.beginComputePass();
    cpass.setPipeline(simPipeline);
    cpass.setBindGroup(0, simBG);
    cpass.dispatchWorkgroups(Math.ceil(params.count / WG));
    cpass.end();
    const rpass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0.02, g: 0.02, b: 0.04, a: 1 }, loadOp: "clear", storeOp: "store" }],
    });
    rpass.setPipeline(drawPipeline);
    rpass.setBindGroup(0, drawBG);
    rpass.draw(6, params.count);   // 6 vertices × N instances
    rpass.end();
    device.queue.submit([encoder.finish()]);
    PG.status(`${params.count.toLocaleString()} particles · ${Math.ceil(params.count / WG)} workgroups × ${WG} · ${fpsAvg.toFixed(0)} fps · hover to steer, hold to pull harder`);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
main();

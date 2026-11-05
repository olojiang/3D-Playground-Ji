// A WebGPU compute-shader path tracer.
// Every pixel is one GPU thread: it shoots rays through the scene (spheres + a checkered plane),
// lets them bounce off diffuse, metal and glass surfaces, and adds the result to an accumulation
// buffer. Averaging more and more random samples per pixel makes the noise melt away
// (progressive rendering). A tiny render pass then blits the storage texture to the canvas.
// Drag to orbit, wheel to zoom — any change restarts the accumulation.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const NO_GPU = "WebGPU is not available in this browser — try Chrome/Edge 113+ · 当前浏览器不支持 WebGPU";
const WG = 64; // threads per workgroup (one row segment of 64 pixels)

const TRACE_WGSL = /* wgsl */ `
struct Params {
  size : vec2u, frame : u32, spp : u32,
  bounces : u32, sun : u32, _a : u32, _b : u32,
  camPos : vec4f,
  camRight : vec4f,   // w = lens aperture (depth of field)
  camUp : vec4f,      // w = focus distance
  camFwd : vec4f,     // w = tan(fov / 2)
};
struct Sphere { center : vec3f, radius : f32, albedo : vec3f, material : f32, extra : vec4f }; // extra: fuzz, ior, emission
@group(0) @binding(0) var<uniform> P : Params;
@group(0) @binding(1) var<storage, read> spheres : array<Sphere>;
@group(0) @binding(2) var<storage, read_write> accum : array<vec4f>;   // running sum per pixel (rgb, sample count)
@group(0) @binding(3) var outTex : texture_storage_2d<rgba8unorm, write>;

// ── random numbers: a PCG hash per pixel, per frame ──
fn pcg(v : u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rand(seed : ptr<function, u32>) -> f32 { *seed = pcg(*seed); return f32(*seed) * (1.0 / 4294967296.0); }
fn randUnit(seed : ptr<function, u32>) -> vec3f {           // uniform direction on the unit sphere
  let z = rand(seed) * 2.0 - 1.0;
  let a = rand(seed) * 6.2831853;
  let r = sqrt(max(0.0, 1.0 - z * z));
  return vec3f(r * cos(a), r * sin(a), z);
}

struct Hit { t : f32, p : vec3f, n : vec3f, albedo : vec3f, material : f32, extra : vec4f, front : bool };

fn intersect(ro : vec3f, rd : vec3f) -> Hit {
  var h : Hit;
  h.t = 1e9;
  // Spheres: solve |ro + t·rd − c|² = r²
  for (var i = 0u; i < arrayLength(&spheres); i++) {
    let s = spheres[i];
    let oc = ro - s.center;
    let b = dot(oc, rd);
    let c = dot(oc, oc) - s.radius * s.radius;
    let disc = b * b - c;
    if (disc < 0.0) { continue; }
    let sq = sqrt(disc);
    var t = -b - sq;
    if (t < 1e-3) { t = -b + sq; }                          // we may be inside (glass)
    if (t > 1e-3 && t < h.t) {
      h.t = t; h.p = ro + rd * t;
      let outward = (h.p - s.center) / s.radius;
      h.front = dot(rd, outward) < 0.0;
      h.n = select(-outward, outward, h.front);             // normal always faces the ray
      h.albedo = s.albedo; h.material = s.material; h.extra = s.extra;
    }
  }
  // Ground plane y = 0 with a checkerboard (fract instead of integer %, kind to every GPU)
  if (rd.y < -1e-4) {
    let t = -ro.y / rd.y;
    if (t > 1e-3 && t < h.t) {
      h.t = t; h.p = ro + rd * t; h.n = vec3f(0.0, 1.0, 0.0); h.front = true;
      let k = fract((floor(h.p.x) + floor(h.p.z)) * 0.5);
      h.albedo = select(vec3f(0.08, 0.08, 0.11), vec3f(0.62, 0.62, 0.68), k > 0.25);
      h.material = 0.0; h.extra = vec4f(0.0);
    }
  }
  return h;
}

fn sky(d : vec3f) -> vec3f {
  let t = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  var c = mix(vec3f(0.34, 0.2, 0.26), vec3f(0.03, 0.04, 0.12), smoothstep(0.45, 0.85, t)); // dusk: horizon → zenith
  if (P.sun == 1u) { c += vec3f(14.0, 10.0, 7.0) * pow(max(dot(d, normalize(vec3f(0.6, 0.45, -0.5))), 0.0), 90.0); }
  return c;
}

fn schlick(cosine : f32, ior : f32) -> f32 {
  var r0 = (1.0 - ior) / (1.0 + ior);
  r0 = r0 * r0;
  return r0 + (1.0 - r0) * pow(1.0 - cosine, 5.0);
}

// Iterative path tracing (WGSL has no recursion): carry a "throughput" that each bounce multiplies.
fn trace(roIn : vec3f, rdIn : vec3f, seed : ptr<function, u32>) -> vec3f {
  var ro = roIn; var rd = rdIn;
  var throughput = vec3f(1.0);
  var radiance = vec3f(0.0);
  for (var b = 0u; b < P.bounces; b++) {
    let h = intersect(ro, rd);
    if (h.t >= 1e9) { radiance += throughput * sky(rd); break; }
    if (h.material > 2.5) { radiance += throughput * h.albedo * h.extra.z; break; }   // emissive
    if (h.material < 0.5) {                                   // diffuse (Lambert): random bounce around n
      rd = normalize(h.n + randUnit(seed) * 0.999);
      throughput *= h.albedo;
    } else if (h.material < 1.5) {                            // metal: mirror reflection + fuzz
      rd = normalize(reflect(rd, h.n) + randUnit(seed) * h.extra.x);
      if (dot(rd, h.n) <= 0.0) { break; }
      throughput *= h.albedo;
    } else {                                                  // glass: refract or reflect (Fresnel)
      let eta = select(h.extra.y, 1.0 / h.extra.y, h.front);
      let cosT = min(dot(-rd, h.n), 1.0);
      let sinT = sqrt(1.0 - cosT * cosT);
      if (eta * sinT > 1.0 || schlick(cosT, eta) > rand(seed)) { rd = reflect(rd, h.n); }
      else { rd = refract(rd, h.n, eta); }
    }
    ro = h.p + rd * 2e-3;
    // Russian roulette: stop weak paths early, boost the survivors to stay unbiased.
    if (b > 2u) {
      let q = clamp(max(throughput.x, max(throughput.y, throughput.z)), 0.05, 1.0);
      if (rand(seed) > q) { break; }
      throughput /= q;
    }
  }
  return radiance;
}

fn aces(x : vec3f) -> vec3f { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0)); }

// Pixel = workgroup_id.x * ${WG} + local index, row = workgroup_id.y (no global-id builtin, no integer % or /).
@compute @workgroup_size(${WG})
fn main(@builtin(workgroup_id) wg : vec3u, @builtin(local_invocation_index) lid : u32) {
  let x = wg.x * ${WG}u + lid;
  let y = wg.y;
  if (x >= P.size.x || y >= P.size.y) { return; }
  let idx = y * P.size.x + x;
  var seed = pcg(idx ^ pcg(P.frame * 9781u + 1u));
  let res = vec2f(P.size);
  var col = vec3f(0.0);
  for (var s = 0u; s < P.spp; s++) {
    // Jitter inside the pixel → free anti-aliasing once samples are averaged.
    let uv = (vec2f(f32(x), f32(y)) + vec2f(rand(&seed), rand(&seed))) / res * 2.0 - 1.0;
    let dir = normalize(P.camFwd.xyz + (uv.x * res.x / res.y * P.camRight.xyz - uv.y * P.camUp.xyz) * P.camFwd.w);
    // Thin-lens depth of field: start rays on a disc, aim them at the focus plane.
    let focus = P.camPos.xyz + dir * P.camUp.w / dot(dir, P.camFwd.xyz);
    let a = rand(&seed) * 6.2831853;
    let r = sqrt(rand(&seed)) * P.camRight.w;
    let ro = P.camPos.xyz + (P.camRight.xyz * cos(a) + P.camUp.xyz * sin(a)) * r;
    col += trace(ro, normalize(focus - ro), &seed);
  }
  var acc = select(accum[idx], vec4f(0.0), P.frame == 0u);   // frame 0 = restart
  acc += vec4f(col, f32(P.spp));
  accum[idx] = acc;
  let c = pow(aces(acc.rgb / acc.w), vec3f(1.0 / 2.2));
  textureStore(outTex, vec2u(x, y), vec4f(c, 1.0));
}`;

const BLIT_WGSL = /* wgsl */ `
@group(0) @binding(0) var img : texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) pos : vec4f) -> @location(0) vec4f {
  return textureLoad(img, vec2i(pos.xy), 0);                 // canvas and image have the same size
}`;

// Scene: center, radius, albedo, material (0 diffuse · 1 metal · 2 glass · 3 emissive), extra (fuzz, ior, emission)
const SCENE = [
  [[0, 1, 0], 1, [1, 1, 1], 2, [0, 1.5, 0]],                 // glass
  [[-2.15, 1, -0.2], 1, [0.95, 0.35, 0.3], 0, [0, 0, 0]],      // coral diffuse
  [[2.15, 1, -0.2], 1, [0.95, 0.75, 0.35], 1, [0.04, 0, 0]],   // gold metal
  [[0.1, 0.3, 1.75], 0.3, [1, 0.45, 0.15], 3, [0, 0, 5]],      // warm light bulb
  [[-1.25, 0.42, 1.6], 0.42, [0.3, 0.55, 0.95], 0, [0, 0, 0]], // blue diffuse
  [[1.35, 0.5, 1.55], 0.5, [0.92, 0.92, 0.95], 1, [0.0, 0, 0]], // mirror
  [[-0.8, 2.7, -2.8], 0.55, [0.35, 0.6, 1], 3, [0, 0, 4]],     // cool light
];

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
  PG.status("compiling the path tracer…");
  const traceModule = await compile(TRACE_WGSL, "trace"), blitModule = await compile(BLIT_WGSL, "blit");
  const tracePipe = await device.createComputePipelineAsync({ layout: "auto", compute: { module: traceModule, entryPoint: "main" } });
  const blitPipe = await device.createRenderPipelineAsync({ layout: "auto", vertex: { module: blitModule, entryPoint: "vs" }, fragment: { module: blitModule, entryPoint: "fs", targets: [{ format }] } });

  // Scene buffer: 12 floats (48 bytes) per sphere, matching struct Sphere.
  const sceneData = new Float32Array(SCENE.length * 12);
  SCENE.forEach(([c, r, alb, mat, ex], i) => sceneData.set([...c, r, ...alb, mat, ...ex, 0], i * 12));
  const sceneBuf = device.createBuffer({ size: sceneData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(sceneBuf, 0, sceneData);
  const paramBuf = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  // Size-dependent resources: accumulation buffer + output storage texture, rebuilt on resize.
  let W = 0, H = 0, accumBuf, outTex, traceBG, blitBG;
  function rebuild() {
    accumBuf?.destroy(); outTex?.destroy();
    accumBuf = device.createBuffer({ size: W * H * 16, usage: GPUBufferUsage.STORAGE });
    outTex = device.createTexture({ size: [W, H], format: "rgba8unorm", usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    traceBG = device.createBindGroup({ layout: tracePipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: paramBuf } }, { binding: 1, resource: { buffer: sceneBuf } },
      { binding: 2, resource: { buffer: accumBuf } }, { binding: 3, resource: outTex.createView() },
    ] });
    blitBG = device.createBindGroup({ layout: blitPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: outTex.createView() }] });
    frame = 0;
  }

  const params = { samplesPerFrame: 2, bounces: 5, resolution: 0.75, fov: 40, aperture: 0.04, focus: 7.4, sun: true, maxSamples: 2048, autoOrbit: false };
  let frame = 0, samples = 0;
  const restart = () => { frame = 0; };
  const gui = new GUI({ title: "Parameters" });
  gui.add(params, "samplesPerFrame", 1, 8, 1).name("samples / frame").onChange(restart);
  gui.add(params, "bounces", 1, 12, 1).name("max bounces").onChange(restart);
  gui.add(params, "resolution", 0.25, 1, 0.05).name("resolution scale").onChange(() => resize());
  gui.add(params, "fov", 20, 80, 1).name("fov (°)").onChange(restart);
  gui.add(params, "aperture", 0, 0.3, 0.005).name("aperture (DOF)").onChange(restart);
  gui.add(params, "focus", 2, 15, 0.1).name("focus distance").onChange(restart);
  gui.add(params, "sun").onChange(restart);
  gui.add(params, "maxSamples", [256, 1024, 2048, 8192]).name("stop at spp");
  gui.add(params, "autoOrbit").name("auto orbit");

  // Orbit camera.
  let yaw = -Math.PI / 2, pitch = 0.22, dist = 7.4, drag = null;
  canvas.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    yaw += (e.clientX - drag[0]) * 0.005; pitch = Math.min(1.3, Math.max(0.02, pitch + (e.clientY - drag[1]) * 0.005));
    drag = [e.clientX, e.clientY]; restart();
  });
  canvas.addEventListener("pointerup", () => (drag = null));
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); dist = Math.min(16, Math.max(3, dist * Math.exp(e.deltaY * 0.001))); restart(); }, { passive: false });

  function resize() {
    const k = Math.min(devicePixelRatio, 2) * params.resolution;
    const w = Math.max(1, Math.floor(canvas.clientWidth * k)), h = Math.max(1, Math.floor(canvas.clientHeight * k));
    canvas.width = w; canvas.height = h; // the canvas CSS size stays full; the browser upscales
    if (w !== W || h !== H) { W = w; H = h; rebuild(); }
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const u32 = new Uint32Array(8), f32 = new Float32Array(16);
  let inFlight = 0, gpuMs = 0, lastT = performance.now();
  function tick() {
    requestAnimationFrame(tick);
    const now = performance.now(), dt = (now - lastT) / 1000; lastT = now;
    if (params.autoOrbit) { yaw += dt * 0.25; restart(); }
    if (inFlight >= 2) return;                                 // never queue more than 2 frames of GPU work
    if (frame === 0) samples = 0;
    const accumulate = samples < params.maxSamples;

    // Camera basis from yaw / pitch.
    const target = [0, 0.8, 0];
    const pos = [target[0] + Math.cos(yaw) * Math.cos(pitch) * dist, target[1] + Math.sin(pitch) * dist, target[2] - Math.sin(yaw) * Math.cos(pitch) * dist];
    const fwd = normalize([target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]]);
    const right = normalize(cross(fwd, [0, 1, 0])), up = cross(right, fwd);
    u32.set([W, H, frame, params.samplesPerFrame, params.bounces, params.sun ? 1 : 0, 0, 0]);
    f32.set([...pos, 1, ...right, params.aperture, ...up, params.focus, ...fwd, Math.tan((params.fov * Math.PI) / 360)]);
    device.queue.writeBuffer(paramBuf, 0, u32);
    device.queue.writeBuffer(paramBuf, 32, f32);

    const enc = device.createCommandEncoder();
    if (accumulate) {
      const pass = enc.beginComputePass();
      pass.setPipeline(tracePipe);
      pass.setBindGroup(0, traceBG);
      pass.dispatchWorkgroups(Math.ceil(W / WG), H);            // one thread per pixel
      pass.end();
    }
    const rp = enc.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    rp.setPipeline(blitPipe);
    rp.setBindGroup(0, blitBG);
    rp.draw(3);
    rp.end();
    const t0 = performance.now();
    device.queue.submit([enc.finish()]);
    if (accumulate) { frame++; samples += params.samplesPerFrame; }
    inFlight++;
    device.queue.onSubmittedWorkDone().then(() => {
      inFlight--;
      if (accumulate) gpuMs = gpuMs * 0.8 + (performance.now() - t0) * 0.2;
      const rays = (W * H * params.samplesPerFrame) / (gpuMs / 1000) / 1e6;
      PG.status(`${samples} samples/pixel${accumulate ? "" : " (done)"} · ${W}×${H} · ${Math.ceil(W / WG)}×${H} workgroups of ${WG}\n` +
        `≈ ${gpuMs.toFixed(1)} ms per frame · ${rays.toFixed(1)} M camera rays/s · max ${params.bounces} bounces`);
    });
  }
  requestAnimationFrame(tick);
}
const normalize = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
main();

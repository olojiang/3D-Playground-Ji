// Buffers & bind groups — feeding data to WebGPU shaders.
// Vertex buffer (per-vertex data) + index buffer + uniform buffer (per-frame data, bound via a bind group).
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const NO_GPU = "WebGPU is not available in this browser — try Chrome/Edge 113+ · 当前浏览器不支持 WebGPU";

const WGSL = /* wgsl */ `
// Uniforms: identical for every vertex/fragment in a draw. Layout follows WGSL alignment rules
// (a vec2f is 8-byte aligned, the struct size rounds up to 16 bytes).
struct Uniforms {
  time   : f32,
  aspect : f32,
  spin   : f32,
  pulse  : f32,
  hue    : f32,
  petals : f32,
  _pad   : vec2f,
};
@group(0) @binding(0) var<uniform> u : Uniforms;

struct VSIn {
  @location(0) pos   : vec2f,   // from the vertex buffer, offset 0
  @location(1) color : vec3f,   // from the same buffer, offset 8 (interleaved)
  @location(2) ring  : f32,     // 0 at the centre, 1 at the rim
};
struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) color : vec3f,
  @location(1) ring : f32,
};

fn hueShift(c : vec3f, a : f32) -> vec3f {   // rotate colour around the grey axis
  let k = vec3f(0.57735);
  let ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

@vertex
fn vs_main(v : VSIn) -> VSOut {
  let ang = atan2(v.pos.y, v.pos.x);
  // Breathing petals: radius wobbles with angle and time (driven by the uniform buffer).
  let r = 1.0 + u.pulse * v.ring * 0.25 * sin(ang * u.petals + u.time * 2.0);
  let c = cos(u.time * u.spin);
  let s = sin(u.time * u.spin);
  let p = mat2x2f(c, s, -s, c) * (v.pos * r);
  var o : VSOut;
  o.pos = vec4f(p.x / u.aspect, p.y, 0.0, 1.0) * vec4f(0.8, 0.8, 1.0, 1.0);
  o.color = hueShift(v.color, u.hue + u.time * 0.3);
  o.ring = v.ring;
  return o;
}

@fragment
fn fs_main(i : VSOut) -> @location(0) vec4f {
  let glow = 0.45 + 0.55 * smoothstep(1.0, 0.0, i.ring);       // brighter towards the centre
  let bands = 0.88 + 0.12 * cos(i.ring * 60.0 - u.time * 3.0);  // ripples moving outward
  return vec4f(pow(i.color * glow * bands, vec3f(1.2)), 1.0);
}`;

// Build a "flower" mesh on the CPU: rings of vertices, interleaved [x, y, r, g, b, ring].
function buildFlower(segments, rings) {
  const verts = [], idx = [];
  // Smooth cosine palette: colour varies with angle and radius → a vivid gradient.
  const pal = (t) => [0, 0.33, 0.67].map((ph) => 0.5 + 0.5 * Math.cos(6.2832 * (t + ph)));
  verts.push(0, 0, 1, 1, 1, 0); // centre vertex (white)
  for (let r = 1; r <= rings; r++) {
    const rad = r / rings;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const col = pal(Math.abs(s / segments - 0.5) * 2 + rad * 0.35);
      verts.push(Math.cos(a) * rad, Math.sin(a) * rad, ...col, rad);
    }
  }
  const at = (r, s) => (r === 0 ? 0 : 1 + (r - 1) * segments + (s % segments));
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      if (r === 0) idx.push(0, at(1, s), at(1, s + 1));
      else idx.push(at(r, s), at(r + 1, s), at(r + 1, s + 1), at(r, s), at(r + 1, s + 1), at(r, s + 1));
    }
  }
  return { verts: new Float32Array(verts), idx: new Uint32Array(idx) };
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

  const module = device.createShaderModule({ code: WGSL });
  for (const m of (await module.getCompilationInfo()).messages) if (m.type === "error") console.error(`WGSL line ${m.lineNum}: ${m.message}`);

  // --- Vertex + index buffers: create with the right usage, then upload once with writeBuffer.
  const mesh = buildFlower(96, 12);
  const vbo = device.createBuffer({ label: "flower vertices", size: mesh.verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(vbo, 0, mesh.verts);
  const ibo = device.createBuffer({ label: "flower indices", size: mesh.idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(ibo, 0, mesh.idx);

  // --- Uniform buffer: 8 floats = 32 bytes, rewritten every frame.
  const uniformData = new Float32Array(8);
  const ubo = device.createBuffer({ label: "uniforms", size: uniformData.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  // --- Bind group layout: the "shape" of the resources (what kind, which binding, which stages).
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
  });
  // --- Bind group: the actual buffers plugged into that shape.
  const bindGroup = device.createBindGroup({ layout: bindGroupLayout, entries: [{ binding: 0, resource: { buffer: ubo } }] });

  device.pushErrorScope("validation");
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }), // @group(0)
    vertex: {
      module, entryPoint: "vs_main",
      // How to read the vertex buffer: stride 24 bytes, three attributes interleaved.
      buffers: [{
        arrayStride: 6 * 4,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x2" },
          { shaderLocation: 1, offset: 8, format: "float32x3" },
          { shaderLocation: 2, offset: 20, format: "float32" },
        ],
      }],
    },
    fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
    multisample: { count: 4 },
  });
  const err = await device.popErrorScope();
  if (err) console.error("Pipeline error:", err.message);

  const params = { spin: 0.4, pulse: 1, hue: 0, petals: 6 };
  const gui = new GUI({ title: "Parameters" });
  gui.add(params, "spin", -2, 2, 0.01);
  gui.add(params, "pulse", 0, 2, 0.01);
  gui.add(params, "petals", 1, 16, 1);
  gui.add(params, "hue", 0, 6.28, 0.01);

  // MSAA needs its own multisampled colour texture, recreated whenever the canvas resizes.
  let msaa = null;
  function resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    msaa?.destroy();
    msaa = device.createTexture({ size: [canvas.width, canvas.height], format, sampleCount: 4, usage: GPUTextureUsage.RENDER_ATTACHMENT });
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let framesInFlight = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (framesInFlight >= 2) return; // never queue work faster than the GPU finishes it
    // Update uniforms on the CPU, then copy them to the GPU buffer (queued, cheap).
    uniformData.set([t / 1000, canvas.width / canvas.height, params.spin, params.pulse, params.hue, params.petals]);
    device.queue.writeBuffer(ubo, 0, uniformData);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: msaa.createView(),
        resolveTarget: context.getCurrentTexture().createView(), // MSAA resolves into the canvas
        clearValue: { r: 0.043, g: 0.043, b: 0.07, a: 1 }, loadOp: "clear", storeOp: "discard",
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);          // @group(0) ← our uniform buffer
    pass.setVertexBuffer(0, vbo);             // buffers[0] in the pipeline
    pass.setIndexBuffer(ibo, "uint32");
    pass.drawIndexed(mesh.idx.length);
    pass.end();
    device.queue.submit([encoder.finish()]);
    framesInFlight++;
    device.queue.onSubmittedWorkDone().then(() => framesInFlight--);
  }
  PG.status(`${mesh.verts.length / 6} vertices · ${mesh.idx.length / 3} triangles · uniform buffer ${uniformData.byteLength} B rewritten every frame`);
  requestAnimationFrame(frame);
}
main();

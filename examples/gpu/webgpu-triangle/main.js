// Hello WebGPU — the full path from "is there a GPU?" to a triangle on screen.
// adapter → device → canvas context → shader module → render pipeline → command encoder → render pass → submit
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const NO_GPU = "WebGPU is not available in this browser — try Chrome/Edge 113+ · 当前浏览器不支持 WebGPU";

// WGSL: one module can hold several entry points. No vertex buffers yet:
// the positions and colours are constants indexed by the built-in vertex_index.
const WGSL = /* wgsl */ `
struct VSOut {
  @builtin(position) pos : vec4f,   // clip-space position (required output)
  @location(0) color : vec3f,       // interpolated across the triangle → fragment shader
};

@vertex
fn vs_main(@builtin(vertex_index) i : u32) -> VSOut {
  var P = array<vec2f, 3>(vec2f(0.0, 0.72), vec2f(-0.68, -0.56), vec2f(0.68, -0.56));
  var C = array<vec3f, 3>(vec3f(1.0, 0.33, 0.45), vec3f(0.25, 0.6, 1.0), vec3f(1.0, 0.82, 0.25));
  var o : VSOut;
  o.pos = vec4f(P[i], 0.0, 1.0);
  o.color = C[i];
  return o;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4f {
  // A little gamma lift so the blend between corners looks smooth and bright.
  return vec4f(pow(in.color, vec3f(0.85)), 1.0);
}`;

async function main() {
  // 1. Feature detection: navigator.gpu exists only where WebGPU is supported.
  if (!navigator.gpu) return PG.status(NO_GPU);
  // 2. Adapter = a physical GPU (or a software one). It can be null even when navigator.gpu exists.
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return PG.status(NO_GPU);
  // 3. Device = your private, logical connection to that GPU. Everything is created from it.
  const device = await adapter.requestDevice();
  device.addEventListener("uncapturederror", (e) => console.error("WebGPU error:", e.error.message));
  device.lost.then((info) => console.warn("WebGPU device lost:", info.message));

  // 4. Configure the canvas: which device draws into it and in which pixel format.
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat(); // "bgra8unorm" or "rgba8unorm"
  context.configure({ device, format, alphaMode: "opaque" });

  // 5. Compile WGSL. Errors are reported asynchronously via getCompilationInfo().
  const module = device.createShaderModule({ label: "triangle", code: WGSL });
  for (const m of (await module.getCompilationInfo()).messages) {
    (m.type === "error" ? console.error : console.warn)(`WGSL ${m.type} (line ${m.lineNum}): ${m.message}`);
  }

  // 6. A render pipeline bakes shaders + fixed-function state into one immutable object.
  //    Changing topology means creating a new pipeline — that is by design (fast to switch, slow to make).
  const pipelines = {};
  async function getPipeline(topology) {
    if (pipelines[topology]) return pipelines[topology];
    device.pushErrorScope("validation");
    const p = device.createRenderPipeline({
      label: `triangle-${topology}`,
      layout: "auto",
      vertex: { module, entryPoint: "vs_main" },
      fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
      primitive: { topology },
    });
    const err = await device.popErrorScope();
    if (err) console.error("Pipeline error:", err.message);
    return (pipelines[topology] = p);
  }

  const params = { background: "#0b0b12", topology: "triangle-list", pulse: true };
  let pipeline = await getPipeline(params.topology);
  const gui = new GUI({ title: "Parameters" });
  gui.addColor(params, "background");
  gui.add(params, "topology", ["triangle-list", "line-strip", "point-list"]).onChange(async (t) => (pipeline = await getPipeline(t)));
  gui.add(params, "pulse").name("pulse clear colour");

  function resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  function frame(t) {
    const [r, g, b] = hex(params.background);
    const k = params.pulse ? 1 + 0.6 * Math.sin(t * 0.0015) : 1;
    // 7. Record commands: an encoder collects work; nothing runs until submit().
    const encoder = device.createCommandEncoder();
    // 8. A render pass targets this frame's canvas texture: clear it, then draw.
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: r * k, g: g * k, b: b * k, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.setPipeline(pipeline);
    pass.draw(3); // 3 vertices → vs_main runs 3 times with vertex_index 0, 1, 2
    pass.end();
    // 9. Hand the finished command buffer to the GPU queue.
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }
  PG.status(`WebGPU ✓  adapter: ${adapter.info?.vendor || "unknown"} ${adapter.info?.architecture || ""} · canvas format: ${format}`);
  requestAnimationFrame(frame);
}
main();

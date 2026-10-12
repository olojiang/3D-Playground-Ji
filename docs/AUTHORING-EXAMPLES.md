# Authoring examples / 编写示例

Every lesson in 3D Playground is one folder:

```
examples/<category>/<slug>/
  meta.json   bilingual metadata + concept article
  main.js     the runnable program (shown in the editor, run in the sandbox)
```

`category` is one of `three`, `webgl`, `gpu`. `slug` is kebab-case and must equal the folder name.
`node scripts/gen-examples.mjs` bundles all folders into `src/generated/examples.json` (runs automatically before dev, build and test).

## main.js — the runtime contract

The program runs inside `public/sandbox.html`, a sandboxed iframe, as an ES module.

- A full-size canvas already exists: use `PG.canvas` (same as `document.getElementById("c")`). Do not create your own top-level canvas.
- Allowed imports only (import map, served locally from `/vendor/three`):
  `three`, `three/webgpu`, `three/tsl`, `three/addons/<path>.js` (e.g. `three/addons/controls/OrbitControls.js`, `three/addons/libs/lil-gui.module.min.js`, `three/addons/postprocessing/EffectComposer.js`).
  Raw WebGL / WebGPU examples need no imports at all.
- **No network.** No URLs, no `fetch`, no external textures/models. Generate textures procedurally (`CanvasTexture`, `DataTexture`, typed arrays).
- **Responsive.** Keep the drawing buffer in sync with `canvas.clientWidth/clientHeight` (use `new ResizeObserver(resize).observe(canvas)`), and multiply by `Math.min(devicePixelRatio, 2)` for raw WebGL/WebGPU.
- **Animate with `requestAnimationFrame` or `renderer.setAnimationLoop`.** The sandbox wraps rAF to provide pause/resume and an FPS meter for free.
- Use `THREE.Timer` (not the deprecated `THREE.Clock`): `timer.update(time); timer.getDelta()`.
- Parameters: use lil-gui (`import GUI from "three/addons/libs/lil-gui.module.min.js"`), title it `"Parameters"`. The sandbox styles it.
- Text/numbers you want users to see (timings, results): `PG.status("...")` writes a monospace line at the bottom-left of the canvas. `console.log` goes to the in-app console panel.
- **WebGPU examples must degrade gracefully**: check `navigator.gpu` and `await navigator.gpu.requestAdapter()`; if missing, call `PG.status("WebGPU is not available in this browser — try Chrome/Edge 113+ · 当前浏览器不支持 WebGPU")` and return.
- Comment the code for learners: short comments that name the concept at each step (English in code comments is fine).
- Keep it focused: one concept per example, ~60–200 lines, readable top to bottom. Dark background (`#0b0b12`-ish) so it looks good in every app theme.

## meta.json

```json
{
  "slug": "scene-camera-renderer",
  "order": 1,                                 // unique within the category, sets list order
  "difficulty": "beginner",                   // beginner | intermediate | advanced
  "requires": "webgl",                        // webgl | webgl2 | webgpu
  "tags": ["scene", "camera"],                // 1–8 lowercase kebab tags
  "title":   { "zh": "…", "en": "…" },
  "summary": { "zh": "一句话", "en": "One sentence" },
  "concepts": { "zh": "markdown…", "en": "markdown…" },
  "keyApis": ["THREE.Scene", "gl.createShader"],
  "tryThis": { "zh": ["练习…"], "en": ["Exercise…"] }
}
```

`concepts` is a short article (zh > 200 chars, en > 300 chars; aim for 250–600 words) rendered with a small markdown subset:
`## h2`, `### h3`, paragraphs, `- ` lists, `1. ` lists, `**bold**`, `` `code` ``, fenced code blocks with a language (```glsl, ```wgsl, ```js), `> ` callouts, and `[text](https://…)` links. No tables, no raw HTML, no images.
Both languages must say the same thing; write natural Chinese, not machine-translated.

## Checking your work

```
node scripts/gen-examples.mjs && npx vitest run tests/examples      # schema, bilingual, imports, no network
node scripts/serve-dev.mjs 4600 &                                    # once
python3 scripts/check_example.py three/scene-camera-renderer         # runs in headless Chromium (WebGL + WebGPU via SwiftShader)
```

`check_example.py` prints console errors and saves a screenshot to `work-shots/`. Look at the screenshot.

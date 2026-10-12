// Copies three.js ES modules into public/vendor/three so the sandbox iframe can import them
// through an import map (no CDN: works offline and in mainland China).
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "node_modules/three");
const out = path.join(root, "public/vendor/three");
const SKIP = new Set(["libs/basis", "libs/draco", "inspector", "libs/demuxer_mp4.js"]);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "build"), { recursive: true });
for (const f of ["three.module.js", "three.core.js", "three.webgpu.js", "three.tsl.js"]) fs.copyFileSync(path.join(src, "build", f), path.join(out, "build", f));
function copyDir(from, to, rel = "") {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (SKIP.has(r)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b, r);
    else if (/\.(js|wasm|json)$/.test(e.name)) fs.copyFileSync(a, b);
  }
}
copyDir(path.join(src, "examples/jsm"), path.join(out, "addons"));
const version = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8")).version;
fs.writeFileSync(path.join(out, "VERSION"), version);
console.log("three vendored", version);

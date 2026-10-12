// Collects examples/<category>/<slug>/{meta.json,main.js} into src/generated/examples.json.
// Run automatically before dev/build/test (see package.json). Validation lives in tests/examples.test.ts.
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const out = [];
for (const category of ["three", "webgl", "gpu"]) {
  const dir = path.join(root, "examples", category);
  if (!fs.existsSync(dir)) continue;
  for (const slug of fs.readdirSync(dir).sort()) {
    const d = path.join(dir, slug);
    if (!fs.statSync(d).isDirectory()) continue;
    const meta = JSON.parse(fs.readFileSync(path.join(d, "meta.json"), "utf8"));
    const code = fs.readFileSync(path.join(d, "main.js"), "utf8");
    out.push({ ...meta, category, dir: slug, code });
  }
}
fs.mkdirSync(path.join(root, "src/generated"), { recursive: true });
fs.writeFileSync(path.join(root, "src/generated/examples.json"), JSON.stringify(out));
console.log(`examples: ${out.length}`);

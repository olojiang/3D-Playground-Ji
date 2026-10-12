// Minimal static server for checking examples outside Next: serves public/ and examples/.
// usage: node scripts/serve-dev.mjs [port]   then open /sandbox.html?src=/examples/<cat>/<slug>/main.js
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.argv[2] || 4600);
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png" };
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = p.startsWith("/examples/") ? path.join(root, p) : path.join(root, "public", p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`dev server http://localhost:${port}`));

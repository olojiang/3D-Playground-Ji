"""Run one or more examples in headless Chromium and report console errors + a screenshot.
usage: python3 scripts/check_example.py three/hello-cube [webgl/xyz ...]
Needs `node scripts/serve-dev.mjs 4600` running. Screenshots go to work-shots/<cat>-<slug>.png
"""
import sys, os, json
from playwright.sync_api import sync_playwright
BASE = os.environ.get("BASE", "http://localhost:4600")
os.makedirs("work-shots", exist_ok=True)
args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU", "--use-webgpu-adapter=swiftshader"]
ok = True
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/chromium", args=args)
    for ident in sys.argv[1:]:
        cat, slug = ident.split("/")
        pg = b.new_page(viewport={"width": 900, "height": 560})
        logs = []
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        pg.goto(f"{BASE}/sandbox.html?src=/examples/{cat}/{slug}/main.js")
        pg.wait_for_timeout(int(os.environ.get("WAIT", "3000")))
        shot = f"work-shots/{cat}-{slug}.png"
        pg.screenshot(path=shot)
        status = pg.evaluate("document.getElementById('out').textContent")
        errs = [l for l in logs if l.startswith("[error]") or l.startswith("[pageerror]")]
        ok = ok and not errs
        print(json.dumps({"example": ident, "errors": errs, "status": status, "logs": logs[-8:], "screenshot": shot}, ensure_ascii=False))
        pg.close()
    b.close()
sys.exit(0 if ok else 1)

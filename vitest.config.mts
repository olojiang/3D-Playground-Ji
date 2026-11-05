import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  // tsconfig keeps jsx: "preserve" for Next; tests that import .tsx (e.g. the OG renderer) need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["tests/**/*.test.ts"], environment: "node", testTimeout: 30000 },
});

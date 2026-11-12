// The @oak/notation browser page (port 5194): abcjs renders real ABC so the DOM half of the package
// (`renderStaff`, `measureStaff`, `placeAnnotations`) is tested against real SVG. Run on Node:
//   node node_modules/vite/bin/vite.js --config packages/notation/e2e/vite.config.ts
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const PORT = 5194;

export default defineConfig({
  root: here,
  cacheDir: join(here, ".vite-cache"),
  server: { host: "127.0.0.1", port: PORT, strictPort: true, fs: { allow: [repoRoot] }, hmr: false },
  // Crawl the page up front: a dependency discovered mid-test would reload the page under the spec.
  optimizeDeps: { entries: ["index.html"], include: ["abcjs"] },
});

import { resolve } from "node:path";
import { defineConfig } from "vite";

// Spike-local Vite config. Run with: node ../../node_modules/vite/bin/vite.js --config vite.config.ts
export default defineConfig({
  root: resolve(import.meta.dirname, "web"),
  cacheDir: resolve(import.meta.dirname, ".vite"),
  server: { port: 5184, strictPort: true, host: "127.0.0.1" },
  preview: { port: 5184, strictPort: true, host: "127.0.0.1" },
  build: { outDir: resolve(import.meta.dirname, "dist"), emptyOutDir: true },
});

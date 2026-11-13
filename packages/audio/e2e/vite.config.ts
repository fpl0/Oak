// The @oak/audio e2e page (port 5191). Run through playwright.config.ts, which starts and stops it.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const PORT = 5191;

export default defineConfig({
  root,
  // Own dep cache: parallel dev servers must not share <repo>/node_modules/.vite (spike S5 gotcha 6).
  cacheDir: `${root}/.vite`,
  // No HMR: other packages are edited while the specs run, and a reload would kill a running test.
  server: { port: PORT, strictPort: true, host: "127.0.0.1", hmr: false },
  preview: { port: PORT, strictPort: true, host: "127.0.0.1" },
  build: { outDir: `${root}/dist`, emptyOutDir: true, sourcemap: false },
  // Pre-bundle at start-up: a dependency first met at runtime (signalsmith-stretch is imported
  // dynamically) makes Vite re-optimize and reload the page in the middle of a test.
  optimizeDeps: {
    include: [
      "pitchy",
      "signalsmith-stretch",
      "@strudel/core",
      "zod",
      "tonal",
      "wavesurfer.js",
      "wavesurfer.js/dist/plugins/regions.esm.js",
      "wavesurfer.js/dist/plugins/spectrogram.esm.js",
      "wavesurfer.js/dist/plugins/timeline.esm.js",
      "wavesurfer.js/dist/plugins/zoom.esm.js",
    ],
  },
  // wavesurfer's spectrogram probes Node's `worker_threads` behind a guarded `require`.
  resolve: { alias: { worker_threads: `${root}/empty-module.ts` } },
  logLevel: "warn",
});

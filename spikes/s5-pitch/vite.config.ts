import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  // keep Vite's dep cache inside the spike folder (default would be <repo>/node_modules/.vite, shared with other spikes)
  cacheDir: `${root}/.vite-cache`,
  server: { port: 5185, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5185, strictPort: true, host: '127.0.0.1' },
  build: {
    outDir: `${root}/dist`,
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: { input: { index: `${root}/index.html`, strudel: `${root}/strudel.html` } },
  },
});

// Experiment config: cold dep cache + scanner restricted to worklet-only.html
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root,
  cacheDir: `${root}/.vite-cache-cold`,
  optimizeDeps: { entries: ['worklet-only.html'], ...(process.env.S5_INCLUDE ? { include: ['pitchy'] } : {}) },
  server: { port: 5185, strictPort: true, host: '127.0.0.1' },
});

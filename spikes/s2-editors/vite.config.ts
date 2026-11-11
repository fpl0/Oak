import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

// Spike S2. Run with:  node node_modules/vite/bin/vite.js --config spikes/s2-editors/vite.config.ts
export default defineConfig({
  root,
  // keep Vite's dep cache inside the spike folder (never touch the repo's node_modules)
  cacheDir: `${root}.vite-cache`,
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5182, strictPort: true },
  preview: { host: '127.0.0.1', port: 5182, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
  optimizeDeps: {
    // pre-bundle everything up front so the first page load never triggers a "new dependencies optimized" reload
    include: process.env.S2_NO_INCLUDE ? [] : [
      'react',
      'react-dom/client',
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/autocomplete',
      '@codemirror/lint',
      '@strudel/core',
      '@strudel/mini',
      '@strudel/tonal',
      '@strudel/draw',
      '@strudel/transpiler',
      '@strudel/webaudio',
      '@strudel/codemirror',
      'worker-timers',
    ],
  },
});

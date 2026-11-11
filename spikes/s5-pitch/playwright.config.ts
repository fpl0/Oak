import { defineConfig } from '@playwright/test';

// S5_MODE=dev      -> Vite dev server
// S5_MODE=preview  -> vite build && vite preview (production bundle)
const mode = process.env.S5_MODE ?? 'dev';
const vite = 'node ../../node_modules/vite/bin/vite.js';
const PORT = 5185;

export default defineConfig({
  testDir: './e2e',
  // NOT *.spec.ts / *.test.ts: root `bun test` would pick those up and try to run Playwright files under Bun
  testMatch: /.*\.e2e\.ts$/,
  outputDir: './results/pw',
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  timeout: 90_000,
  use: { baseURL: `http://127.0.0.1:${PORT}`, headless: true },
  projects: [
    // default: chromium_headless_shell (what `playwright install chromium --only-shell` gives CI)
    { name: 'headless-shell', use: { browserName: 'chromium' } },
    // full Chromium in "new headless" mode
    { name: 'chromium-new-headless', use: { browserName: 'chromium', channel: 'chromium' } },
  ],
  webServer: {
    command:
      mode === 'dev'
        ? `${vite} --config vite.config.ts`
        : `${vite} build --config vite.config.ts && ${vite} preview --config vite.config.ts`,
    cwd: import.meta.dirname,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

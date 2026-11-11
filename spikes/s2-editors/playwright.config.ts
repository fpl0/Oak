import { defineConfig } from '@playwright/test';

// MODE=dev (default): Vite dev server (React StrictMode double-mount active)
// MODE=preview:       production build served by `vite preview`
const MODE = process.env.MODE === 'preview' ? 'preview' : 'dev';
const VITE = 'node ../../node_modules/vite/bin/vite.js';
const PORT = 5182;

export default defineConfig({
  testDir: '.',
  // NOT *.spec.ts / *.test.ts: the repo-root `bun test` would pick the file up and fail on Playwright's test()
  testMatch: 'e2e.pw.ts',
  outputDir: `./test-results/${MODE}`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, headless: true, viewport: { width: 1000, height: 800 } },
  projects: [
    {
      // audio allowed without a gesture (the flag the task asks for)
      name: 'autoplay',
      grepInvert: /@gesture/,
      use: { launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } },
    },
    {
      // Chrome's DEFAULT autoplay policy: proves the real unlock sequence (gesture -> resume -> initAudio)
      name: 'gesture',
      grep: /@gesture/,
      use: { launchOptions: { args: ['--autoplay-policy=document-user-activation-required'] } },
    },
  ],
  webServer: {
    command: MODE === 'preview' ? `${VITE} preview --config vite.config.ts` : `${VITE} --config vite.config.ts`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

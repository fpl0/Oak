// Playwright for @oak/strudel: `bunx playwright test -c packages/strudel/e2e/playwright.config.ts`.
// Specs are *.pw.ts so the root `bun test` ignores them. The dev server runs on Node (never bunx --bun vite).
import { defineConfig } from "@playwright/test";

const PORT = 5192;

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.pw\.ts/,
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    viewport: { width: 1000, height: 900 },
  },
  projects: [
    {
      name: "autoplay",
      grepInvert: /@gesture/,
      use: { launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } },
    },
    {
      // Chrome's default policy: the page must unlock audio from a real gesture.
      name: "gesture",
      grep: /@gesture/,
      use: { launchOptions: { args: ["--autoplay-policy=document-user-activation-required"] } },
    },
  ],
  webServer: {
    command: "node ../../../node_modules/vite/bin/vite.js --config vite.config.ts",
    cwd: import.meta.dirname,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

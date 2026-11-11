// Runs the e2e/ specs against a stack that is ALREADY running (no web servers are started or stopped):
//   OAK_DEV=1 bun server/src/main.ts              (8787)
//   node node_modules/vite/bin/vite.js --config app/vite.config.ts   (5173)
//   optionally the production build on OAK_PROD_URL (default http://127.0.0.1:8790)
// Usage: bunx playwright test -c e2e/attached.config.ts [spec]
// The root playwright.config.ts remains the one that `bun run e2e` uses; this one is for quick iteration.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  testDir: `${root}e2e`,
  testMatch: /.*\.pw\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: `${root}test-results/e2e-attached`,
  timeout: 120_000,
  use: {
    headless: true,
    browserName: "chromium",
    trace: "retain-on-failure",
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
});

// S3 spike Playwright config. Run from this folder:
//   bunx playwright test                 # dev-server specs (tests/*.dev.spec.ts) on port 5183
//   S3_MODE=preview bunx playwright test # production build + preview, Service Worker offline spec
import { defineConfig } from "@playwright/test";

const preview = process.env.S3_MODE === "preview";
const vite = "node ../../node_modules/vite/bin/vite.js";

export default defineConfig({
  testDir: "./tests",
  testMatch: preview ? /.*\.preview\.spec\.ts/ : /.*\.dev\.spec\.ts/,
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5183",
    headless: true,
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  // preview specs start/stop their own server (they kill it mid-test to prove offline replay)
  webServer: preview
    ? undefined
    : {
        command: `${vite} --port 5183 --strictPort`,
        url: "http://127.0.0.1:5183/",
        reuseExistingServer: false,
        timeout: 60_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});

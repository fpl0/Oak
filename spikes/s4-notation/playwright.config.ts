import { defineConfig } from "@playwright/test";

// OAK_S4_MODE=preview runs against the production build (`vite build` must have run); default is the dev server.
const preview = process.env.OAK_S4_MODE === "preview";
const vite = "node ../../node_modules/vite/bin/vite.js";

export default defineConfig({
  testDir: ".",
  testMatch: "e2e.pw.ts", // not *.test.ts / *.spec.ts, so `bun test` ignores it
  outputDir: "./test-results",
  reporter: [["list"]],
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5184",
    headless: true,
    viewport: { width: 900, height: 1000 },
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  webServer: {
    command: preview ? `${vite} preview --config vite.config.ts` : `${vite} --config vite.config.ts`,
    url: "http://127.0.0.1:5184",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

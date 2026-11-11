// @oak/audio browser proofs. From the repo root:
//   OAK_AUDIO_E2E=dev     bunx playwright test -c packages/audio/e2e/playwright.config.ts   (Vite dev server)
//   OAK_AUDIO_E2E=preview bunx playwright test -c packages/audio/e2e/playwright.config.ts   (vite build + preview)
// Playwright starts the server on 127.0.0.1:5191 and stops it afterwards. Specs are *.pw.ts so `bun test`
// ignores them.
import { defineConfig } from "@playwright/test";

export const MODE = process.env.OAK_AUDIO_E2E === "preview" ? "preview" : "dev";
const PORT = 5191;
const here = import.meta.dirname;
const vite = "node ../../../node_modules/vite/bin/vite.js";
const fixtures = "bun make-fixtures.bun.ts";

export default defineConfig({
  testDir: here,
  testMatch: /.*\.pw\.ts$/,
  outputDir: `${here}/.results`,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  timeout: 60_000,
  use: { baseURL: `http://127.0.0.1:${PORT}`, headless: true },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command:
      MODE === "dev"
        ? `${fixtures} && ${vite} --config vite.config.ts`
        : `${fixtures} && ${vite} build --config vite.config.ts && ${vite} preview --config vite.config.ts`,
    cwd: here,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

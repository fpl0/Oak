// @oak/audio browser proofs. From the repo root:
//   OAK_AUDIO_E2E=dev     bunx playwright test -c packages/audio/e2e/playwright.config.ts   (Vite dev server)
//   OAK_AUDIO_E2E=preview bunx playwright test -c packages/audio/e2e/playwright.config.ts   (vite build + preview)
// Playwright starts the server on 127.0.0.1:5191 and stops it afterwards. Specs are *.pw.ts so `bun test`
// ignores them.
import { defineConfig } from "@playwright/test";
import { E2E_SUFFIX, shifted } from "../../../e2e/support/stack.ts";

export const MODE = process.env.OAK_AUDIO_E2E === "preview" ? "preview" : "dev";
// vite.config.ts pins 5191; `--port` moves it with OAK_E2E_SHIFT (e2e/support/stack.ts).
const PORT = shifted(5191);
const here = import.meta.dirname;
const vite = "node ../../../node_modules/vite/bin/vite.js";
const fixtures = "bun make-fixtures.bun.ts";

export default defineConfig({
  testDir: here,
  testMatch: /.*\.pw\.ts$/,
  outputDir: `${here}/.results${E2E_SUFFIX.replace("-", "/")}`,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  timeout: 60_000,
  use: { baseURL: `http://127.0.0.1:${PORT}`, headless: true },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command:
      MODE === "dev"
        ? `${fixtures} && ${vite} --config vite.config.ts --port ${PORT} --strictPort`
        : `${fixtures} && ${vite} build --config vite.config.ts && ${vite} preview --config vite.config.ts --port ${PORT} --strictPort`,
    cwd: here,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

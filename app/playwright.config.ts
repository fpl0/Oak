// Playwright smoke suite for the app shell. Two modes on port 5173 (the app's own port):
//   bunx playwright test -c app/playwright.config.ts                  Vite dev server
//   E2E_MODE=preview bunx playwright test -c app/playwright.config.ts production build + vite preview (real CSP)
// The API is stubbed in the page (app/e2e/stub-api.ts), so no Oak server is needed and port 8787 is never touched.
import { defineConfig } from "@playwright/test";

const preview = process.env.E2E_MODE === "preview";
const vite = "node node_modules/vite/bin/vite.js";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.pw\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  outputDir: "../test-results/app-e2e",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    // No device descriptor: its Windows user agent would make the page use Ctrl as Mod while Playwright's
    // ControlOrMeta presses ⌘ on a Mac host. The real browser's platform keeps both sides in step.
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    // The production build registers sw.js, whose own fetches would bypass the in-page API stub.
    serviceWorkers: "block",
  },
  webServer: {
    command: preview
      ? `${vite} build --config app/vite.config.ts && ${vite} preview --config app/vite.config.ts`
      : `${vite} --config app/vite.config.ts`,
    cwd: "..",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [{ name: preview ? "preview" : "dev" }],
});

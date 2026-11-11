// Workbench e2e: `bunx playwright test -c app/src/workbench/e2e/playwright.config.ts`
// Starts its own Vite page on 127.0.0.1:5193 (Node) and stops it afterwards.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const PORT = 5193;

export default defineConfig({
  testDir: here,
  testMatch: "*.pw.ts",
  outputDir: `${here}test-results`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    viewport: { width: 1280, height: 1000 },
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  webServer: {
    command: `node ${repoRoot}node_modules/vite/bin/vite.js --config ${here}vite.config.ts`,
    cwd: repoRoot,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

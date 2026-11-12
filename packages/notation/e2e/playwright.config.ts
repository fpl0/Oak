// @oak/notation in a real browser: `bunx playwright test -c packages/notation/e2e/playwright.config.ts` (or
// `--project notation` from the root config). Its own Vite page on 127.0.0.1:5194 (Node), stopped afterwards.
import { fileURLToPath } from "node:url";
import { type Area, areaConfig } from "../../../e2e/support/stack.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const PORT = 5194;

export const area: Area = {
  name: "notation",
  testDir: here,
  outputDir: `${here}test-results`,
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      name: `notation-vite:${PORT}`,
      command: `node ${repoRoot}node_modules/vite/bin/vite.js --config ${here}vite.config.ts`,
      cwd: repoRoot,
      url: `http://127.0.0.1:${PORT}/`,
      reuseExistingServer: false,
      timeout: 90_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
};

export default areaConfig(area);

// Workbench e2e: `bunx playwright test -c app/src/workbench/e2e/playwright.config.ts` (or `--project workbench` from
// the root config). Starts its own Vite page on 127.0.0.1:5193 (Node) and stops it afterwards.
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, E2E_SUFFIX, shifted } from "../../../../e2e/support/stack.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
// vite.config.ts pins 5193; `--port` moves it with OAK_E2E_SHIFT (e2e/support/stack.ts).
const PORT = shifted(5193);

export const area: Area = {
  name: "workbench",
  testDir: here,
  outputDir: `${here}test-results${E2E_SUFFIX.replace("-", "/")}`,
  timeout: 90_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 1000 },
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  webServer: [
    {
      name: `workbench-vite:${PORT}`,
      command: `node ${repoRoot}node_modules/vite/bin/vite.js --config ${here}vite.config.ts --port ${PORT} --strictPort`,
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

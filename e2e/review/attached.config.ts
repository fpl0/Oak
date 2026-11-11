// The review suite against a stack ALREADY running on its ports (5221 / 8821), for quick iteration:
//   OAK_DEV=1 OAK_TUTOR_FAKE=1 OAK_PORT=8821 OAK_VITE_PORT=5221 OAK_DATA_DIR=<tmp> bun server/src/main.ts
//   OAK_VITE_PORT=5221 OAK_API_PORT=8821 node node_modules/vite/bin/vite.js --config app/vite.config.ts
// Usage: bunx playwright test -c e2e/review/attached.config.ts [-g name]
import { defineConfig } from "@playwright/test";
import { area } from "./playwright.config.ts";

export default defineConfig({
  testDir: area.testDir,
  testMatch: /.*\.pw\.ts$/,
  workers: 1,
  timeout: area.timeout,
  ...(area.expect ? { expect: area.expect } : {}),
  reporter: [["list"]],
  outputDir: `${area.outputDir}-attached`,
  use: area.use,
});

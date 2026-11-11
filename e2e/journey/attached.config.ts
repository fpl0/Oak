// The journey against a stack that is ALREADY running on the journey's ports (no servers started or stopped), for
// quick iteration:
//   OAK_DEV=1 OAK_TUTOR_FAKE=1 OAK_PORT=8812 OAK_VITE_PORT=5212 OAK_DATA_DIR=<tmp> bun server/src/main.ts
//   OAK_VITE_PORT=5212 OAK_API_PORT=8812 node node_modules/vite/bin/vite.js --config app/vite.config.ts
//   bun app/src/onboarding/e2e/make-fixtures.bun.ts            (the fake-microphone WAVs, once)
// Usage: bunx playwright test -c e2e/journey/attached.config.ts [-g "Quiet"]. The production spec needs the
// journey's production server too (see ./playwright.config.ts); without it, it is skipped.
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

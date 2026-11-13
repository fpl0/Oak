// Onboarding and voice set-up, on their own stack (docs/design/wave2.md §2: ports 5209 / 8809, a throwaway data
// dir, the scripted fake tutor). Chromium gets a fake microphone fed from WAV fixtures that
// `make-fixtures.bun.ts` writes before the servers start; each spec picks its WAV with `fakeMic()`.
// Run: bunx playwright test -c app/src/onboarding/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse, withFixtures } from "../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5209,
  apiPort: 8809,
  dataDirName: "onboarding",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

// The fixtures are written before the API server starts (it is the first web server).
const webServer = stack.webServer.map((w) =>
  w.name?.startsWith("oak-api")
    ? { ...w, command: withFixtures("bun app/src/onboarding/e2e/make-fixtures.bun.ts", w.command) }
    : w,
);

export const area: Area = {
  name: "onboarding",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 420_000,
};

export default areaConfig(area);

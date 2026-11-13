// The voice area's own stack (docs/design/wave3.md §2: the spare pair 5239 / 8839, a throwaway data dir named
// `voice`, the scripted fake tutor). Chromium gets a fake microphone fed from WAVs that `make-fixtures.bun.ts`
// writes before the servers start: the pitch-gate reel built from the @oak/pitch corpus, and short takes for
// the Settings › Voice flows. Each spec picks its WAV with `fakeMic()`.
// Run: bunx playwright test -c app/src/voice/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse, withFixtures } from "../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5239,
  apiPort: 8839,
  dataDirName: "voice",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

// The fixtures are written before the API server starts (it is the first web server).
const webServer = stack.webServer.map((w) =>
  w.name?.startsWith("oak-api")
    ? { ...w, command: withFixtures("bun app/src/voice/e2e/make-fixtures.bun.ts", w.command) }
    : w,
);

export const area: Area = {
  name: "voice",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 240_000,
};

export default areaConfig(area);

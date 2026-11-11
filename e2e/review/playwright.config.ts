// The adversarial review of the learner's daily journey (Wave 2 review): the REAL stack — the Oak server with real
// content (OAK_DEV=1 for the dev clock and the seeder, the scripted fake tutor), the app on Vite, Chrome's fake
// microphone fed from onboarding's WAV fixtures — driven as a first-time learner over several simulated days, then
// broken on purpose (reloads, back/forward, double submits, a denied mic, a suspended AudioContext, a slow API, two
// tabs, midnight, wrap-and-resume, ten wrong answers). Every spec here is a regression test for a defect found.
// Run alone: bunx playwright test -c e2e/review/playwright.config.ts  (ports: Vite 5221, API 8821).
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../support/stack.ts";

export const stack = oakStack({
  vitePort: 5221,
  apiPort: 8821,
  dataDirName: "review",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

const webServer = stack.webServer.map((w) =>
  w.name?.startsWith("oak-api")
    ? {
        ...w,
        command: `bun app/src/onboarding/e2e/make-fixtures.bun.ts && bun e2e/review/make-fixtures.bun.ts && ${w.command}`,
      }
    : w,
);

export const area: Area = {
  name: "review",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer,
  use: stackUse(stack, { actionTimeout: 60_000 }),
  outputDir: stack.outputDir,
  timeout: 900_000,
  expect: { timeout: 20_000 },
};

export default areaConfig(area);

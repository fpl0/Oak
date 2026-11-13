// The Transcribe area (Wave 4, docs/design/wave4.md §2): Transcribe's list and project page, the ladder, the gym
// and own audio, on their own stack: ports 5213 / 8813, a throwaway data dir, the scripted fake tutor. Specs seed
// the learner with `POST /api/dev/seed` (`support.ts` `seed`) and block Vite's HMR websocket.
// Run: bunx playwright test -c app/src/transcribe/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5213,
  apiPort: 8813,
  dataDirName: "transcribe",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

export const area: Area = {
  name: "transcribe",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer: stack.webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 120_000,
  // The first visit compiles the workbench and the grader worker on a cold Vite.
  expect: { timeout: 15_000 },
};

export default areaConfig(area);

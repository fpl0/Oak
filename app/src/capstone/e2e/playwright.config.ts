// The capstone and album suite on its own stack (docs/design/wave2.md §2): ports 5210 / 8810, a throwaway data dir
// seeded through the U02 checkpoint (so C0 and C1 are open), the fake tutor.
// Run: bunx playwright test -c app/src/capstone/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5210,
  apiPort: 8810,
  dataDirName: "capstone",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

// Seed the data dir between the wipe and the server start (the server's backfill then grants the unlocks).
const webServer = stack.webServer.map((w) =>
  w.name?.startsWith("oak-api")
    ? {
        ...w,
        command: w.command.replace(
          "&& bun server/src/main.ts",
          `&& bun app/src/capstone/e2e/seed.bun.ts "${stack.dataDir}" && bun server/src/main.ts`,
        ),
      }
    : w,
);

export const area: Area = {
  name: "capstone",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 120_000,
  // The first visit compiles the workbench and the grader worker on a cold Vite.
  expect: { timeout: 15_000 },
};

export default areaConfig(area);

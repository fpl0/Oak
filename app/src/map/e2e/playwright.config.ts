// The map area's stack (docs/design/wave2.md §2): Vite 5207, API 8807, a throwaway data dir seeded with a
// progress fixture before the server starts (app/src/routes/dev/-lib/seed.bun.ts), the fake tutor.
// Run: bunx playwright test -c app/src/map/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5207,
  apiPort: 8807,
  dataDirName: "map",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

// Seed between the wipe and the server start: the fixture writes through the server's own repositories.
const SEED = "bun app/src/routes/dev/-lib/seed.bun.ts";
const webServer = stack.webServer.map((w) =>
  w.name?.startsWith("oak-api")
    ? {
        ...w,
        command: w.command.replace(" && bun server/src/main.ts", ` && ${SEED} && bun server/src/main.ts`),
      }
    : w,
);

export const area: Area = {
  name: "map",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 90_000,
};

export default areaConfig(area);

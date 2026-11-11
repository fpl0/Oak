// The tutor-ui stack (docs/design/wave2.md §2): ports 5208/8808, a throwaway data dir, the scripted fake tutor.
// Run: bunx playwright test -c app/src/tutor/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5208,
  apiPort: 8808,
  dataDirName: "tutor-ui",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

export const area: Area = {
  name: "tutor",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer: stack.webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 90_000,
};

export default areaConfig(area);

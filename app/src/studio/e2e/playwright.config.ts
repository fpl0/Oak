// Studio and Toolbox against the real server (docs/design/wave2.md §2): own ports 5206/8806, a throwaway data
// dir, the scripted fake tutor. Run: bunx playwright test -c app/src/studio/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5206,
  apiPort: 8806,
  dataDirName: "studio",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

export const area: Area = {
  name: "studio",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer: stack.webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 120_000,
};

export default areaConfig(area);

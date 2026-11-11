// The worked example of a Wave 2 area config (docs/design/wave2.md §2): one stack on its own ports, a throwaway
// data dir, the fake tutor. Run: bunx playwright test -c app/src/ui/kit/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5200,
  apiPort: 8800,
  dataDirName: "kit",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

export const area: Area = {
  name: "kit",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer: stack.webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 90_000,
};

export default areaConfig(area);

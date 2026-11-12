// Wave 3 lenses and key panels in the Studio and the Toolbox against the real server, on the workbench owner's
// second stack (docs/design/wave3.md §2: 5236/8836) with its own throwaway data dir, so the unlocks these specs
// grant (degree labels, solfège, key panels) never reach the Wave 2 Studio suite's learner.
// Run: bunx playwright test -c app/src/toolbox/e2e/playwright.config.ts (or --project workbench-w3).
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5236,
  apiPort: 8836,
  dataDirName: "workbench-w3",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

export const area: Area = {
  name: "workbench-w3",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer: stack.webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 120_000,
};

export default areaConfig(area);

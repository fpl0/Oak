// Wave 5 in the Workbench, the Studio and the Toolbox against the real server: the section ribbon and the form map,
// minor keys, the bass-role and blue-note lenses, the swing badge, the chord chart, Oak's scope and the probes.
// The workbench owner's primary and second pairs (5206/8806, 5236/8836) already serve the Studio and the Wave 3–4
// toolbox suites, so this suite runs on its own pair (5246/8846) with its own throwaway data dir.
// Run: bunx playwright test -c app/src/workbench/e2e-w5/playwright.config.ts (or --project workbench-w5).
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5246,
  apiPort: 8846,
  dataDirName: "workbench-w5",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

export const area: Area = {
  name: "workbench-w5",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer: stack.webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 180_000,
};

export default areaConfig(area);

// The visual and adversarial review suite of Studio, Toolbox, the Oak, the tutor panel, the capstone and the album
// (Wave 2 review): its own stack on 5222/8822, a throwaway data dir, the scripted fake tutor. Specs seed the
// learner with `POST /api/dev/seed` at the point they need.
// Run: bunx playwright test -c app/src/ui/review/e2e/playwright.config.ts
// Against an already-running stack on the same ports: OAK_REVIEW_ATTACHED=1 (no servers started or stopped).
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5222,
  apiPort: 8822,
  dataDirName: "ui-review",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

export const area: Area = {
  name: "ui-review",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer: process.env.OAK_REVIEW_ATTACHED === "1" ? [] : stack.webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 180_000,
};

export default areaConfig(area);

// The kit area (shared UI: kit, shell, keys; docs/design/wave4.md §2): one stack on its own ports (5214 / 8814 from
// Wave 4, when the old "polish" area split into capstone, tutor and kit), a throwaway data dir, the fake tutor.
// Run: bunx playwright test -c app/src/ui/kit/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5214,
  apiPort: 8814,
  dataDirName: "kit",
  // The Wave 4/5 kit galleries are imported in the page by source path (/src/ui/kit/gallery/*.tsx).
  bundle: false,
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

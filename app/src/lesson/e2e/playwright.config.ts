// The lesson and checkpoint players on their own stack (docs/design/wave2.md §2): vite 5201, api 8801, a
// throwaway data dir, the scripted fake tutor. Run: bunx playwright test -c app/src/lesson/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5201,
  apiPort: 8801,
  dataDirName: "lesson",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

export const area: Area = {
  name: "lesson",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer: stack.webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 180_000,
  expect: { timeout: 20_000 },
};

export default areaConfig(area);

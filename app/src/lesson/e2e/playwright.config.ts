// The lesson and checkpoint players on their own stack (docs/design/wave2.md §2): vite 5201, api 8801, a
// throwaway data dir, the scripted fake tutor. Run: bunx playwright test -c app/src/lesson/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../e2e/support/stack.ts";

// `OAK_LESSON_ALT=1` runs a second stack beside the first on the lesson's second port pair (5202/8802, its own
// data dir), so two walk files can run at once by hand; the runner never sets it.
const alt = process.env.OAK_LESSON_ALT === "1";

export const stack = oakStack({
  vitePort: alt ? 5202 : 5201,
  apiPort: alt ? 8802 : 8801,
  dataDirName: alt ? "lesson-alt" : "lesson",
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

// The answers area's stack (docs/design/wave2.md §2): Vite 5202, Oak server 8802, a throwaway data dir.
// Run: bunx playwright test -c app/src/answers/e2e/playwright.config.ts
// The gallery is the app's Vite serving app/src/answers/dev/gallery.html. The fake-microphone WAVs are written
// before the run (fixtures.ts); the sing specs feed them to Chromium's fake capture device.
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../e2e/support/stack.ts";
import { writeMicFixtures } from "./fixtures.ts";

export const stack = oakStack({ vitePort: 5202, apiPort: 8802, dataDirName: "answers" });
writeMicFixtures();

export const area: Area = {
  name: "answers",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer: stack.webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 90_000,
};

export default areaConfig(area);

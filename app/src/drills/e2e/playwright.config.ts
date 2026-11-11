// The drills area stack (docs/design/wave2.md §2): its own ports, a throwaway data dir, the fake tutor, and
// Chromium's fake microphone (a steady test tone) so sing trials run end to end.
// Run: bunx playwright test -c app/src/drills/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5203,
  apiPort: 8803,
  dataDirName: "drills",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

export const area: Area = {
  name: "drills",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer: stack.webServer,
  use: stackUse(stack, {
    launchOptions: {
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
    permissions: ["microphone"],
  }),
  outputDir: stack.outputDir,
  timeout: 240_000,
};

export default areaConfig(area);

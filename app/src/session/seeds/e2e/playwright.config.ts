// The session area's Wave 3 stack: Today, the session, the Coda, Progress and the Oak, each spec starting from a
// dev seed (`POST /api/dev/seed`, wave3.md §5.5) and the dev clock (`PUT /api/dev/clock`) instead of replaying
// days. The session's second port pair (wave3.md §2: 5235 / 8835), the fake tutor and Chromium's fake mic.
// Run: bunx playwright test -c app/src/session/seeds/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5235,
  apiPort: 8835,
  dataDirName: "session-seeds",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

export const area: Area = {
  name: "session-seeds",
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
  timeout: 180_000,
};

export default areaConfig(area);

// The adversarial review of the Transcription Studio, the capstone flow and the album, as the learner (Wave 4
// review): regression specs for what the review found, on their own stack (ports 5223 / 8823, a throwaway data dir,
// the scripted fake tutor, Chrome's fake microphone). Every spec starts from a dev seed (wave4.md §6) and blocks
// Vite's HMR websocket.
// Run: bunx playwright test -c app/src/album/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5223,
  apiPort: 8823,
  dataDirName: "review-studio",
  // transcribe.pw.ts imports /src/transcribe/stimulus-code.ts in the page.
  bundle: false,
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

export const area: Area = {
  name: "review-studio",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer: stack.webServer,
  use: stackUse(stack, {
    launchOptions: {
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    },
  }),
  outputDir: stack.outputDir,
  timeout: 180_000,
  // The first visit compiles the workbench and the grader worker on a cold Vite.
  expect: { timeout: 15_000 },
};

export default areaConfig(area);

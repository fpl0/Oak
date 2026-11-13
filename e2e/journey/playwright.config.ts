// The Wave 2 gate journey (docs/design/wave2.md §9): a fresh learner through onboarding and real daily sessions on
// the REAL stack — the Oak server with real content (OAK_DEV=1 for the dev clock and the seeder, the scripted fake
// tutor), the app on Vite, Chrome's fake microphone fed from the onboarding WAV fixtures — and the first session
// again on the production build (`bun run build`, `--serve-dist`, no OAK_DEV) with an offline reload.
// Run alone: bunx playwright test -c e2e/journey/playwright.config.ts (or `--project journey` from the root).
import { fileURLToPath } from "node:url";
import {
  type Area,
  areaConfig,
  E2E_SUFFIX,
  oakStack,
  REPO_ROOT,
  shifted,
  stackUse,
  withFixtures,
} from "../support/stack.ts";

/**
 * `OAK_JOURNEY_ALT=1` moves the journey to a second set of ports and data dirs (Vite 5242, API 8842, production
 * 8794), so the journeys can be run alone while a full `bun run e2e` holds the gate ports. Never set in `bun run e2e`.
 * `OAK_E2E_SHIFT` (e2e/support/stack.ts) moves every port of either set, the production server's included.
 */
const ALT = process.env.OAK_JOURNEY_ALT === "1";

export const stack = oakStack({
  vitePort: ALT ? 5242 : 5212,
  apiPort: ALT ? 8842 : 8812,
  dataDirName: ALT ? "journey-alt" : "journey",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

/** The production build on its own port and data dir (no OAK_DEV: the real security rules, no fake tutor). */
export const PROD_PORT = shifted(ALT ? 8794 : 8792);
export const PROD_URL = `http://127.0.0.1:${PROD_PORT}`;
const prodData = `${REPO_ROOT}test-results/stacks/${ALT ? "journey-alt-prod" : "journey-prod"}${E2E_SUFFIX}`;

const webServer = [
  ...stack.webServer.map((w) =>
    w.name?.startsWith("oak-api")
      ? // The fake-microphone WAVs (onboarding's fixtures) are written before the server starts.
        { ...w, command: withFixtures("bun app/src/onboarding/e2e/make-fixtures.bun.ts", w.command) }
      : w,
  ),
  {
    name: `journey-prod:${PROD_PORT}`,
    command: `bun run build && rm -rf "${prodData}" && OAK_PORT=${PROD_PORT} OAK_DATA_DIR="${prodData}" bun server/src/main.ts --serve-dist`,
    cwd: REPO_ROOT,
    url: `${PROD_URL}/`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe" as const,
    stderr: "pipe" as const,
    gracefulShutdown: { signal: "SIGTERM" as const, timeout: 5_000 },
  },
];

export const area: Area = {
  name: "journey",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer,
  use: stackUse(stack, { actionTimeout: 60_000 }),
  outputDir: stack.outputDir,
  // Every journey test starts from a dev seed and runs in a few minutes (the Wave 2 gate journey is split in five);
  // a test that needs more than this ceiling is a test to split, not a timeout to raise.
  timeout: 360_000,
  expect: { timeout: 20_000 },
};

export default areaConfig(area);

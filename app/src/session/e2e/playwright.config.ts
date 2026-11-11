// The session area's stack (docs/design/wave2.md §2): ports 5205/8805, a throwaway data dir, the fake tutor, and
// the server started through ./server.ts so specs can move its clock. Run:
//   bunx playwright test -c app/src/session/e2e/playwright.config.ts
import { fileURLToPath } from "node:url";
import { type Area, areaConfig, oakStack, stackUse } from "../../../../e2e/support/stack.ts";

export const stack = oakStack({
  vitePort: 5205,
  apiPort: 8805,
  dataDirName: "session",
  extraEnv: { OAK_TUTOR_FAKE: "1" },
});

const webServer = stack.webServer.map((w) =>
  w.name?.startsWith("oak-api")
    ? { ...w, command: `rm -rf "${stack.dataDir}" && bun app/src/session/e2e/server.ts` }
    : w,
);

export const area: Area = {
  name: "session",
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  webServer,
  use: stackUse(stack),
  outputDir: stack.outputDir,
  timeout: 120_000,
};

export default areaConfig(area);

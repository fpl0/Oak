// Every browser suite of the repo in one run: `bun run e2e` (alias `bun run test:browser`). One project per suite;
// `bunx playwright test --project <name>` runs one (several `--project` flags run several), and only the web
// servers of the selected projects start. Each project keeps its own stack (ports, data dir), so they never share
// state; each area's own `playwright.config.ts` still runs that suite alone.
//
//   platform        e2e/*.pw.ts against the REAL stack: the Oak server (OAK_DEV=1, fresh data dir) on 8787, the app's
//                   Vite on 5173, and the production build served by `bun server/src/main.ts --serve-dist` on 8790.
//   app             app/e2e (the app shell with an in-page stub API; the platform's Vite on 5173).
//   journey         e2e/journey: the Wave 2 gate journey on the real stack with real content, the scripted fake tutor
//                   and Chrome's fake microphone (Vite 5212, API 8812), and the first session on the production
//                   build (8792, its own data dir).
//   kit, lesson, answers, drills, session, studio, map, tutor, onboarding, capstone
//                   app/src/<area>/e2e on the area's own stack (docs/design/wave2.md §2).
//   workbench       app/src/workbench/e2e on its own Vite page (5193).
//   review          e2e/review: the Wave 2 journey review's regression specs (Vite 5221, API 8821, fake tutor, fake mic).
//   ui-review       app/src/ui/review/e2e: the Wave 2 surfaces review (visual, a11y, contrast, hostile tutor; 5222/8822).
//   strudel-*       packages/strudel/e2e on its own Vite page (5192), autoplay and gesture policies.
//   audio           packages/audio/e2e on its own Vite page (5191).
//
// Servers run on Node or Bun as the spikes require (Vite on Node, never `bunx --bun vite`) and stop when the run ends.
import { fileURLToPath } from "node:url";
import { defineConfig, type PlaywrightTestConfig, type Project } from "@playwright/test";
import { area as answers } from "./app/src/answers/e2e/playwright.config.ts";
import { area as capstone } from "./app/src/capstone/e2e/playwright.config.ts";
import { area as drills } from "./app/src/drills/e2e/playwright.config.ts";
import { area as lesson } from "./app/src/lesson/e2e/playwright.config.ts";
import { area as map } from "./app/src/map/e2e/playwright.config.ts";
import { area as onboarding } from "./app/src/onboarding/e2e/playwright.config.ts";
import { area as session } from "./app/src/session/e2e/playwright.config.ts";
import { area as studio } from "./app/src/studio/e2e/playwright.config.ts";
import { area as tutor } from "./app/src/tutor/e2e/playwright.config.ts";
import { area as kit } from "./app/src/ui/kit/e2e/playwright.config.ts";
import { area as uiReview } from "./app/src/ui/review/e2e/playwright.config.ts";
import { area as workbench } from "./app/src/workbench/e2e/playwright.config.ts";
import { area as journey } from "./e2e/journey/playwright.config.ts";
import { area as review } from "./e2e/review/playwright.config.ts";
import { type Area, selectedProjects } from "./e2e/support/stack.ts";

type WebServer = Extract<NonNullable<PlaywrightTestConfig["webServer"]>, readonly unknown[]>[number];

const root = fileURLToPath(new URL(".", import.meta.url));
const vite = `node ${root}node_modules/vite/bin/vite.js`;
const autoplay = { launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } };
const DATA = `${root}test-results/e2e-data`;
const pipe = { reuseExistingServer: false, stdout: "pipe", stderr: "pipe" } as const;

// --- the platform stack (platform + app) -----------------------------------------------------------------------
const platformDev: WebServer = {
  ...pipe,
  name: "platform-api:8787",
  // The real Oak server, dev mode (the Vite proxy's Host and Origin are allowed), a throwaway data dir.
  command: `rm -rf "${DATA}/dev" && OAK_DEV=1 OAK_DATA_DIR="${DATA}/dev" bun server/src/main.ts`,
  cwd: root,
  url: "http://127.0.0.1:8787/api/health",
  timeout: 60_000,
};
const platformVite: WebServer = {
  ...pipe,
  name: "platform-vite:5173",
  command: `bun scripts/content/build.ts && ${vite} --config app/vite.config.ts`,
  cwd: root,
  url: "http://127.0.0.1:5173/",
  timeout: 120_000,
};
/** `bun run build` + `bun run start` on 8790. The journey's production server reuses this build when both run. */
const platformProd: WebServer = {
  ...pipe,
  name: "platform-prod:8790",
  command: `bun run build && rm -rf "${DATA}/prod" && OAK_PORT=8790 OAK_DATA_DIR="${DATA}/prod" bun server/src/main.ts --serve-dist`,
  cwd: root,
  url: "http://127.0.0.1:8790/",
  timeout: 300_000,
};

const strudelVite: WebServer = {
  ...pipe,
  name: "strudel-vite:5192",
  command: `${vite} --config vite.config.ts`,
  cwd: `${root}packages/strudel/e2e`,
  url: "http://127.0.0.1:5192/",
  timeout: 90_000,
};
const audioVite: WebServer = {
  ...pipe,
  name: "audio-vite:5191",
  command: `bun make-fixtures.bun.ts && ${vite} --config vite.config.ts`,
  cwd: `${root}packages/audio/e2e`,
  url: "http://127.0.0.1:5191/",
  timeout: 90_000,
};

interface Suite {
  project: Project;
  servers: WebServer[];
}

const fromArea = (a: Area): Suite => ({
  project: {
    name: a.name,
    testDir: a.testDir,
    testMatch: /.*\.pw\.ts$/,
    outputDir: a.outputDir,
    timeout: a.timeout,
    ...(a.expect ? { expect: a.expect } : {}),
    use: a.use,
  },
  servers: a.webServer,
});

const SUITES: Suite[] = [
  {
    project: {
      name: "platform",
      testDir: `${root}e2e`,
      testMatch: /\/e2e\/[^/]+\.pw\.ts$/,
      testIgnore: /(journey|review)\//,
      use: { baseURL: "http://127.0.0.1:5173", viewport: { width: 1440, height: 900 }, ...autoplay },
    },
    servers: [platformDev, platformVite, platformProd],
  },
  {
    project: {
      name: "app",
      testDir: `${root}app/e2e`,
      testMatch: /.*\.pw\.ts$/,
      timeout: 60_000,
      use: {
        baseURL: "http://127.0.0.1:5173",
        viewport: { width: 1440, height: 900 },
        // The production build registers sw.js, whose own fetches would bypass the in-page API stub.
        serviceWorkers: "block",
      },
    },
    servers: [platformDev, platformVite],
  },
  fromArea(journey),
  fromArea(kit),
  fromArea(lesson),
  fromArea(answers),
  fromArea(drills),
  fromArea(session),
  fromArea(studio),
  fromArea(map),
  fromArea(tutor),
  fromArea(onboarding),
  fromArea(capstone),
  fromArea(workbench),
  fromArea(review),
  fromArea(uiReview),
  {
    project: {
      name: "strudel-autoplay",
      testDir: `${root}packages/strudel/e2e`,
      testMatch: /.*\.pw\.ts$/,
      grepInvert: /@gesture/,
      use: { baseURL: "http://127.0.0.1:5192", viewport: { width: 1000, height: 900 }, ...autoplay },
    },
    servers: [strudelVite],
  },
  {
    project: {
      name: "strudel-gesture",
      testDir: `${root}packages/strudel/e2e`,
      testMatch: /.*\.pw\.ts$/,
      grep: /@gesture/,
      use: {
        baseURL: "http://127.0.0.1:5192",
        viewport: { width: 1000, height: 900 },
        launchOptions: { args: ["--autoplay-policy=document-user-activation-required"] },
        // Trace snapshots run script with a user activation, which would unlock audio before the real gesture.
        trace: "off",
      },
    },
    servers: [strudelVite],
  },
  {
    project: {
      name: "audio",
      testDir: `${root}packages/audio/e2e`,
      testMatch: /.*\.pw\.ts$/,
      timeout: 60_000,
      use: { baseURL: "http://127.0.0.1:5191" },
    },
    servers: [audioVite],
  },
];

const wanted = selectedProjects();
const chosen = SUITES.filter((s) => wanted === null || wanted.has(s.project.name as string));
// Each server once (platform and app share a stack; the strudel projects share a page), in suite order.
const servers = new Map<string, WebServer>();
for (const s of chosen) for (const w of s.servers) servers.set(w.name ?? w.command, w);
// The journey's production server builds the app itself unless the platform's production server (which runs
// first) already did.
if (servers.has(platformProd.name as string))
  for (const [k, w] of servers)
    if (k.startsWith("journey-prod"))
      servers.set(k, { ...w, command: w.command.replace("bun run build && ", "") });

export default defineConfig({
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: `${root}test-results/e2e`,
  timeout: 120_000,
  use: { headless: true, browserName: "chromium", trace: "retain-on-failure" },
  webServer: [...servers.values()],
  projects: SUITES.map((s) => s.project),
});

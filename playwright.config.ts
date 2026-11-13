// Every browser suite of the repo. `bun run e2e` runs the projects side by side (scripts/e2e-parallel.ts);
// `bun run e2e:serial` is this config alone, one test at a time. One project per suite;
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
//   <area>          every config that exports `area` is discovered (docs/design/wave3.md §6, wave4.md §2):
//                   app/src/<area>/e2e on the area's own stack (Wave 4: lesson 5201, answers 5202, drills 5203,
//                   session 5205, studio 5206, tutor 5208, voice/onboarding 5209, capstone 5210, transcribe 5213,
//                   kit 5214; API = Vite + 3600), app/src/workbench/e2e on its own Vite page (5193), e2e/review
//                   (5221/8821), app/src/ui/review/e2e (5222/8822), packages/<pkg>/e2e pages that export `area`
//                   (notation 5194), and any new area config, without editing this file.
//   strudel-*       packages/strudel/e2e on its own Vite page (5192), autoplay and gesture policies.
//   audio           packages/audio/e2e on its own Vite page (5191).
//
// Servers run on Node or Bun as the spikes require (Vite on Node, never `bunx --bun vite`) and stop when the run ends.
import { globSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig, type PlaywrightTestConfig, type Project } from "@playwright/test";
import {
  type Area,
  E2E_SUFFIX,
  PREBUILT,
  selectedProjects,
  shifted,
  withFixtures,
} from "./e2e/support/stack.ts";

type WebServer = Extract<NonNullable<PlaywrightTestConfig["webServer"]>, readonly unknown[]>[number];

const root = fileURLToPath(new URL(".", import.meta.url));
const vite = `node ${root}node_modules/vite/bin/vite.js`;
const autoplay = { launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } };
const DATA = `${root}test-results/e2e-data${E2E_SUFFIX}`;
// Every port below moves with OAK_E2E_SHIFT (e2e/support/stack.ts), like every area's stack.
const PLATFORM_API = shifted(8787);
const PLATFORM_VITE = shifted(5173);
const PLATFORM_PROD = shifted(8790);
const STRUDEL = shifted(5192);
const AUDIO = shifted(5191);
const pipe = { reuseExistingServer: false, stdout: "pipe", stderr: "pipe" } as const;

// --- the platform stack (platform + app) -----------------------------------------------------------------------
const platformDev: WebServer = {
  ...pipe,
  name: `platform-api:${PLATFORM_API}`,
  // The real Oak server, dev mode (the Vite proxy's Host and Origin are allowed), a throwaway data dir.
  command: `rm -rf "${DATA}/dev" && OAK_DEV=1 OAK_PORT=${PLATFORM_API} OAK_VITE_PORT=${PLATFORM_VITE} OAK_DATA_DIR="${DATA}/dev" bun server/src/main.ts`,
  cwd: root,
  url: `http://127.0.0.1:${PLATFORM_API}/api/health`,
  timeout: 60_000,
};
const platformVite: WebServer = {
  ...pipe,
  name: `platform-vite:${PLATFORM_VITE}`,
  command: `bun scripts/content/build.ts && ${vite} --config e2e/support/vite.e2e.config.ts`,
  cwd: root,
  env: { OAK_VITE_PORT: String(PLATFORM_VITE), OAK_API_PORT: String(PLATFORM_API) },
  url: `http://127.0.0.1:${PLATFORM_VITE}/`,
  timeout: 120_000,
};
/** `bun run build` + `bun run start` on 8790. The journey's production server reuses this build when both run. */
const platformProd: WebServer = {
  ...pipe,
  name: `platform-prod:${PLATFORM_PROD}`,
  command: `bun run build && rm -rf "${DATA}/prod" && OAK_PORT=${PLATFORM_PROD} OAK_DATA_DIR="${DATA}/prod" bun server/src/main.ts --serve-dist`,
  cwd: root,
  url: `http://127.0.0.1:${PLATFORM_PROD}/`,
  timeout: 300_000,
};

const strudelVite: WebServer = {
  ...pipe,
  name: `strudel-vite:${STRUDEL}`,
  command: `${vite} --config vite.config.ts --port ${STRUDEL} --strictPort`,
  cwd: `${root}packages/strudel/e2e`,
  url: `http://127.0.0.1:${STRUDEL}/`,
  timeout: 90_000,
};
const audioVite: WebServer = {
  ...pipe,
  name: `audio-vite:${AUDIO}`,
  command: withFixtures(
    "bun make-fixtures.bun.ts",
    `${vite} --config vite.config.ts --port ${AUDIO} --strictPort`,
  ),
  cwd: `${root}packages/audio/e2e`,
  url: `http://127.0.0.1:${AUDIO}/`,
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

/**
 * Area suites are found by convention, not listed by hand (docs/design/wave3.md §6): every
 * `app/src/<any depth>/e2e/playwright.config.ts`, `e2e/<suite>/playwright.config.ts` and `packages/<pkg>/e2e/playwright.config.ts`
 * that exports `area: Area` (`e2e/support/stack.ts`) becomes a project named `area.name`. A config without an
 * `area` export (the strudel and audio pages) is configured explicitly below. Two areas may not claim the same
 * web-server name (`oak-api:<port>`, `oak-vite:<port>`) with different commands: that is a port clash.
 */
async function discoverAreas(): Promise<Area[]> {
  const files = globSync(
    [
      "app/src/**/e2e/playwright.config.ts",
      "e2e/*/playwright.config.ts",
      "packages/*/e2e/playwright.config.ts",
    ],
    { cwd: root, exclude: (f) => f.includes("node_modules") },
  ).sort();
  const out: Area[] = [];
  const names = new Map<string, string>();
  for (const file of files) {
    const mod = (await import(pathToFileURL(`${root}${file}`).href)) as { area?: Area };
    if (!mod.area) continue;
    const prev = names.get(mod.area.name);
    if (prev)
      throw new Error(`playwright.config.ts: project name "${mod.area.name}" is used by ${prev} and ${file}`);
    names.set(mod.area.name, file);
    out.push(mod.area);
  }
  // The gate journey first (its production server builds the app), then by name.
  return out.sort(
    (a, b) => Number(b.name === "journey") - Number(a.name === "journey") || a.name.localeCompare(b.name),
  );
}
const AREAS = await discoverAreas();
{
  const seen = new Map<string, { area: string; command: string }>();
  for (const a of AREAS)
    for (const w of a.webServer) {
      const key = w.name ?? w.command;
      const prev = seen.get(key);
      if (prev && prev.command !== w.command)
        throw new Error(
          `playwright.config.ts: areas "${prev.area}" and "${a.name}" both start "${key}" with different commands (a port clash; docs/design/wave3.md §6 lists the ports)`,
        );
      seen.set(key, { area: a.name, command: w.command });
    }
}

const SUITES: Suite[] = [
  {
    project: {
      name: "platform",
      testDir: `${root}e2e`,
      testMatch: /\/e2e\/[^/]+\.pw\.ts$/,
      testIgnore: /(journey|review)\//,
      use: {
        baseURL: `http://127.0.0.1:${PLATFORM_VITE}`,
        viewport: { width: 1440, height: 900 },
        ...autoplay,
      },
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
        baseURL: `http://127.0.0.1:${PLATFORM_VITE}`,
        viewport: { width: 1440, height: 900 },
        // The production build registers sw.js, whose own fetches would bypass the in-page API stub.
        serviceWorkers: "block",
      },
    },
    servers: [platformDev, platformVite],
  },
  ...AREAS.map(fromArea),
  {
    project: {
      name: "strudel-autoplay",
      testDir: `${root}packages/strudel/e2e`,
      testMatch: /.*\.pw\.ts$/,
      grepInvert: /@gesture/,
      use: { baseURL: `http://127.0.0.1:${STRUDEL}`, viewport: { width: 1000, height: 900 }, ...autoplay },
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
        baseURL: `http://127.0.0.1:${STRUDEL}`,
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
      use: { baseURL: `http://127.0.0.1:${AUDIO}` },
    },
    servers: [audioVite],
  },
];

/** Each project's web servers by name: scripts/e2e-parallel.ts runs projects that share one in one process. */
export const projectServers: Record<string, string[]> = Object.fromEntries(
  SUITES.map((s) => [s.project.name as string, s.servers.map((w) => w.name ?? w.command)]),
);

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
// `bun run e2e` (scripts/e2e-parallel.ts) runs several of these processes side by side. It builds the content and
// the production app once, before any of them starts, and says so here: no process may rebuild while others read.
if (PREBUILT)
  for (const [k, w] of servers)
    servers.set(k, {
      ...w,
      command: w.command.replace("bun run build && ", "").replace("bun scripts/content/build.ts && ", ""),
    });

export default defineConfig({
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: `${root}test-results/e2e${E2E_SUFFIX}`,
  timeout: 120_000,
  use: { headless: true, browserName: "chromium", trace: "retain-on-failure" },
  webServer: [...servers.values()],
  projects: SUITES.map((s) => s.project),
});

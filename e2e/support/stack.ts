// One Oak stack per Playwright config (docs/design/wave2.md §2): the real Oak server (OAK_DEV=1, a throwaway
// data dir) on `apiPort` and the app's Vite dev server on `vitePort`, proxying /api and /sounds to that server.
// Every Wave 2 area has its own pair of ports, so several stacks run side by side.
//
//   // app/src/<area>/e2e/playwright.config.ts
//   import { defineConfig } from "@playwright/test";
//   import { oakStack, stackUse } from "../../../../e2e/support/stack.ts";
//   const stack = oakStack({ vitePort: 5203, apiPort: 8803, dataDirName: "drills" });
//   export default defineConfig({ testDir: ".", testMatch: /.*\.pw\.ts$/, workers: 1,
//     outputDir: stack.outputDir, webServer: stack.webServer, use: stackUse(stack) });
//
// Playwright starts both servers before the first test and stops them when the run ends (never reused: a
// server already on the port fails the run instead of silently testing someone else's stack).
import { fileURLToPath } from "node:url";
import type { PlaywrightTestConfig } from "@playwright/test";

type WebServer = Extract<NonNullable<PlaywrightTestConfig["webServer"]>, readonly unknown[]>[number];
type Use = NonNullable<PlaywrightTestConfig["use"]>;

export interface StackOptions {
  /** The Vite dev server's port (`OAK_VITE_PORT`). */
  vitePort: number;
  /** The Oak server's port (`OAK_PORT` for the server, `OAK_API_PORT` for Vite's proxy). */
  apiPort: number;
  /** A folder name under `test-results/stacks/`: the server's `OAK_DATA_DIR`, wiped at every start. */
  dataDirName: string;
  /**
   * Extra environment for the Oak server, e.g. `{ OAK_TUTOR_FAKE: "1" }` for the scripted tutor
   * (docs/design/wave2.md §5). `OAK_DEV`, `OAK_PORT`, `OAK_VITE_PORT` and `OAK_DATA_DIR` are set here.
   */
  extraEnv?: Record<string, string>;
  /**
   * Run `bun scripts/content/build.ts` before Vite starts. Default false: the content build writes the shared
   * `content/.generated/`, so parallel stacks should not all rebuild it; run `bun run content:build` once.
   */
  buildContent?: boolean;
}

export interface OakStack {
  /** `http://127.0.0.1:<vitePort>`: the app. */
  baseURL: string;
  /** `http://127.0.0.1:<apiPort>`: the Oak server itself (health checks, direct API calls in a spec). */
  apiURL: string;
  /** Absolute path of the server's data dir. */
  dataDir: string;
  /** Absolute path for Playwright's `outputDir`. */
  outputDir: string;
  webServer: WebServer[];
}

/** The repository root (this file is `<root>/e2e/support/stack.ts`). */
export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const RESERVED = ["OAK_DEV", "OAK_PORT", "OAK_VITE_PORT", "OAK_API_PORT", "OAK_DATA_DIR"];

function checkPort(name: string, port: number): void {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error(`oakStack: ${name} must be an integer port in 1024–65535, got ${port}`);
}

/** The two `webServer` entries and the URLs of one stack. Pure: nothing starts until Playwright runs. */
export function oakStack(o: StackOptions): OakStack {
  checkPort("vitePort", o.vitePort);
  checkPort("apiPort", o.apiPort);
  if (o.vitePort === o.apiPort) throw new Error("oakStack: vitePort and apiPort must differ");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(o.dataDirName))
    throw new Error(`oakStack: dataDirName must be a lower-case slug, got "${o.dataDirName}"`);
  for (const key of Object.keys(o.extraEnv ?? {}))
    if (RESERVED.includes(key)) throw new Error(`oakStack: ${key} is set by the stack itself`);

  const dataDir = `${REPO_ROOT}test-results/stacks/${o.dataDirName}`;
  const baseURL = `http://127.0.0.1:${o.vitePort}`;
  const apiURL = `http://127.0.0.1:${o.apiPort}`;
  const vite = `node ${REPO_ROOT}node_modules/vite/bin/vite.js --config app/vite.config.ts`;
  const common = { cwd: REPO_ROOT, reuseExistingServer: false, stdout: "pipe", stderr: "pipe" } as const;
  return {
    baseURL,
    apiURL,
    dataDir,
    outputDir: `${REPO_ROOT}test-results/stacks/${o.dataDirName}-results`,
    webServer: [
      {
        ...common,
        name: `oak-api:${o.apiPort}`,
        command: `rm -rf "${dataDir}" && bun server/src/main.ts`,
        url: `${apiURL}/api/health`,
        timeout: 60_000,
        env: {
          ...o.extraEnv,
          OAK_DEV: "1",
          OAK_PORT: String(o.apiPort),
          OAK_VITE_PORT: String(o.vitePort),
          OAK_DATA_DIR: dataDir,
        },
        // Ask the server to shut down cleanly (it closes SQLite and the grader hosts on SIGTERM).
        gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      },
      {
        ...common,
        name: `oak-vite:${o.vitePort}`,
        command: o.buildContent ? `bun scripts/content/build.ts && ${vite}` : vite,
        url: `${baseURL}/`,
        timeout: 180_000,
        env: { OAK_VITE_PORT: String(o.vitePort), OAK_API_PORT: String(o.apiPort) },
        gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      },
    ],
  };
}

/**
 * The `use` block every Wave 2 config shares: the stack's baseURL, Chromium, 1440×900, autoplay without a
 * gesture (sound tests), traces on failure. Spread your own options after it.
 */
export function stackUse(stack: OakStack, extra: Use = {}): Use {
  return {
    baseURL: stack.baseURL,
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
    ...extra,
  };
}

/** The two themes and two viewports every surface is screenshotted in (docs/design/wave2.md §8). */
export const SCREENSHOT_MATRIX = [
  { theme: "paper", width: 1440, height: 900 },
  { theme: "bark", width: 1440, height: 900 },
  { theme: "paper", width: 1280, height: 800 },
  { theme: "bark", width: 1280, height: 800 },
] as const;

/**
 * One area's browser suite as data: its own stack (web servers), test folder and options. The area's own
 * `playwright.config.ts` is `areaConfig(area)` (run one suite alone); the root `playwright.config.ts` turns every
 * area into a project (`bun run e2e`, or `bunx playwright test --project <name>`).
 */
export interface Area {
  /** The project name (`--project <name>`). */
  name: string;
  testDir: string;
  webServer: WebServer[];
  use: Use;
  outputDir: string;
  timeout: number;
  expect?: { timeout: number };
}

/** An area's standalone config (one suite, its own stack, one worker). */
export function areaConfig(a: Area): PlaywrightTestConfig {
  return {
    testDir: a.testDir,
    testMatch: /.*\.pw\.ts$/,
    workers: 1,
    timeout: a.timeout,
    ...(a.expect ? { expect: a.expect } : {}),
    reporter: [["list"]],
    outputDir: a.outputDir,
    webServer: a.webServer,
    use: a.use,
  };
}

/**
 * The project names a Playwright run asked for (`--project x`, `--project=x`, repeatable), or `null` for all.
 * The root config starts only the web servers of the selected projects.
 */
export function selectedProjects(argv: readonly string[] = process.argv): Set<string> | null {
  const out = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--project" && argv[i + 1]) out.add(argv[++i] as string);
    else if (a.startsWith("--project=")) out.add(a.slice("--project=".length));
  }
  return out.size > 0 ? out : null;
}

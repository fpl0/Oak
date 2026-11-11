// Every browser suite of the repo in one run: `bun run e2e` (alias `bun run test:browser`).
//
//   platform   e2e/platform.pw.ts against the REAL stack: the Oak server (OAK_DEV=1, a fresh data dir under
//              test-results/) on 8787, the app's Vite dev server on 5173, and the production build served by
//              `bun server/src/main.ts --serve-dist` on 8790 (its own data dir).
//   app        app/e2e (the app shell with an in-page stub API; same Vite server).
//   workbench  app/src/workbench/e2e on its own Vite page (5193).
//   strudel    packages/strudel/e2e on its own Vite page (5192), autoplay and gesture policies.
//   audio      packages/audio/e2e on its own Vite page (5191).
//
// Each package keeps its own playwright.config.ts for running one suite alone. Servers run on Node or Bun as
// the spikes require (Vite on Node, never `bunx --bun vite`) and are stopped when the run ends.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const root = fileURLToPath(new URL(".", import.meta.url));
const vite = `node ${root}node_modules/vite/bin/vite.js`;
const autoplay = { launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } };
const DATA = `${root}test-results/e2e-data`;

export default defineConfig({
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: `${root}test-results/e2e`,
  timeout: 120_000,
  use: { headless: true, browserName: "chromium", trace: "retain-on-failure" },
  webServer: [
    {
      // The real Oak server, dev mode (the Vite proxy's Host and Origin are allowed), a throwaway data dir.
      command: `rm -rf "${DATA}/dev" && OAK_DEV=1 OAK_DATA_DIR="${DATA}/dev" bun server/src/main.ts`,
      cwd: root,
      url: "http://127.0.0.1:8787/api/health",
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `bun scripts/content/build.ts && ${vite} --config app/vite.config.ts`,
      cwd: root,
      url: "http://127.0.0.1:5173/",
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // `bun run build` + `bun run start`, on a second port so it can run next to the dev server.
      command: `bun run build && rm -rf "${DATA}/prod" && OAK_PORT=8790 OAK_DATA_DIR="${DATA}/prod" bun server/src/main.ts --serve-dist`,
      cwd: root,
      url: "http://127.0.0.1:8790/",
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `${vite} --config app/src/workbench/e2e/vite.config.ts`,
      cwd: root,
      url: "http://127.0.0.1:5193/",
      reuseExistingServer: false,
      timeout: 90_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `${vite} --config vite.config.ts`,
      cwd: `${root}packages/strudel/e2e`,
      url: "http://127.0.0.1:5192/",
      reuseExistingServer: false,
      timeout: 90_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `bun make-fixtures.bun.ts && ${vite} --config vite.config.ts`,
      cwd: `${root}packages/audio/e2e`,
      url: "http://127.0.0.1:5191/",
      reuseExistingServer: false,
      timeout: 90_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
  projects: [
    {
      name: "platform",
      testDir: `${root}e2e`,
      testMatch: /.*\.pw\.ts$/,
      use: { baseURL: "http://127.0.0.1:5173", viewport: { width: 1440, height: 900 }, ...autoplay },
    },
    {
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
    {
      name: "workbench",
      testDir: `${root}app/src/workbench/e2e`,
      testMatch: /.*\.pw\.ts$/,
      timeout: 90_000,
      use: { baseURL: "http://127.0.0.1:5193", viewport: { width: 1280, height: 1000 }, ...autoplay },
    },
    {
      name: "strudel-autoplay",
      testDir: `${root}packages/strudel/e2e`,
      testMatch: /.*\.pw\.ts$/,
      grepInvert: /@gesture/,
      use: { baseURL: "http://127.0.0.1:5192", viewport: { width: 1000, height: 900 }, ...autoplay },
    },
    {
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
    {
      name: "audio",
      testDir: `${root}packages/audio/e2e`,
      testMatch: /.*\.pw\.ts$/,
      timeout: 60_000,
      use: { baseURL: "http://127.0.0.1:5191" },
    },
  ],
});

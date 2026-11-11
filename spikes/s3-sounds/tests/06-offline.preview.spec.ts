// Production build + `vite preview`, hand-written Service Worker, then the SERVER IS KILLED and the browser
// context is set offline. The page must reload from the SW cache and play sounds it never played online.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { saveResult } from "./helpers.ts";

const ROOT = join(import.meta.dirname, "..");
const VITE = join(ROOT, "../../node_modules/vite/bin/vite.js");
const URL = "http://127.0.0.1:5183/";
let server: ChildProcess | undefined;

const reachable = async () => {
  try {
    return (await fetch(URL, { signal: AbortSignal.timeout(500) })).ok;
  } catch {
    return false;
  }
};
const until = async (fn: () => Promise<boolean>, ms: number, what: string) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timeout waiting for ${what}`);
};
const killServer = async () => {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((r) => server?.once("exit", r));
  server.kill("SIGTERM");
  await exited;
  server = undefined;
};

test.beforeAll(async () => {
  execFileSync("node", [VITE, "build", "--logLevel", "error"], { cwd: ROOT, stdio: "pipe" });
  server = spawn("node", [VITE, "preview", "--port", "5183", "--strictPort"], { cwd: ROOT, stdio: "ignore" });
  await until(reachable, 20_000, "vite preview");
});
test.afterAll(killServer);

test("Service Worker: CacheFirst /sounds/*, offline reload + replay with the server dead", async ({ page, context }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const responses: { path: string; sw: boolean; status: number }[] = [];
  page.on("response", (r) => {
    const u = new globalThis.URL(r.url());
    if (u.protocol.startsWith("http")) responses.push({ path: u.pathname, sw: r.fromServiceWorker(), status: r.status() });
  });
  const external: string[] = [];
  page.on("request", (r) => {
    const u = new globalThis.URL(r.url());
    if (u.protocol.startsWith("http") && u.hostname !== "127.0.0.1") external.push(r.url());
  });
  const playAndMeasure = async (code: string) => {
    await page.evaluate((c) => window.oak.play(c), code);
    const m = await page.evaluate(() => window.oak.measure(1500));
    await page.evaluate(() => window.oak.stop());
    await page.waitForTimeout(200);
    return Number(m.rms.toFixed(4));
  };

  // ---- online, first load
  await page.goto("/");
  await page.waitForFunction(() => !!window.oak);
  const boot1 = await page.evaluate(() => window.oak.boot({ serviceWorker: true }));
  const onlinePianoRms = await playAndMeasure('note("c3 e3 g3 c4").s("piano")');
  const afterRuntime = await page.evaluate(() => window.oak.swStats());
  // "download for offline": precache the whole pack through the SW
  const packUrls = await page.evaluate(() => window.oak.packUrls().length);
  const precache = await page.evaluate(() => window.oak.precachePack());
  const afterPrecache = await page.evaluate(() => window.oak.swStats());
  // reload once online so the app shell (index.html + hashed assets) passes through the SW into the cache
  await page.reload();
  await page.waitForFunction(() => !!window.oak);
  const onlineResponses = responses.length;

  // ---- kill the server AND go offline
  await killServer();
  await until(async () => !(await reachable()), 10_000, "server to die");
  await context.setOffline(true);
  const serverReachableFromNode = await reachable();

  responses.length = 0;
  await page.reload();
  await page.waitForFunction(() => !!window.oak);
  const boot2 = await page.evaluate(() => window.oak.boot({ serviceWorker: true }));
  const before = await page.evaluate(() => window.oak.swStats());
  const offline = {
    piano: await playAndMeasure('note("c3 e3 g3 c4").s("piano")'),
    tr909: await playAndMeasure('s("bd*2, ~ sd, hh*4, ~ ~ ~ oh, cp rim, cr rd, lt mt ht").bank("RolandTR909")'),
    rhodes: await playAndMeasure('note("c3 e3 g3 b3").s("rhodes")'),
    upright: await playAndMeasure('note("c2 g2 a2 e2").s("upright")'),
    crunch: await playAndMeasure('note("e2 g2 a2 e3").s("crunch")'),
    linnDrum: await playAndMeasure('s("sh cb tb sd").bank("LinnDrum")'),
    // file names with spaces: "Hat Closed-01.wav", "Hat Open.wav", "Tom H-01.wav"
    linnDrumSpaces: await playAndMeasure('s("hh*4, ~ oh, ht lt").bank("LinnDrum")'),
  };
  const after = await page.evaluate(() => window.oak.swStats());
  const evalErrors = await page.evaluate(() => window.oak.errors());
  const offlineSounds = responses.filter((r) => r.path.startsWith("/sounds/"));

  const result = {
    boot1,
    onlinePianoRms,
    afterRuntimeCachingOnly: { soundsCached: afterRuntime.soundsCached, fromNetwork: afterRuntime.soundsFromNetwork },
    packUrls,
    precache: { added: precache.added, megabytes: Number((precache.bytes / 1024 / 1024).toFixed(2)), errors: precache.errors, soundsCached: precache.soundsCached },
    afterPrecache: { soundsCached: afterPrecache.soundsCached, cache: afterPrecache.cache },
    onlineResponses,
    serverReachableFromNode,
    boot2,
    offline,
    offlineResponses: {
      total: responses.length,
      allFromServiceWorker: responses.every((r) => r.sw),
      statuses: [...new Set(responses.map((r) => r.status))],
      shell: responses.filter((r) => !r.path.startsWith("/sounds/")).map((r) => r.path),
      sounds: offlineSounds.length,
      sample: offlineSounds.slice(5, 9).map((r) => r.path),
    },
    swDelta: {
      soundsFromCache: after.soundsFromCache - before.soundsFromCache,
      soundsFromNetwork: after.soundsFromNetwork - before.soundsFromNetwork,
      failed: after.failed - before.failed,
    },
    evalErrors,
    pageErrors,
    external,
  };
  saveResult("06-offline", result);

  expect(boot1.controlled).toBe(true);
  expect(precache.errors).toEqual([]);
  expect(afterPrecache.soundsCached).toBe(packUrls);
  expect(serverReachableFromNode).toBe(false);
  expect(boot2.controlled).toBe(true);
  for (const [name, rms] of Object.entries(offline)) expect(rms, name).toBeGreaterThan(0.01);
  expect(result.offlineResponses.allFromServiceWorker).toBe(true);
  expect(result.offlineResponses.statuses).toEqual([200]);
  expect(result.swDelta.soundsFromNetwork).toBe(0);
  expect(result.swDelta.soundsFromCache).toBeGreaterThan(15);
  expect(evalErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(external).toEqual([]);
});

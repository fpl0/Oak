import { expect, test } from "@playwright/test";
import { guardNetwork, openLab, saveResult, sounds } from "./helpers.ts";

const CODE = `stack(
  note("c3 e3 g3 c4").s("piano"),
  note("c2 g2").s("upright"),
  note("<[e4 g4] [d4 f4]>").s("rhodes"),
  s("bd*2, ~ sd, hh*4").bank("RolandTR909")
)`;
const SKIP = /skip hap: still loading|took too long/;

interface Scenario {
  name: string;
  delaySoundsMs: number;
  mode: "none" | "pattern" | "list";
}

async function run(page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext, sc: Scenario) {
  const net = await guardNetwork(context, { delaySoundsMs: sc.delaySoundsMs });
  await openLab(page);
  let listReport: unknown;
  if (sc.mode === "list") {
    // the (sounds, pitches) form: every sound x every pitch
    listReport = await page.evaluate(() =>
      window.oak.preload(["piano", "upright", "rhodes", "RolandTR909_bd", "RolandTR909_sd", "RolandTR909_hh"], ["c2", "g2", "c3", "e3", "g3", "c4", "d4", "e4", "f4", "g4"]),
    );
  }
  const requestsBeforeStart = sounds(net).length;
  const { startedAt, report } = await page.evaluate(
    ([code, preloadCycles]) => window.oak.play(code as string, preloadCycles ? { preload: preloadCycles as number } : {}),
    [CODE, sc.mode === "pattern" ? 2 : 0] as const,
  );
  const requestsAtStart = sounds(net).length;
  const firstCycle = await page.evaluate(() => window.oak.measure(1000));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.oak.stop());
  const logs: string[] = await page.evaluate((t) => window.oak.logs(t), startedAt);
  const result = {
    scenario: sc.name,
    delaySoundsMs: sc.delaySoundsMs,
    preload: sc.mode,
    preloadReport: report ?? listReport ?? null,
    soundFileRequests: { beforePreload: requestsBeforeStart, atStart: requestsAtStart, afterStart: sounds(net).length - requestsAtStart },
    logsAfterStart: {
      total: logs.length,
      skipped: logs.filter((l) => SKIP.test(l)).length,
      loads: logs.filter((l) => /\[sampler\] load /.test(l)).length,
      samples: logs.filter((l) => SKIP.test(l)).slice(0, 4),
      other: [...new Set(logs.filter((l) => !SKIP.test(l) && !/\[sampler\] load /.test(l)))].slice(0, 4),
    },
    firstCycleRms: Number(firstCycle.rms.toFixed(4)),
    external: net.external,
  };
  saveResult(`03-preload-${sc.name}`, result);
  return result;
}

test("A: no preload, natural localhost latency", async ({ page, context }) => {
  const r = await run(page, context, { name: "A-none-natural", delaySoundsMs: 0, mode: "none" });
  expect(r.external).toEqual([]);
  // informational: on localhost the 100 ms scheduler latency may or may not be enough
});

test("B: no preload, +300 ms per sound file -> first haps are skipped", async ({ page, context }) => {
  const r = await run(page, context, { name: "B-none-slow", delaySoundsMs: 300, mode: "none" });
  expect(r.logsAfterStart.skipped).toBeGreaterThan(0);
  expect(r.soundFileRequests.afterStart).toBeGreaterThan(0);
});

test("C: preloadPattern(2 cycles), +300 ms per sound file -> nothing skipped, nothing fetched after start", async ({ page, context }) => {
  const r = await run(page, context, { name: "C-pattern-slow", delaySoundsMs: 300, mode: "pattern" });
  expect(r.logsAfterStart.skipped).toBe(0);
  expect(r.logsAfterStart.loads).toBe(0);
  expect(r.soundFileRequests.afterStart).toBe(0);
  expect(r.firstCycleRms).toBeGreaterThan(0.05);
});

test("D: preload(sounds, pitches), +300 ms per sound file -> nothing skipped", async ({ page, context }) => {
  const r = await run(page, context, { name: "D-list-slow", delaySoundsMs: 300, mode: "list" });
  expect(r.logsAfterStart.skipped).toBe(0);
  expect(r.logsAfterStart.loads).toBe(0);
  expect(r.soundFileRequests.afterStart).toBe(0);
  expect(r.firstCycleRms).toBeGreaterThan(0.05);
});

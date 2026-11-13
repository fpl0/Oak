// Wave 5: the scope taps on real Web Audio. Offline, the output with an analyser on the master bus and on each
// track equals the output without them, sample for sample (side branches: no added latency, nothing changed). In
// real time a track's analyser hears that track alone and the master hears both; a track that never registered
// reads as silence; dispose leaves nothing connected.
import { expect, test } from "@playwright/test";
import { MODE, openHarness } from "./helpers.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test(`[${MODE}] scope taps: side branches on the master and per track, torn down on dispose`, async ({
  page,
}) => {
  test.setTimeout(60_000);
  const problems = await openHarness(page);
  const run = await page.evaluate(() => window.oakAudioE2E.wave5.scopeRun());
  console.log(`[${MODE}] scope: ${JSON.stringify(run)}`);
  expect(run.identical).toBe(true);
  expect(run.maxDiff).toBe(0);
  // Master: both voices. Track a (220 Hz sine): 220 loud, 330 far below. Track b (330 Hz square): the reverse.
  expect(run.master.at220).toBeGreaterThan(-30);
  expect(run.master.at330).toBeGreaterThan(-40);
  expect(run.trackA.at220).toBeGreaterThan(-20);
  expect(run.trackA.at330).toBeLessThan(run.trackA.at220 - 50);
  expect(run.trackB.at330).toBeGreaterThan(-30);
  expect(run.trackB.at220).toBeLessThan(run.trackB.at330 - 40);
  expect(run.tracks).toEqual(["a", "b"]);
  expect(run.unknownReady).toBe(false);
  expect(run.afterDisposeMax).toBe(0);
  expect(problems).toEqual([]);
});

// The Wave 4 gate (wave4.md §3.4, PLAN W4): the learner's audio through the stretch and the learner's Strudel
// pattern on one A/B transport drift less than 20 ms over 8 bars at 0.75×. Measured on the audio itself: both
// sides are captured sample-accurately and their bar bursts compared bar by bar. A control run with the
// pattern's sound 30 ms behind its clock shows the measure fails above 20 ms. Then the master recorder: a take
// cut to exactly the asked span, the count-in left out.
import { expect, test } from "@playwright/test";
import { AB_DRIFT_GATE_BARS, AB_DRIFT_GATE_MS, AB_DRIFT_GATE_RATE } from "../src/stretch.ts";
import { MODE, openHarness } from "./helpers.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test(`[${MODE}] A/B gate: source and Strudel pattern drift < ${AB_DRIFT_GATE_MS} ms over ${AB_DRIFT_GATE_BARS} bars at ${AB_DRIFT_GATE_RATE}×`, async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = await openHarness(page);
  const run = await page.evaluate((o) => window.oakAudioE2E.wave4.abGateRun(o), {
    rate: AB_DRIFT_GATE_RATE,
    bars: AB_DRIFT_GATE_BARS,
  });
  console.log(
    `[${MODE}] A/B gate at ${run.rate}×, ${run.bars} bars, ${run.sampleRate} Hz: audio drift ${run.audioDriftMs.toFixed(2)} ms (per bar ${JSON.stringify(run.perBarMs)}), clock drift ${run.clockDriftMs.toFixed(3)} ms (onsets heard: source ${run.sourceOnsets}, pattern ${run.mineOnsets})`,
  );
  // Every bar line of the run, 0 to 8, heard on both sides.
  expect(run.perBarMs).toHaveLength(AB_DRIFT_GATE_BARS + 1);
  expect(run.clockDriftMs).toBeLessThan(AB_DRIFT_GATE_MS);
  // THE GATE.
  expect(run.audioDriftMs).toBeLessThan(AB_DRIFT_GATE_MS);
  // Switching sides keeps the position (gains only): the bar moves by the time between two reads, not more.
  for (const s of run.switches) expect(Math.abs(s.after - s.before)).toBeLessThan(0.02);
  expect(problems).toEqual([]);
});

test(`[${MODE}] the gate measure fails above ${AB_DRIFT_GATE_MS} ms: a pattern sounding 30 ms behind its clock`, async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openHarness(page);
  const run = await page.evaluate(() =>
    window.oakAudioE2E.wave4.abGateRun({ rate: 0.75, bars: 2, skewSec: 0.03 }),
  );
  console.log(
    `[${MODE}] control: audio drift ${run.audioDriftMs.toFixed(2)} ms (per bar ${JSON.stringify(run.perBarMs)})`,
  );
  expect(run.perBarMs).toHaveLength(3);
  expect(run.audioDriftMs).toBeGreaterThan(AB_DRIFT_GATE_MS);
  expect(run.audioDriftMs).toBeLessThan(45);
});

test(`[${MODE}] master recorder: MediaRecorder of the bus cut to exactly [at, at + 2.5 s], count-in excluded`, async ({
  page,
}) => {
  const problems = await openHarness(page);
  const run = await page.evaluate(() => window.oakAudioE2E.wave4.recorderRun());
  console.log(
    `[${MODE}] recorder: ${JSON.stringify(run.latency)} peak ${run.peak.toFixed(3)} ${run.mime} exact=${run.exact} ${run.durationS.toFixed(3)} s onsets ${JSON.stringify(run.onsets.map((t) => Math.round(t * 1000)))} ms`,
  );
  expect(run.mime).toBe("audio/wav");
  expect(run.exact).toBe(true);
  expect(run.durationS).toBeCloseTo(2.5, 2);
  // The four bursts from `at`, nothing of the count-in before them.
  expect(run.onsets).toHaveLength(4);
  // Each where it was played, to within 8 ms (the burst's own attack is 1 ms to half height).
  for (const [i, t] of run.onsets.entries()) expect(Math.abs(t - i * 0.5)).toBeLessThan(0.008);
  expect(problems).toEqual([]);
});

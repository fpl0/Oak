// Wave 5: the long-take recorder. A 3-minute piece (a click every half second) is rendered offline — faster than
// real time, through the same AudioWorklet — and recorded from 1 s for 180 s plus a 2 s tail: the WAV is exactly
// 182 s long, every click sits on the very frame it was played (no drift after three minutes), the tail is all
// there, and the page never held more than eight one-second chunks of PCM at a time. A short real-time take then
// starts on its asked context time, to the sample.
import { expect, test } from "@playwright/test";
import { MODE, openHarness } from "./helpers.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test(`[${MODE}] long take: 3 minutes recorded without drift or a cut tail, memory bounded`, async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = await openHarness(page);
  const run = await page.evaluate(() =>
    window.oakAudioE2E.wave5.longTakeRun({ seconds: 180, at: 1, tailSec: 2 }),
  );
  console.log(`[${MODE}] long take: ${JSON.stringify(run)}`);
  const sr = run.sampleRate;
  expect(sr).toBe(48000);
  expect(run.channels).toBe(2);
  expect(run.frames).toBe(182 * sr);
  expect(run.bytes).toBe(44 + 182 * sr * 4);
  // Clicks at 1.0, 1.5, … 182.5 s of the clock: 364 of them inside [1, 183), the first on frame 0.
  expect(run.clicks).toBe(364);
  expect(run.allExact).toBe(true);
  expect(run.firstClick).toBe(0);
  expect(run.lastClick).toBe(181.5 * sr);
  expect(run.peak).toBeCloseTo(0.8, 3);
  expect(run.peakHeldBytes).toBeLessThanOrEqual(8 * sr * 4);
  expect(run.parts).toBe(Math.ceil(182 / 8));
  expect(problems).toEqual([]);
});

test(`[${MODE}] live take: the take starts on its context time, to the sample`, async ({ page }) => {
  test.setTimeout(30_000);
  const problems = await openHarness(page);
  const run = await page.evaluate(() => window.oakAudioE2E.wave5.liveTakeRun());
  console.log(`[${MODE}] live take: ${JSON.stringify(run)}`);
  expect(run.frames).toBe(Math.round(1.2 * run.sampleRate));
  expect(Math.abs(run.onsetFrame - run.expectedFrame)).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});

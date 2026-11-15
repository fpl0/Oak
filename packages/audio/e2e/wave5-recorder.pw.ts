// Wave 5: the long-take recorder. Wave 7: the take is the longest a capstone can ask — 128 bars (MAX_CAPSTONE_BARS)
// at AC1's slowest 60 BPM, 512 s, longer than JC3's two choruses at 120 BPM (128 s) — with a click every half second,
// rendered offline (faster than real time, through the same AudioWorklet) and recorded from 1 s for 512 s plus a 2 s
// tail: the WAV is exactly 514 s long, every click sits on the very frame it was played (no drift after eight and a
// half minutes), nothing is missing, the tail is all there, and the page never held more than eight one-second chunks
// of PCM at a time. A short real-time take then starts on its asked context time, to the sample.
import { expect, test } from "@playwright/test";
import { MODE, openHarness } from "./helpers.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test(`[${MODE}] long take: the longest capstone take (512 s) recorded without drift or a cut tail, memory bounded`, async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = await openHarness(page);
  const run = await page.evaluate(() =>
    window.oakAudioE2E.wave5.longTakeRun({ seconds: 512, at: 1, tailSec: 2 }),
  );
  console.log(`[${MODE}] long take: ${JSON.stringify(run)}`);
  const sr = run.sampleRate;
  expect(sr).toBe(48000);
  expect(run.channels).toBe(2);
  expect(run.frames).toBe(514 * sr);
  expect(run.bytes).toBe(44 + 514 * sr * 4);
  // Clicks at 1.0, 1.5, … s of the clock: 1028 of them inside [1, 515), the first on frame 0.
  expect(run.clicks).toBe(1028);
  expect(run.allExact).toBe(true);
  expect(run.firstClick).toBe(0);
  expect(run.lastClick).toBe(513.5 * sr);
  expect(run.peak).toBeCloseTo(0.8, 3);
  expect(run.missingFrames).toBe(0);
  expect(run.dropouts).toBe(0);
  expect(run.peakHeldBytes).toBeLessThanOrEqual(8 * sr * 4);
  expect(run.parts).toBe(Math.ceil(514 / 8));
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

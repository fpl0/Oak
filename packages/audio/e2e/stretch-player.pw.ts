// The Wave 4 StretchPlayer on the real signalsmith-stretch node: 0.75× keeps the pitch, +12 semitones and +50¢
// move it without touching the tempo, and the clock wraps inside an A–B loop.
import { expect, test } from "@playwright/test";
import { cents, MODE, openHarness } from "./helpers.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test(`[${MODE}] StretchPlayer: rate without pitch change, transpose and fine-tune, A–B loop`, async ({
  page,
}) => {
  const problems = await openHarness(page);
  const run = await page.evaluate(() => window.oakAudioE2E.wave4.stretchPlayerRun());
  console.log(
    `[${MODE}] stretch player: ${JSON.stringify(run.hz)} loop ${JSON.stringify(run.loopTimes.map((t) => Math.round(t * 100) / 100))}`,
  );
  expect(Math.abs(cents(run.hz.normal, 440))).toBeLessThan(10);
  expect(Math.abs(cents(run.hz.octaveUp, 880))).toBeLessThan(10);
  expect(Math.abs(cents(run.hz.fineTune, 440) - 50)).toBeLessThan(10);
  expect(Math.abs(cents(run.hz.looped, 440))).toBeLessThan(10);
  // Inside [1, 2) once the loop is on (after its first pass reaches it), and it wraps at least once.
  const settled = run.loopTimes.slice(-20);
  for (const t of settled) {
    expect(t).toBeGreaterThanOrEqual(1 - 1e-6);
    expect(t).toBeLessThan(2 + 1e-6);
  }
  const wraps = settled.filter((t, i) => i > 0 && t < (settled[i - 1] as number) - 0.3).length;
  expect(wraps).toBeGreaterThanOrEqual(1);
  expect(problems).toEqual([]);
});

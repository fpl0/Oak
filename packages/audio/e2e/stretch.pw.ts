// The transcription player plays a generated WAV through signalsmith-stretch at 0.75× with an A–B loop:
// position advances at 0.75 s per second, wraps inside [A, B), and the pitch is unchanged by the rate;
// +12 semitones and +50¢ fine-tune move it as they should.
import { expect, test } from "@playwright/test";
import { cents, MODE, openHarness } from "./helpers.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test(`[${MODE}] stretch: 0.75× with an A–B loop, pitch preserved, transpose and fine-tune`, async ({
  page,
}) => {
  const problems = await openHarness(page);
  const run = await page.evaluate(() => window.oakAudioE2E.stretchRun());
  expect(run.durationS).toBeCloseTo(4, 2);
  const pos = run.positions;
  expect(pos.length).toBeGreaterThan(30);

  // Rate: slope of the file position over context time on the first run from 0.5 s up to B (2 s).
  const firstRun: [number, number][] = [];
  for (const p of pos) {
    if (firstRun.length && p[1] < (firstRun.at(-1) as [number, number])[1]) break;
    firstRun.push(p);
  }
  const a = firstRun[1] as [number, number];
  const b = firstRun.at(-1) as [number, number];
  const rate = (b[1] - a[1]) / (b[0] - a[0]);
  // A–B: once B was reached the position wraps and stays inside [1, 2].
  const wraps = pos.filter((p, i) => i > 0 && p[1] < (pos[i - 1] as [number, number])[1] - 0.3).length;
  const afterA = pos.filter((p) => p[0] > run.playStart + 0.8 / 0.75 + 0.2);
  console.log(
    `[${MODE}] sr=${run.sampleRate} rate=${rate.toFixed(3)} wraps=${wraps} hz=${JSON.stringify(run.hz)} first=${JSON.stringify(firstRun.slice(0, 3))}`,
  );
  expect(Math.abs(rate - 0.75)).toBeLessThan(0.05);
  expect(wraps).toBeGreaterThanOrEqual(1);
  for (const [, t] of afterA) {
    expect(t).toBeGreaterThanOrEqual(1 - 0.02);
    expect(t).toBeLessThanOrEqual(2 + 0.06);
  }
  // Time-stretching keeps the pitch; the controls move it.
  expect(Math.abs(cents(run.hz.normal, 440))).toBeLessThan(10);
  expect(Math.abs(cents(run.hz.octaveUp, 880))).toBeLessThan(10);
  expect(Math.abs(cents(run.hz.fineTune, 440) - 50)).toBeLessThan(10);
  expect(run.states.at(-1)?.playing).toBe(false);
  expect(problems).toEqual([]);
});

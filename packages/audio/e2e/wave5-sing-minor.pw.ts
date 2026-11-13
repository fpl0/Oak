// Wave 5 (U10): a sung minor phrase through the fake microphone (Chromium reads a looping WAV as the mic). The take
// goes through the mic graph's AudioWorklet and the graders' tracker; `gradeSung` judges it, sight-sung with
// onsets, against degree targets in A minor: 1 ♭3 4 5 ♭6 5 7 1′, with the do-based syllables (me, le, and ti for
// the raised 7). The Quiet path never opens a mic: with Quiet mode on, a sing step shows its fallback (contracts
// §8.5; the answers and lesson suites cover that surface).
import { expect, test } from "@playwright/test";
import { fakeMicArgs, MODE, openHarness } from "./helpers.ts";
import { SING_TOL, writeSingFixtures } from "./wave5-helpers.ts";

writeSingFixtures();
test.use({ launchOptions: { args: fakeMicArgs("sing-minor.wav") } });

test(`[${MODE}] a sung minor phrase: ♭3, ♭6 and the raised 7 credited, named do-based`, async ({ page }) => {
  test.setTimeout(60_000);
  const problems = await openHarness(page);
  const beat = 60 / 90;
  const degrees = ["1", "b3", "4", "5", "b6", "5", "7", "1"] as const;
  const run = await page.evaluate((o) => window.oakAudioE2E.wave5.singRun(o), {
    seconds: 16,
    key: { tonic: "A", mode: "minor" as const },
    tonicMidi: 57,
    notes: degrees.map((degree, k) => ({ degree, octave: k === 7 ? 1 : 0, at: k * beat, dur: beat - 0.07 })),
    mode: "sight" as const,
    tol: { ...SING_TOL, onsetMs: 120 },
  });
  console.log(`[${MODE}] minor: ${JSON.stringify(run.result.notes)} score ${run.result.score}`);
  expect(run.syllables).toEqual(["do", "me", "fa", "sol", "le", "sol", "ti", "do"]);
  expect(run.result.notes.map((n) => n.credit)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  expect(run.result.pass).toBe(true);
  expect(run.result.medianAbsCents ?? 99).toBeLessThan(25);
  expect(problems).toEqual([]);
});

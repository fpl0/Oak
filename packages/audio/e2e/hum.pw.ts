// Hum-to-draft through the fake microphone (contracts §6.12): a line hummed on "oo" in G major at 96 bpm, 20¢
// sharp (1 2 3 5 | 5 3 1–), arrives through the mic graph's AudioWorklet; `humToDraft` turns the frames into
// degrees and a draft `n()` line on the eighth-note grid, the tuning offset removed, in the octave it was sung.
import { expect, test } from "@playwright/test";
import { fakeMicArgs, MODE, openHarness } from "./helpers.ts";

test.use({ launchOptions: { args: fakeMicArgs("hum-g.wav") } });

test(`[${MODE}] hum-to-draft: hummed frames become degrees and a draft n() line`, async ({ page }) => {
  test.setTimeout(60_000);
  const problems = await openHarness(page);
  const beat = 60 / 96;
  const run = await page.evaluate((o) => window.oakAudioE2E.wave4.humRun(o), {
    seconds: 15,
    key: { tonic: "G", mode: "major" as const },
    bpm: 96,
    tuneSec: 8 * beat + 0.3,
  });
  console.log(`[${MODE}] hum: ${run.frames} frames → ${run.draft.code} (tuning ${run.draft.tuningCents}¢)`);
  expect(run.draft.degrees.map((d) => d.degree)).toEqual(["1", "2", "3", "5", "5", "3", "1"]);
  expect(run.draft.degrees.every((d) => d.octave === 0)).toBe(true);
  expect(run.steps).toEqual(["0", "1", "2", "4", "4", "2", "0"]);
  expect(run.draft.pattern).toBe("<[0 1 2 4] [4 2 0 _]>");
  expect(run.draft.scale).toBe("G4:major");
  expect(run.draft.tuningCents).toBeGreaterThan(10);
  expect(run.draft.tuningCents).toBeLessThan(30);
  expect(problems).toEqual([]);
});

// Wave 6 (U13, Rhythm II): pushes, triplets and a compound meter tapped on the keyboard against a click. The page
// plays a count-in and two bars, the TapPad keys are armed (Space; `createTapInput` maps KeyboardEvent.timeStamp
// to the AudioContext clock) and the spec presses Space where a learner would. `gradeRhythmTaps` grades each take
// by the §8.4 rule and reports it onset by onset:
//   pushes     bar 1 as written (each push an eighth ahead of its beat); in bar 2 the push lands ON the beat
//   triplets   two bars with a triplet on beats 1 and 3, tapped evenly: passes, every triplet reads "even"
//   6/8        bar 1 on the dotted-quarter beat (two taps); bar 2 in quarter notes (three taps: the waltz count)
// One take each: the wrong takes of every kind are bun tests (packages/pitch/src/rhythm-taps.test.ts).
import { expect, test } from "@playwright/test";
import { MODE, openHarness } from "./helpers.ts";
import { tapAt } from "./tap-helpers.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test(`[${MODE}] rhythm taps: a push on the beat, even triplets, 6/8 in quarter notes`, async ({ page }) => {
  test.setTimeout(60_000);
  const problems = await openHarness(page);

  // --- pushes: 4/4 at 126 --------------------------------------------------------------------------------
  // 1, 2, (3 pushed: the & of 2), 4, (1 pushed: the & of 4) | 2, (3 pushed), 4
  const pushed = [0, 1 / 4, 3 / 8, 3 / 4, 7 / 8, 1 + 1 / 4, 1 + 3 / 8, 1 + 3 / 4];
  let click = await page.evaluate((o) => window.oakAudioE2E.wave6.tapStart(o), {
    bpm: 126,
    meter: "4/4" as const,
    beatsPerBar: 4,
    bars: 2,
    countIn: 2,
  });
  // Bar 2's push is tapped on beat 3 itself (1 + 1/2) instead of an eighth before it.
  await tapAt(
    page,
    click.perfDownbeat,
    [0, 1 / 4, 3 / 8, 3 / 4, 7 / 8, 1 + 1 / 4, 1 + 1 / 2, 1 + 3 / 4].map((c) => c * click.barMs),
  );
  const push = await page.evaluate((o) => window.oakAudioE2E.wave6.tapFinish(o), {
    onsets: pushed,
    expectTaps: 8,
  });
  console.log(`[${MODE}] pushes: ${JSON.stringify(push)}`);
  expect(push.taps).toBe(8);
  expect(push.kinds).toEqual(["beat", "beat", "push", "beat", "push", "beat", "push", "beat"]);
  // Bar 1's pushes are where they belong (each matched inside its window); bar 2's is on the beat.
  const MATCHED = ["on", "early", "late"];
  for (const v of push.verdicts.slice(0, 6)) expect(MATCHED).toContain(v);
  expect(push.verdicts[6]).toBe("on-the-beat");
  expect(push.pushesOnBeat).toEqual([6]);
  expect(push.said["tap.push-on-beat"]).toBe(
    "1 of your 3 pushes landed on the beat. A push comes an eighth early: tap it just before the beat, then leave the beat itself empty.",
  );
  // The key presses reach the audio clock to within a few ms (the median, so one late press does not decide it).
  const errs = push.errorsMs.slice(0, 6).map((e) => Math.abs(e ?? 99));
  expect(errs.sort((a, b) => a - b)[3]).toBeLessThan(25);
  expect(push.pass).toBe(false);

  // --- triplets: 4/4 at 96 -------------------------------------------------------------------------------
  const trip = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((b) =>
    b % 2 === 0 ? [b / 4, b / 4 + 1 / 12, b / 4 + 2 / 12] : [b / 4],
  );
  click = await page.evaluate((o) => window.oakAudioE2E.wave6.tapStart(o), {
    bpm: 96,
    meter: "4/4" as const,
    beatsPerBar: 4,
    bars: 2,
    countIn: 2,
  });
  await tapAt(
    page,
    click.perfDownbeat,
    trip.map((c) => c * click.barMs),
  );
  const even = await page.evaluate((o) => window.oakAudioE2E.wave6.tapFinish(o), {
    onsets: trip,
    expectTaps: trip.length,
  });
  console.log(`[${MODE}] triplets: ${JSON.stringify(even)}`);
  expect(even.taps).toBe(16);
  expect(even.kinds.filter((k) => k === "triplet").length).toBe(8);
  expect(even.triplets).toEqual(["even", "even", "even", "even"]);
  expect(even.pass).toBe(true);
  expect(even.f1).toBe(1);
  expect(even.said).toEqual({});
  // A triplet eighth at 96 lasts 208 ms: the window is the 50 ms floor.
  expect(even.windowMs).toBeCloseTo(52.1, 0);

  // --- compound meter: 6/8 at 76 to the dotted quarter ---------------------------------------------------
  const beats = [0, 0.5, 1, 1.5];
  click = await page.evaluate((o) => window.oakAudioE2E.wave6.tapStart(o), {
    bpm: 76,
    meter: "6/8" as const,
    beatsPerBar: 2,
    bars: 2,
    countIn: 2,
  });
  // Bar 1: the two beats. Bar 2: three even quarter notes.
  await tapAt(
    page,
    click.perfDownbeat,
    [0, 0.5, 1, 1 + 1 / 3, 1 + 2 / 3].map((c) => c * click.barMs),
  );
  const six = await page.evaluate((o) => window.oakAudioE2E.wave6.tapFinish(o), {
    onsets: beats,
    expectTaps: 5,
  });
  console.log(`[${MODE}] 6/8: ${JSON.stringify(six)}`);
  expect(six.taps).toBe(5);
  for (const v of six.verdicts.slice(0, 3)) expect(MATCHED).toContain(v);
  expect(six.verdicts[3]).toBe("missed");
  expect(six.quarterBars).toEqual([1]);
  expect(six.said["tap.grouping"]).toBe(
    "You tapped 3 even beats to the bar. 6/8 has 2 beats of three eighths: 1 la li 2 la li.",
  );
  expect(six.pass).toBe(false);
  expect(problems).toEqual([]);
});

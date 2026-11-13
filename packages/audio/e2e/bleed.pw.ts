// Runtime bleed detection (contracts §8.6) through the fake microphone, which hears a steady C4 as leaky speakers
// would: the mic graph listens to Oak's output too, so every frame says what was playing. While the output plays
// E4 the mic's C4 is another note (no bleed); while it plays C4 the session's bleed check trips once, and the
// take graded afterwards — the learner's window after the playback — fails with `sing.bleed`.
import { expect, test } from "@playwright/test";
import { fakeMicArgs, MODE, openHarness } from "./helpers.ts";

test.use({ launchOptions: { args: fakeMicArgs("bleed-c4.wav") } });

test(`[${MODE}] bleed: the mic hearing the playback trips the session check and fails the take`, async ({
  page,
}) => {
  test.setTimeout(60_000);
  const problems = await openHarness(page);
  const run = await page.evaluate(() => window.oakAudioE2E.wave4.bleedRun());
  console.log(`[${MODE}] bleed: ${JSON.stringify(run)}`);
  expect(run.annotated).toBeGreaterThan(100);
  // E4 on the output, C4 in the mic: a playback-only span, nothing heard on the note.
  expect(run.other?.bleed).toBe(false);
  expect(run.other?.playbackOnlySec ?? 0).toBeGreaterThan(1);
  expect(run.other?.heardSec).toBe(0);
  // C4 on the output, C4 in the mic: bleed, the hook fired once.
  expect(run.same?.bleed).toBe(true);
  expect(run.same?.heardSec ?? 0).toBeGreaterThan(0.3);
  expect(run.fired).toBe(1);
  expect(run.grade).toEqual({ pass: false, first: "sing.bleed" });
  expect(problems).toEqual([]);
});

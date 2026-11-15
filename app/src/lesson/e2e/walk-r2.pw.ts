// R2 in the real app (Wave 7, wave7.md §7.3; how each kind of test walks: w7walk.ts). R2.L04 (polyrhythm 3:2 and
// 4:3) is walked in full from "R2.L04 next"; R2.L01–L03 and R2.L05 are smoke-walked.
//
// Then the two-hand tap (`tap.lanes`, contracts §8.4; R2.L04 S2 ships it and is answered through the player's
// grading path in the walk above) in real time: the dev fixture R2.L99 (app/src/lesson/dev/wave7-fixture.ts, a preview: nothing saved) draws the pad with its two lanes,
// F for the kick's two and J for the cowbell's three; ONE real-time take tapped with the left hand only (F) reaches
// the grader as two lanes and is read back as the right hand being silent, by key; then both hands on their
// targets pass through the player's own grading path. Every other two-hand answer (swapped, four for three, one
// hand rushing) is wave7-fixture.test.ts's.
import { expect, stepIs, submit, test } from "./support.ts";
import { lookAt } from "./w7look.ts";
import { smokeSuiteW7, walkSuiteW7 } from "./w7walk.ts";

walkSuiteW7(["R2.L04"]);
smokeSuiteW7("R2", ["R2.L01", "R2.L02", "R2.L03", "R2.L05"]);

/** Seconds from bar 1 at 66 BPM: the given fractions of each of four bars (the fixture's `at`). */
const BAR = (4 * 60) / 66;
const at = (places: readonly number[]) =>
  [0, 1, 2, 3].flatMap((bar) => places.map((p) => Math.round((bar + p) * BAR * 1000) / 1000));

test("a two-hand tap (dev fixture R2.L99): two lanes on F and J; a take with one hand says which is silent; both pass", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/learn/R2.L99?preview=true");
  await stepIs(page, "S1");
  const step = page.getByTestId("lesson-step");
  // The pad draws both lanes, each named, before anything is tapped.
  await expect(step.locator("[data-lane]").first()).toBeVisible({ timeout: 30_000 });
  expect(await step.locator("[data-lane]").count()).toBeGreaterThanOrEqual(2);
  await expect(step.getByLabel(/^Tap pad: F for .+, J for .+/)).toBeVisible();
  await expect(step).toContainText("Left hand: the 2, with the kick");
  await expect(step).toContainText("Right hand: the 3, with the cowbell");
  await expect(page.getByTestId("continue"), "tapping never gates").toBeEnabled();
  await lookAt(page, "w7-two-hand-pad");
  await page.setViewportSize({ width: 1440, height: 900 });
  // One real-time take: the left hand only, on F, while the stimulus plays (a count-in bar, then four).
  await step.getByRole("button", { name: "Start tapping" }).click();
  const phase = step.locator("[data-phase]").first();
  await expect(phase).toHaveAttribute("data-phase", "taking", { timeout: 15_000 });
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("f");
    await page.waitForTimeout(600);
  }
  await expect(phase).toHaveAttribute("data-phase", "done", { timeout: 20_000 });
  await page.getByTestId("check").click();
  const fb = page.getByTestId("step-feedback");
  await expect(fb).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  // Read back by key and by the hand's part: the take reached the grader as two lanes, the second one empty.
  await expect(fb).toContainText(/No taps on J/);
  // Both hands on their pulses, through the player's own grading path.
  const r = await submit(page, { lanes: [at([0, 1 / 2]), at([0, 1 / 3, 2 / 3])] });
  expect(r?.status, "both hands on their pulses pass").toBe("pass");
});

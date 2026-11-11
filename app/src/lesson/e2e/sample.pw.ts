// The gate sample lesson (every exercise kind) played end to end at the 20-minute target, in preview (it is not
// part of the course, so nothing is saved): listen, predict, run, investigate (a wrong answer first), the graded
// modify (a known-wrong variant, a hint, the reference), the quiz and ear steps, sing and tap, the multi-part
// practice step and the Make over the Band.
import { expect, setCode, stepIs, submit, test, trialAnswer } from "./support.ts";

const TEMPO = "setcpm(90/4)\n\n";
const mel = (d: string) => `${TEMPO}mel: n("${d}").scale("C4:major").s("piano")`;
const ONE_BEAT = 60 / 90;
const beats = (n: number) => Array.from({ length: n }, (_, i) => Number((i * ONE_BEAT).toFixed(3)));

test("the gate sample plays end to end", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/learn/U00.L00");

  // S1 listen: Skip until a loop has played, then Continue.
  await stepIs(page, "S1");
  await expect(page.getByText("The gate sample lesson")).toBeVisible();
  await expect(page.getByTestId("continue")).toHaveText(/Skip/);
  await page.getByTestId("play-toggle").click();
  await expect(page.getByTestId("continue")).toHaveText(/Continue/, { timeout: 15_000 });
  await page.getByTestId("play-toggle").click();
  await page.getByTestId("continue").click();

  // S2 predict: the code is shown, not playable, until the guess is in.
  await stepIs(page, "S2");
  await expect(page.getByTestId("predict-code")).toContainText('n("0 1 2 3")');
  await page.locator('[data-option="up"]').click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("predict-outcome")).toBeVisible();
  await expect(page.getByTestId("workbench")).toBeVisible();
  await page.getByTestId("continue").click();

  // S3 run: a Run completes it.
  await stepIs(page, "S3");
  await expect(page.getByTestId("check")).toHaveCount(0);
  await page.getByTestId("play-toggle").click();
  await expect(page.getByTestId("continue")).toHaveText(/Continue/);
  await page.getByTestId("play-toggle").click();
  await page.getByTestId("continue").click();

  // S4 investigate: counted from one first (wrong), then right.
  await stepIs(page, "S4");
  await page.locator('[data-question="1"] [data-option="n1"]').click();
  await page.locator('[data-question="2"] input').fill("4");
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  await page.locator('[data-question="1"] [data-option="n0"]').click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass");
  await page.getByTestId("continue").click();

  // S5 graded modify: Continue is closed until a pass; the known-wrong variant gets its feedback.
  await stepIs(page, "S5");
  await expect(page.getByTestId("continue")).toBeDisabled();
  await setCode(page, mel("1 3 5 3"));
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  await expect(page.getByTestId("feedback-panel")).toHaveAttribute("data-status", "fail");
  await expect(page.getByTestId("continue")).toBeDisabled();
  await page.getByTestId("hint").click();
  await expect(page.getByTestId("hint-texts")).toContainText("Which number plays degree 1?");
  await expect(page.getByTestId("hint-dots")).toHaveAttribute("aria-label", "Hints used: 1 of 4");
  await setCode(page, mel("0 2 4 2"));
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass");
  await expect(page.getByTestId("on-pass")).toContainText("You just wrote a melody");
  await page.getByTestId("continue").click();

  // S6 quiz, four parts: number, keyboard chord, staff reading, identify from the roll.
  await stepIs(page, "S6");
  const parts = page.locator("[data-part]");
  await parts.nth(0).locator("input").fill("4");
  for (const m of [60, 64, 67]) await parts.nth(1).locator(`[data-midi="${m}"]`).click();
  await parts.nth(2).locator('[data-option="1353"]').click();
  await parts.nth(3).locator('[data-option="skips"]').click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass");
  await page.getByTestId("continue").click();

  // S7 ear: the generated degree (read from the drawn trial) and the dictation.
  await stepIs(page, "S7");
  const expected = await trialAnswer(page);
  const degree = expected?.degrees?.[0] ?? "1";
  const other = degree === "5" ? "3" : "5";
  const r = await submit(page, {
    parts: [{ answer: { degrees: [other] } }, { answer: { degrees: ["1", "3", "5", "3"] } }],
  });
  expect(r?.status).toBe("fail");
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  const r2 = await submit(page, {
    parts: [{ answer: { degrees: [degree] } }, { answer: { degrees: ["1", "3", "5", "3"] } }],
  });
  expect(r2?.status).toBe("pass");
  await page.getByTestId("continue").click();

  // S8 sing and tap (practice): sung notes and the taps of the reference.
  await stepIs(page, "S8");
  const sung = [60, 64, 67].map((midi) => ({ midi, cents: 0, credit: 1 }));
  const r3 = await submit(page, { parts: [{ sung }, { taps: beats(8) }] });
  expect(r3?.status).toBe("pass");
  await page.getByTestId("continue").click();

  // S11 fix, fill, click, order and sketch: every part answered from its reference.
  await stepIs(page, "S11");
  const r4 = await submit(page, {
    parts: [
      { blanks: { deg: "4" } },
      { code: 'setcpm(90/4)\n\nmel: n("0 2 4 2").scale("C4:major").s("piano")' },
      { parts: [{ click: { from: 24, to: 25 } }] },
      { order: ["a", "b"] },
      { code: 'setcpm(90/4)\n\nmel: n("<[0 2 4 2] [4 2 1 0]>").scale("C4:major").s("piano")' },
    ],
  });
  expect(r4?.status).toBe("pass");
  await page.getByTestId("continue").click();

  // S12 the Make over the Band: a Run ticks the required rule; Save ends the lesson (a preview saves nothing).
  await stepIs(page, "S12");
  await page.getByTestId("play-toggle").click();
  await expect(page.locator('[data-rule="degrees"]')).toHaveAttribute("data-ok", "1", { timeout: 20_000 });
  await page.getByTestId("play-toggle").click();
  // Five bars where the brief asks for two to four: past the brief, never a failure.
  await setCode(page, mel("<[0 2 4 2] [4 2 1 0] [0 2 4 2] [4 2 1 0] [2 1 0 0]>"));
  await page.getByTestId("play-toggle").click();
  await expect(page.getByTestId("beyond-brief")).toContainText("You went past today's brief");
  await expect(page.locator('[data-rule="degrees"]')).toHaveAttribute("data-ok", "1");
  await page.getByTestId("play-toggle").click();
  await page.getByTestId("save-sketch").click();
  await expect(page.getByTestId("lesson-complete")).toBeVisible();
  await expect(page.getByText("nothing was saved")).toBeVisible();

  expect(errors.filter((e) => !/Download the React DevTools/.test(e))).toEqual([]);
});

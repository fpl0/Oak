// Regression: a sung take with no voice in it (a silent room) is graded `error` with `sing.no-voice`; the lesson
// said "Code didn't run." for it. Now the summary says Oak didn't hear a voice, and Sing it again / Skip remain.
import { expect, test } from "@playwright/test";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
import u00l02 from "../../content/core/U00/L02/lesson.ts";
import { walkLesson } from "../journey/lesson-walk.ts";
import { noHmr, openToday, resetClock, seed, watch } from "./support.ts";

test.use({ launchOptions: { args: fakeMic("silent.wav") }, permissions: ["microphone"] });
test("a take with no voice says Oak didn't hear one (never 'Code didn't run.')", async ({
  page,
  request,
}) => {
  await resetClock(request);
  await seed(request, "onboarded");
  await noHmr(page);
  const problems = watch(page);
  await openToday(page);
  await page.getByTestId("start-session").click();
  await walkLesson(page, u00l02, { stopAt: "S5" });
  await page.getByRole("button", { name: "Sing", exact: true }).click();
  await expect(page.getByTestId("sing-phase")).toContainText("Done: 0 of 1 in tune", { timeout: 30_000 });
  await page.getByTestId("check").click();
  const summary = page.getByTestId("step-feedback-summary");
  await expect(summary).toContainText("didn't hear a voice");
  await expect(summary).not.toContainText("Code");
  // The learner is never stuck: Skip stays, and singing again is offered.
  await expect(page.getByRole("button", { name: "Sing it again" })).toBeEnabled();
  expect(problems).toEqual([]);
});

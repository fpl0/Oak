// Regression: U00.L02's first sung note ("Sing it back") targets the notes of its stimulus (`target.from:
// "stimulus"`). The lesson host only built sing targets for `from: "degrees"`, so the course's first sing showed
// "This step has no notes to sing yet." and the learner could only skip it. Now the stimulus is read for its own
// bars (as the grader reads it) and the learner sings into the lane with the real (fake) microphone.
import { expect, test } from "@playwright/test";
import u00l02 from "../../content/core/U00/L02/lesson.ts";
import { walkLesson } from "../journey/lesson-walk.ts";
import { useUiPrefs } from "../support/ui.ts";
import { noHmr, openToday, resetClock, reviewMic, seed, shootAll, watch } from "./support.ts";

test.use({ launchOptions: { args: reviewMic("hold-c4.wav") }, permissions: ["microphone"] });

test("the first sung note of the course has a note to sing, and the take is graded", async ({
  page,
  request,
}) => {
  await resetClock(request);
  await seed(request, "onboarded");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  await openToday(page);
  await page.getByTestId("start-session").click();
  await walkLesson(page, u00l02, { stopAt: "S5" });
  await expect(page.getByText("This step has no notes to sing yet.")).toHaveCount(0);
  await expect(page.getByTestId("sing-phase")).toContainText("One note", { timeout: 20_000 });
  await expect(page.getByRole("img", { name: /Pitch lane/ })).toBeVisible();
  await shootAll(page, "sing-step-ready");
  await page.getByRole("button", { name: "Sing", exact: true }).click();
  await expect(page.getByTestId("sing-phase")).toContainText("Done: 1 of 1 in tune", { timeout: 30_000 });
  await shootAll(page, "sing-step-done");
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass", { timeout: 30_000 });
  expect(problems).toEqual([]);
});

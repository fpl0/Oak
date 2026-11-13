// Save-and-wrap in the middle of a lesson, resumed the next day: Wrap up → Quick sketch → Coda → Done for today;
// the next day Today says where the lesson picks up, and Start opens it at that step (not at step 1), after the
// day's warm-up. (It wraps on a graded step: on an ungraded one the server counts the step on screen as visited
// and resumes after it, reported to the server owner.) Both days' warm-ups are reported skipped through the
// session's dev hook: the subject is the wrap and the resume, and the warm-up sets are walked by the drill,
// warm-up and journey suites.
import { expect, test } from "@playwright/test";
import u01l01 from "../../content/core/U01/L01/lesson.ts";
import { stepIs, walkLesson } from "../journey/lesson-walk.ts";
import { useUiPrefs } from "../support/ui.ts";
import {
  advanceDays,
  api,
  noHmr,
  openToday,
  resetClock,
  reviewMic,
  seed,
  shootAll,
  skipWarmup,
  watch,
} from "./support.ts";

test.use({ launchOptions: { args: reviewMic("hold-c4.wav") }, permissions: ["microphone"] });

test("a wrapped lesson resumes the next day at the step it stopped on", async ({ page, request }) => {
  await resetClock(request);
  await seed(request, "after U00.L02");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  await openToday(page);
  await page.getByTestId("start-session").click();
  await skipWarmup(page);
  await walkLesson(page, u01l01, { stopAt: "S6" });
  await page.getByRole("button", { name: "Wrap up" }).first().click();
  await expect(page.getByRole("heading", { name: "Quick sketch" }).first()).toBeVisible();
  await shootAll(page, "wrap-quick-sketch");
  // Run it once, then save: the sketch counts for the day.
  await page.getByTestId("play-toggle").first().click();
  await page.waitForTimeout(1200);
  await page.getByTestId("play-toggle").first().click();
  await page.getByRole("button", { name: "Save sketch" }).click();
  await expect(page).toHaveURL(/\/session\/coda$/, { timeout: 60_000 });
  await shootAll(page, "wrap-coda");
  await expect(page.getByTestId("coda-title")).toBeVisible();
  const moment = page.getByTestId("coda-unlock-moment");
  if (await moment.isVisible().catch(() => false))
    await moment.getByRole("button", { name: "See the rest of today" }).click();
  await page.getByTestId("done-for-today").click();
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("today-done")).toContainText(/Next time: Heartbeat, from step 6/);

  await advanceDays(request, 1);
  const plan = await api<{ mapItemId: string; main: { resumeStep: string | null } | null }>(
    request,
    "GET",
    "/api/session/today",
  );
  expect(plan.mapItemId).toBe("U01.L01");
  expect(plan.main?.resumeStep).toBe("S6");
  await openToday(page);
  await expect(page.getByTestId("today-card")).toContainText(/Heartbeat, from step 6 of 8/);
  await shootAll(page, "wrap-today-next-day");
  await page.getByTestId("start-session").click();
  await expect(page.getByTestId("warmup").or(page.getByTestId("lesson-step")).first()).toBeVisible({
    timeout: 60_000,
  });
  if (await page.getByTestId("warmup").isVisible()) await skipWarmup(page);
  await stepIs(page, "S6");
  expect(problems).toEqual([]);
});

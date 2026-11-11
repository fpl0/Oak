// The learner's day ends at 04:00 local (contracts §7.8), not at midnight. Two sessions across the boundaries,
// on the dev clock (the server's day; the profile's timezone is the server's, Europe/Dublin = UTC in November):
//  - begun 23:50, finished 00:15: still the same learner day; Today says done; that day is on the week strip;
//    at 04:10 Today offers the next lesson.
//  - begun 03:50, finished 04:15 (regression): the session belongs to the previous day, the saved sketch makes
//    the new day a qualifying one, and Today offered a whole new setlist straight after "Done for today". Now it
//    says the session is complete.
import { expect, test } from "@playwright/test";
import u00l02 from "../../content/core/U00/L02/lesson.ts";
import { walkLesson } from "../journey/lesson-walk.ts";
import { useUiPrefs } from "../support/ui.ts";
import {
  advanceMinutes,
  api,
  clockTo,
  noHmr,
  openToday,
  resetClock,
  reviewMic,
  seed,
  watch,
} from "./support.ts";

test.use({ launchOptions: { args: reviewMic("hold-c4.wav") }, permissions: ["microphone"] });

interface Boot {
  day: string;
  streak: { todayQualified: boolean; thisWeek: { days: { day: string; qualified: boolean }[] } };
}
const SING = { S5: { sung: [{ midi: 60, cents: 0, credit: 1 }] } };

async function playLessonAcross(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
  minutes: number,
) {
  await openToday(page);
  await page.getByTestId("start-session").click();
  await walkLesson(page, u00l02, { stopAt: "S6", answers: SING });
  await advanceMinutes(request, minutes);
  await walkLesson(page, u00l02, { makeTitle: "Late one" });
  await expect(page).toHaveURL(/\/session\/coda$/, { timeout: 60_000 });
  const moment = page.getByTestId("coda-unlock-moment");
  if (await moment.isVisible().catch(() => false))
    await moment.getByRole("button", { name: "See the rest of today" }).click();
  await page.getByTestId("done-for-today").click();
  await expect(page).toHaveURL(/\/$/);
}

test.afterEach(async ({ request }) => {
  await resetClock(request);
});

test("a session across midnight stays on the same learner day", async ({ page, request }) => {
  await clockTo(request, "2026-11-12T23:40:00Z");
  await seed(request, "onboarded");
  await clockTo(request, "2026-11-12T23:50:00Z");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  await playLessonAcross(page, request, 25);
  const card = page.getByTestId("today-card");
  await expect(card).toHaveAttribute("data-state", "done");
  const b = await api<Boot>(request, "GET", "/api/bootstrap");
  expect(b.day).toBe("2026-11-12");
  expect(b.streak.todayQualified).toBe(true);
  expect(b.streak.thisWeek.days.find((d) => d.day === "2026-11-12")?.qualified).toBe(true);
  await clockTo(request, "2026-11-13T04:10:00Z");
  await page.reload();
  await expect(card).toHaveAttribute("data-state", /normal|welcome-back|light|resume/);
  await expect(page.getByTestId("start-session")).toBeVisible();
  expect(problems).toEqual([]);
});

test("a session across the 04:00 rollover ends 'done' for the new day", async ({ page, request }) => {
  await clockTo(request, "2026-11-12T03:30:00Z");
  await seed(request, "onboarded");
  await clockTo(request, "2026-11-12T03:50:00Z");
  await noHmr(page);
  const problems = watch(page);
  expect((await api<Boot>(request, "GET", "/api/bootstrap")).day).toBe("2026-11-11");
  await playLessonAcross(page, request, 25);
  const b = await api<Boot>(request, "GET", "/api/bootstrap");
  expect(b.day).toBe("2026-11-12");
  expect(b.streak.todayQualified).toBe(true);
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
  await page.reload();
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
  expect(problems).toEqual([]);
});

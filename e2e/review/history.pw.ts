// Regression: starting a session from Today REPLACED Today's history entry with /session, so the browser's Back
// in the middle of a session left Oak (about:blank, or whatever came before). Now Back returns to Today, which
// offers to resume, Forward returns to the step, and a reload at any step lands on that same step.
import { expect, test } from "@playwright/test";
import u00l02 from "../../content/core/U00/L02/lesson.ts";
import { continueOn, stepIs } from "../journey/lesson-walk.ts";
import { useUiPrefs } from "../support/ui.ts";
import { noHmr, openToday, resetClock, reviewMic, seed, watch } from "./support.ts";

test.use({ launchOptions: { args: reviewMic("hold-c4.wav") }, permissions: ["microphone"] });

test("Back from a session returns to Today; Forward and reloads keep the step", async ({ page, request }) => {
  await resetClock(request);
  await seed(request, "onboarded");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  await openToday(page);
  await page.getByTestId("start-session").click();
  await expect(page).toHaveURL(/\/session$/);
  await stepIs(page, "S1");
  const keep = page.getByTestId("setup-keep");
  if (await keep.isVisible().catch(() => false)) await keep.click();
  await continueOn(page);
  await stepIs(page, "S2");

  await page.goBack();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  const card = page.getByTestId("today-card");
  await expect(card).toHaveAttribute("data-state", "in-session");
  await expect(page.getByRole("button", { name: /Resume session/ })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/session$/);
  await stepIs(page, "S2");

  await page.reload();
  await stepIs(page, "S2");

  // Back again, then Resume from Today: the same step, not the start of the lesson.
  await page.goBack();
  await expect(card).toHaveAttribute("data-state", "in-session");
  await page.getByRole("button", { name: /Resume session/ }).click();
  await stepIs(page, "S2");
  expect(u00l02.steps[1]?.id).toBe("S2");
  expect(problems).toEqual([]);
});

// Regressions of the first day, found by playing it as a new learner:
//  1. After onboarding ("Session complete … Done for today") Today offered a full 20-minute session again,
//     as if nothing had happened today. Now it shows the done state (Start another session stays available).
//  2. The onboarding day was missing from the week strip: Sketch 001 was saved with `ranOk: false` unless the
//     learner pressed Run again on the sketch screen, though the edit and reaction screens had just played that
//     very code. Now the heard version counts, the day qualifies and the strip shows it.
//  3. The onboarding Coda listed the Sing panel as "New in your toolbox" (it arrives with U00.L02, which Today
//     then names as the next unlock), and both showed the contract's editorial names ("Band layer (read-only
//     backing; mute only)", "Sing panel (PitchLane)", "lowercase track labels name:").
//  4. The onboarding Coda said "Next time: Heartbeat" (U01.L01) while Today's next lesson is U00.L02.
import { expect, test } from "@playwright/test";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
import { useUiPrefs } from "../support/ui.ts";
import { walkOnboarding } from "./onboarding-walk.ts";
import { api, noHmr, openToday, resetClock, seed, shootAll, watch } from "./support.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") }, permissions: ["microphone"] });

test("the first day ends done, counted, and with plain tool names", async ({ page, request }) => {
  await resetClock(request);
  await seed(request, "fresh");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  await openToday(page);
  await page.getByTestId("begin-onboarding").click();
  await walkOnboarding(page, {
    atCoda: async () => {
      const box = page.getByTestId("coda-toolbox");
      await expect(box).toContainText("Band layer");
      await expect(box).not.toContainText("(");
      await expect(box).not.toContainText("Sing panel");
      await expect(box).not.toContainText("lowercase track labels");
      await expect(box).toContainText("label: pattern");
      // The Coda's "Next time" names the lesson Today will offer (it said "Heartbeat", which is U01.L01).
      await expect(page.getByTestId("screen-coda")).toContainText("Next time: Set Up & First Sing.");
      await shootAll(page, "onboarding-coda");
    },
  });
  const card = page.getByTestId("today-card");
  await expect(card).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("today-done")).toContainText("Next time: Set Up & First Sing");
  await expect(page.getByRole("button", { name: "Start another session" })).toBeVisible();
  const unlock = page.getByTestId("next-unlock");
  await expect(unlock).toContainText("Sing panel");
  await expect(unlock).not.toContainText("PitchLane");
  const boot = await api<{ streak: { todayQualified: boolean; thisWeek: { qualifyingDays: number } } }>(
    request,
    "GET",
    "/api/bootstrap",
  );
  expect(boot.streak.todayQualified).toBe(true);
  expect(boot.streak.thisWeek.qualifyingDays).toBe(1);
  await expect(page.getByText(/1 of \d days this week/)).toBeVisible();
  await shootAll(page, "today-after-onboarding");
  // A reload keeps the done state (it is remembered in this browser).
  await page.reload();
  await expect(card).toHaveAttribute("data-state", "done");
  expect(problems).toEqual([]);
});

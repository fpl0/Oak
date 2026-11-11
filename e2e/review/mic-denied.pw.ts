// The microphone refused in the middle of a session (the browser denies it): the course's first sung note offers
// "listen and self-check" (contracts §8.5), says why in plain words, and the learner goes on with no penalty.
import { expect, test } from "@playwright/test";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
import u00l02 from "../../content/core/U00/L02/lesson.ts";
import { continueOn, walkLesson } from "../journey/lesson-walk.ts";
import { noHmr, openToday, resetClock, seed, shootAll, watch } from "./support.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav", "deny") } });

test("a denied microphone turns the sung step into listen-and-self-check, never a dead end", async ({
  page,
  request,
}) => {
  await resetClock(request);
  await seed(request, "onboarded");
  await noHmr(page);
  const problems = watch(page, [/Permission denied|NotAllowedError|microphone/i]);
  await openToday(page);
  await page.getByTestId("start-session").click();
  await walkLesson(page, u00l02, { stopAt: "S5" });
  await page.getByRole("button", { name: "Sing", exact: true }).click();
  await expect(page.getByText("Listen and self-check", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/microphone is blocked for Oak/)).toBeVisible();
  // The learner did not choose Quiet mode, so the panel does not call it that, and no mic shortcut is offered.
  await expect(page.getByText(/Quiet mode:/)).toHaveCount(0);
  await expect(page.getByText("close the mic")).toHaveCount(0);
  await shootAll(page, "mic-denied-self-check");
  await page.getByRole("button", { name: "I heard it" }).click();
  await expect(page.getByText("Noted.", { exact: false })).toBeVisible();
  // On to the Make: Skip (or Continue) is always there.
  const skip = page.getByRole("button", { name: /^(Skip|Continue)/ }).last();
  await expect(skip).toBeEnabled();
  await skip.click();
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", "S6", { timeout: 20_000 });
  void continueOn;
  expect(problems).toEqual([]);
});

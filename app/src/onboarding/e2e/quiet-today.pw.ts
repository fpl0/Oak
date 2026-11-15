// Quiet mode switched on in Settings › Voice ("just for today", another tab) while the first note is listening
// turns the step into its listening version at once and closes the mic: it used to keep singing, and came back as
// the sung version after a reload, because onboarding read only the profile's own flag. `/onboarding` typed by hand
// resumes the flow (it was "This page isn't part of Oak"). From the dev seed and the saved place.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import {
  BEFORE_MIC,
  expectStep,
  fakeMic,
  noHmr,
  placeAt,
  resetData,
  shootAll,
  watchErrors,
} from "./helpers.ts";
import { stack } from "./playwright.config.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") } });
test.beforeEach(async ({ request }) => resetData(request, stack.apiURL));

test("Quiet mode for today, switched on in Settings mid-take: the first note becomes a listening step", async ({
  page,
  request,
}) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watchErrors(page);
  await placeAt(request, stack.apiURL, "first-sing", [...BEFORE_MIC, "mic", "range", "latency"]);
  await page.goto("/onboarding/first-sing");
  await expectStep(page, "first-sing");
  await page.getByTestId("first-sing-start").click();
  await expect(page.getByTestId("first-sing-status")).toHaveText("Now sing it back.", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: /Microphone is live/ })).toHaveCount(1);

  // Settings › Voice in a second tab: Quiet mode, just for today (the switch's default).
  const settings = await page.context().newPage();
  await noHmr(settings);
  await settings.goto("/settings/voice");
  await settings.getByTestId("quiet-control").getByRole("switch").click();
  await expect(settings.getByTestId("quiet-control")).toHaveAttribute("data-quiet", "1");
  await settings.close();

  // The take ends, the mic closes, and the step is the listening version: hear the note, learn its name.
  const quietLead = page.getByText("Quiet mode is on, so this one is for your ears only.");
  await expect(quietLead).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /Microphone is live/ })).toHaveCount(0);
  await expect(page.getByTestId("onboarding")).toHaveAttribute("data-quiet", "1");
  await page.getByTestId("first-sing-start").click();
  await expect(page.getByTestId("first-sing-heard")).toBeVisible({ timeout: 10_000 });
  await shootAll(page, "r01-first-note-quiet-today");
  // A reload keeps it so.
  await page.reload();
  await expectStep(page, "first-sing");
  await expect(quietLead).toBeVisible();

  // `/onboarding` by hand resumes where the learner is.
  await page.goto("/onboarding");
  await expectStep(page, "first-sing");
  expect(problems).toEqual([]);
});

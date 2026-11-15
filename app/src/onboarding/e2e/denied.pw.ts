// The browser refuses the microphone: Oak says so plainly, offers Try again, and the primary is "Set up later"
// (Quiet mode, said on screen), so the refusal is never a dead end: timing keeps tapping, and the first note is a
// listening step.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import {
  expectStep,
  fakeMic,
  fromTheReaction,
  noHmr,
  partContinue,
  reactContinue,
  resetData,
  shootAll,
} from "./helpers.ts";
import { stack } from "./playwright.config.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav", "deny") } });
test.beforeEach(async ({ request }) => resetData(request, stack.apiURL));

test("denied permission: explained, retryable, and Set up later carries on in Quiet mode", async ({
  page,
  request,
}) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  await fromTheReaction(page, request, stack.apiURL, 5);
  await reactContinue(page).click();
  await page.getByTestId("prefs-continue").click();
  await expectStep(page, "tutor");
  await page.getByTestId("tutor-continue").click({ timeout: 15_000 });
  await page.getByTestId("part-skip").click();
  await expectStep(page, "mic");
  await page.getByTestId("mic-allow").click();
  await expect(page.getByTestId("mic-denied")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("The browser said no to the microphone")).toBeVisible();
  await expect(page.getByRole("button", { name: /Microphone is live/ })).toHaveCount(0);
  // One green primary, the way on; Try again beside it, with the focus on the primary.
  const row = page.getByTestId("mic-problem-actions");
  await expect(row.getByTestId("result-continue")).toHaveText("Set up later");
  await expect(row.getByTestId("result-continue")).toBeFocused();
  await shootAll(page, "20-mic-denied");
  await row.getByTestId("result-retry").click();
  await expect(page.getByTestId("mic-denied")).toBeVisible({ timeout: 15_000 });
  await row.getByTestId("result-continue").click();
  await expectStep(page, "latency");
  await expect(page.getByTestId("tap-start")).toBeVisible();
  await expect(page.getByTestId("latency-sing")).toHaveCount(0);
  const profile = await (
    await request.get(`${stack.apiURL}/api/profile`, { headers: { "x-oak": "1" } })
  ).json();
  expect(profile.quiet).toBe(true);
  // Timing set up later; the first note is heard, not sung.
  await page.getByTestId("part-skip").click();
  await expectStep(page, "first-sing");
  await page.getByTestId("first-sing-start").click();
  await expect(page.getByText("That note is 1: home.")).toBeVisible({ timeout: 10_000 });
  await partContinue(page).click();
  await expectStep(page, "sketch");
});

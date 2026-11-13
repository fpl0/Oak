// The browser refuses the microphone: Oak says so plainly, offers Try again, and Quiet mode carries on.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { expectStep, fakeMic, fromTheReaction, noHmr, resetData, shootAll } from "./helpers.ts";
import { stack } from "./playwright.config.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav", "deny") } });
test.beforeEach(async ({ request }) => resetData(request, stack.apiURL));

test("denied permission: explained, retryable, and Quiet mode continues", async ({ page, request }) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  await fromTheReaction(page, request, stack.apiURL, 5);
  await page.getByTestId("react-continue").click();
  await page.getByTestId("prefs-continue").click();
  await expectStep(page, "tutor");
  await page.getByTestId("tutor-continue").click({ timeout: 15_000 });
  await page.getByTestId("part-skip").click();
  await expectStep(page, "mic");
  await page.getByTestId("mic-allow").click();
  await expect(page.getByTestId("mic-denied")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("The browser said no to the microphone")).toBeVisible();
  await expect(page.getByRole("button", { name: /Microphone is live/ })).toHaveCount(0);
  await shootAll(page, "20-mic-denied");
  await page.getByTestId("mic-retry").click();
  await expect(page.getByTestId("mic-denied")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("mic-quiet").click();
  await expectStep(page, "latency");
  const profile = await (
    await request.get(`${stack.apiURL}/api/profile`, { headers: { "x-oak": "1" } })
  ).json();
  expect(profile.quiet).toBe(true);
});

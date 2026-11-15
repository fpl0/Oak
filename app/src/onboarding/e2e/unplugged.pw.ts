// A microphone unplugged between the quiet check and the speaker check: the check says there is no microphone, with
// "Set up later" as the primary (Quiet mode) and Try again beside it. It used to do nothing at all: the button came
// back with no word said. Chromium here has no capture device. From the dev seed and the saved place.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { BEFORE_MIC, expectStep, noHmr, placeAt, resetData, shootAll } from "./helpers.ts";
import { stack } from "./playwright.config.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });
test.beforeEach(async ({ request }) => resetData(request, stack.apiURL));

test("the speaker check says there is no microphone, with Set up later and Try again", async ({
  page,
  request,
}) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  await placeAt(request, stack.apiURL, "mic", BEFORE_MIC);
  await page.goto("/onboarding/mic");
  await expectStep(page, "mic");
  // The room was measured with the mic that is now gone: the step resumes at its third part.
  await expect(page.getByTestId("rail-position")).toHaveText(
    "Step 8 of 13 · Microphone · 3 of 3: speaker check",
  );
  await page.getByTestId("bleed-start").click();
  await expect(page.getByTestId("mic-none")).toBeVisible({ timeout: 10_000 });
  const row = page.getByTestId("mic-problem-actions");
  await expect(row.getByTestId("result-continue")).toHaveText("Set up later");
  await expect(row.getByTestId("result-continue")).toBeFocused();
  await expect(row.getByTestId("result-retry")).toBeVisible();
  await shootAll(page, "r02-mic-unplugged");
  await row.getByTestId("result-continue").click();
  await expectStep(page, "latency");
  await expect(page.getByTestId("onboarding")).toHaveAttribute("data-quiet", "1");
});

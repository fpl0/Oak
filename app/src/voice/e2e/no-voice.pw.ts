// A take that hears no voice (silent.wav) leaves one calm suggestion behind — re-run the quiet check — and the
// re-run answers it (Wave 2 known gap 9). And Quiet mode with no microphone at all: no dead switch, a way to set
// one up, and the set-up wizard passes over the parts that need a voice.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { fakeMic, noHmr, patchProfile, quietNow, resetData, shootAll, watchErrors } from "./helpers.ts";
import { stack } from "./playwright.config.ts";

test.use({ launchOptions: { args: fakeMic("silent.wav") } });

test.beforeEach(async ({ request }) => {
  await resetData(request, stack.apiURL);
});

test("no voice heard: the re-check suggestion appears in Settings › Voice and the quiet check clears it", async ({
  page,
  request,
}) => {
  // The learner hummed through the first quiet check: the stored floor is their own voice.
  await patchProfile(request, stack.apiURL, {
    comfortLowMidi: 48,
    comfortHighMidi: 60,
    noiseFloorDb: -38,
    inputKind: "builtin",
    outputKind: "wired",
  });
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watchErrors(page);
  await page.goto("/settings/voice/setup?part=match");
  await page.getByTestId("match-start").click();
  await expect(page.getByText("Oak didn't hear a steady note")).toBeVisible({ timeout: 40_000 });
  await page.goto("/settings/voice");
  await expect(page.getByTestId("noise-floor")).toContainText("High for singing");
  await expect(page.getByTestId("recheck-hint")).toContainText("-38 dBFS");
  await shootAll(page, "46-settings-voice-recheck");
  await page.getByTestId("recheck-run").click();
  await expect(page).toHaveURL(/part=noise/);
  await page.getByTestId("noise-start").click();
  await expect(page.getByText("Quiet enough")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("part-continue").click();
  await expect(page.getByTestId("setup-done")).toBeVisible();
  await page.goto("/settings/voice");
  await expect(page.getByTestId("ladder-now")).toBeVisible();
  await expect(page.getByTestId("recheck-hint")).toHaveCount(0);
  await expect(page.getByTestId("noise-floor")).not.toContainText("High for singing");
  expect(problems).toEqual([]);
});

test("Quiet mode with no microphone: no dead switch, a way to set one up", async ({ page, request }) => {
  await patchProfile(request, stack.apiURL, { inputKind: "none", quiet: true });
  await noHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  const problems = watchErrors(page);
  await page.goto("/settings/voice");
  await expect(page.getByTestId("quiet-control")).toHaveAttribute("data-quiet", "1");
  await expect(page.getByTestId("quiet-line")).toHaveText(/No microphone is set up/);
  await expect(page.getByRole("switch", { name: "Quiet mode" })).toHaveCount(0);
  expect(await quietNow(request, stack.apiURL)).toBe(true);
  await shootAll(page, "47-settings-voice-no-mic");
  await page.getByTestId("quiet-setup-mic").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings\/voice\/setup\?part=mic/);
  await expect(page.getByTestId("mic-quiet")).toBeVisible();
  expect(problems).toEqual([]);
});

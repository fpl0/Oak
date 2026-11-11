// Quiet mode is a first-class path: no mic at all, the mic-only screens are passed over and recorded as skipped,
// and nothing ever opens the microphone. Then a reload mid-way resumes on the same screen.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { expectStep, fakeMic, noHmr, resetData, throughTheLoop, watchErrors } from "./helpers.ts";
import { stack } from "./playwright.config.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") } });
test.beforeEach(async ({ request }) => resetData(request, stack.apiURL));

const H = { "x-oak": "1" };

test("Quiet mode: the whole onboarding without a microphone, keyboard only", async ({ page, request }) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  const problems = watchErrors(page);
  await throughTheLoop(page, 0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("0 plays C, the note the loop calls home");
  await expect(page.getByTestId("react-continue")).toBeFocused();
  await page.keyboard.press("Enter");

  await expectStep(page, "prefs");
  await page.getByTestId("prefs-continue").focus();
  await page.keyboard.press("Enter");

  await expectStep(page, "tutor");
  await expect(page.getByTestId("tutor-ready")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("tutor-continue").focus();
  await page.keyboard.press("Enter");

  // Headphones can be set up later.
  await expectStep(page, "headphones");
  await page.getByTestId("part-skip").focus();
  await page.keyboard.press("Enter");

  // No mic: a first-class choice, and the mic never opens.
  await expectStep(page, "mic");
  await page.getByTestId("mic-quiet").focus();
  await page.keyboard.press("Enter");
  await expectStep(page, "latency");
  await expect(page.getByTestId("onboarding")).toHaveAttribute("data-quiet", "1");
  await expect(page.getByTestId("latency-sing")).toHaveCount(0);
  await expect(page.getByText("Singing timing is measured when the mic is on")).toBeVisible();
  await page.getByTestId("part-skip").focus();
  await page.keyboard.press("Enter");

  // Range and first sing were passed over.
  await expectStep(page, "sketch");
  await expect(page.locator('[data-testid="workbench"]')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("sketch-save").focus();
  await page.keyboard.press("Enter");
  await expectStep(page, "coda");
  await expect(page.getByTestId("coda-rows")).toContainText(
    "Quiet mode: singing steps become listening steps",
  );
  await expect(page.getByTestId("coda-done")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Microphone is live/ })).toHaveCount(0);

  const profile = await (await request.get(`${stack.apiURL}/api/profile`, { headers: H })).json();
  expect(profile.quiet).toBe(true);
  expect(profile.inputKind).toBe("none");
  expect(profile.onboardedAt).not.toBeNull();
  expect(problems).toEqual([]);
});

test("resumes on the same screen after a reload, and never ahead of the work done", async ({ page }) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watchErrors(page);
  await throughTheLoop(page, 3);
  // A reload on the reaction: the same screen, the same number, after one gesture to wake sound.
  await page.reload();
  await expectStep(page, "react");
  await page.getByTestId("gate-start").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("3 plays F, the restless one");
  await page.getByTestId("react-continue").click();
  await expectStep(page, "prefs");
  await page.getByTestId("flavour-pop").click();
  await page.getByTestId("prefs-continue").click();
  await expectStep(page, "tutor");

  await page.reload();
  await expectStep(page, "tutor");
  // A hand-typed URL ahead of the work done goes back to where the learner is.
  await page.goto("/onboarding/sketch");
  await expectStep(page, "tutor");
  // Today's old numbered link resumes too.
  await page.goto("/onboarding/1");
  await expectStep(page, "tutor");
  // Back goes to finished screens.
  await page.getByTestId("onb-back").click();
  await expectStep(page, "prefs");
  await page.goBack();
  await expectStep(page, "tutor");
  expect(problems).toEqual([]);
});

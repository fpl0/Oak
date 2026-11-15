// Quiet mode is a first-class path: no mic at all, the range is passed over and recorded as skipped, the first
// note becomes a listening step (never passed over silently), and nothing ever opens the microphone. Every screen
// has the same frame: the header says "Step N of 13 · name", the heading is that name, and the footer holds Back
// at its left and the primary at its right. Then a reload mid-way resumes on the same screen.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import {
  expectStep,
  fakeMic,
  noHmr,
  partContinue,
  position,
  reactContinue,
  resetData,
  shootAll,
  throughTheLoop,
  watchErrors,
} from "./helpers.ts";
import { stack } from "./playwright.config.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") } });
test.beforeEach(async ({ request }) => resetData(request, stack.apiURL));

const H = { "x-oak": "1" };

test("Quiet mode: the whole onboarding without a microphone, keyboard only", async ({ page, request }) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  const problems = watchErrors(page);
  await throughTheLoop(page, 0, { shots: true });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What you changed");
  await expect(page.getByText("0 plays C, the note the loop calls home")).toBeVisible();
  await expect(reactContinue(page)).toBeFocused();
  await page.keyboard.press("Enter");

  await expectStep(page, "prefs");
  await expect(position(page)).toHaveText("Step 5 of 13 · Your sound and your week");
  await shootAll(page, "05-prefs");
  await page.getByTestId("prefs-continue").focus();
  await page.keyboard.press("Enter");

  await expectStep(page, "tutor");
  await expect(page.getByTestId("tutor-ready")).toBeVisible({ timeout: 15_000 });
  await shootAll(page, "06-tutor");
  await page.getByTestId("tutor-continue").focus();
  await page.keyboard.press("Enter");

  // Headphones can be set up later; the rail then reads "skipped" for it.
  await expectStep(page, "headphones");
  await expect(page.getByTestId("lr-play")).toBeFocused();
  await shootAll(page, "07-headphones");
  await page.getByTestId("part-skip").focus();
  await page.keyboard.press("Enter");

  // No mic: "Set up later" is Quiet mode (said on screen), and the mic never opens.
  await expectStep(page, "mic");
  await expect(page.getByTestId("onb-back")).toHaveText("Back: Your tutor");
  await expect(page.getByText(/Set up later; you can switch the mic on/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Go back to 7. Headphones (skipped)" })).toBeVisible();
  await shootAll(page, "08-mic-ask");
  await page.getByTestId("mic-quiet").focus();
  await page.keyboard.press("Enter");
  await expectStep(page, "latency");
  await expect(page.getByTestId("onboarding")).toHaveAttribute("data-quiet", "1");
  await expect(position(page)).toHaveText("Step 10 of 13 · Timing");
  await expect(page.getByTestId("latency-sing")).toHaveCount(0);
  await expect(page.getByText("Singing timing is measured when the mic is on")).toBeVisible();
  await expect(page.getByTestId("tap-start")).toBeFocused();
  await shootAll(page, "09-latency-quiet");
  await page.getByTestId("part-skip").focus();
  await page.keyboard.press("Enter");

  // The first note, as a listening step: hear it, learn its name, go on.
  await expectStep(page, "first-sing");
  await expect(page.getByTestId("first-sing-start")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("first-sing-heard")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("That note is 1: home.")).toBeVisible();
  await expect(partContinue(page)).toBeFocused();
  await shootAll(page, "10-first-note-listening");
  await page.keyboard.press("Enter");

  await expectStep(page, "sketch");
  await expect(page.locator('[data-testid="workbench"]')).toBeVisible({ timeout: 30_000 });
  await shootAll(page, "11-sketch");
  await page.getByTestId("sketch-save").focus();
  await page.keyboard.press("Enter");
  await expectStep(page, "coda");
  await expect(page.getByTestId("coda-rows")).toContainText(
    "Quiet mode: singing steps become listening steps",
  );
  await expect(page.getByTestId("coda-rows")).toContainText("Heard: that note is home");
  await expect(page.getByTestId("coda-done")).toBeFocused();
  await shootAll(page, "12-coda");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Microphone is live/ })).toHaveCount(0);

  const profile = await (await request.get(`${stack.apiURL}/api/profile`, { headers: H })).json();
  expect(profile.quiet).toBe(true);
  expect(profile.inputKind).toBe("none");
  expect(profile.onboardedAt).not.toBeNull();
  const onb = await (await request.get(`${stack.apiURL}/api/onboarding`, { headers: H })).json();
  expect([...onb.skipped].sort()).toEqual(["headphones", "latency", "range"]);
  expect(onb.completed).toContain("first-sing");
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
  await expect(page.getByText("3 plays F, the restless one")).toBeVisible();
  await reactContinue(page).click();
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
  // Back goes to finished screens, with the step's one name; a done dot in the header does too.
  await expect(page.getByTestId("onb-back")).toHaveText("Back: Your sound and your week");
  await page.getByTestId("onb-back").click();
  await expectStep(page, "prefs");
  await page.goBack();
  await expectStep(page, "tutor");
  await page.getByRole("button", { name: "Go back to 2. Your first loop (done)" }).click();
  await expectStep(page, "loop");
  expect(problems).toEqual([]);
});

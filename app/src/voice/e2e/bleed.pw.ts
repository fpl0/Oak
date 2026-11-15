// Runtime bleed detection in the app (contracts §8.6, the Wave 3 gap): the mic hears Oak's own playback. The
// fake microphone plays back the pitch-match note as leaky speakers would (bleed.wav) and the learner never
// sings. The mic graph listens to the master bus too, so the note is a playback-only span: the trial says "the
// mic heard the playback" instead of crediting the leak, `sing.bleed` shows with its fallback — Quiet mode for
// today in one key press, or the bleed check — and the run stops without saving a result.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import {
  expectNoOverflow,
  fakeMic,
  noHmr,
  patchProfile,
  quietNow,
  resetData,
  shootAll,
  watchErrors,
} from "./helpers.ts";
import { stack } from "./playwright.config.ts";

test.use({ launchOptions: { args: fakeMic("bleed.wav") } });

/** Comfortable C3–C4: the first pitch-match note is F♯3 (54), the note bleed.wav leaks. */
const SET_UP = {
  vocalLowMidi: 45,
  vocalHighMidi: 64,
  comfortLowMidi: 48,
  comfortHighMidi: 60,
  noiseFloorDb: -62,
  outputKind: "speakers",
  inputKind: "builtin",
  quiet: false,
};

test.beforeEach(async ({ request }) => {
  await resetData(request, stack.apiURL);
  await patchProfile(request, stack.apiURL, SET_UP);
});

test("the mic hears the playback: sing.bleed with its fallback, Quiet mode for today from the keyboard", async ({
  page,
  request,
}) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watchErrors(page);
  await page.goto("/settings/voice/setup?part=match");
  await expect(page.getByTestId("match-start")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("match-status")).toHaveText(/Note 1 of 3/);
  const hint = page.getByTestId("recheck-hint");
  await expect(hint).toHaveAttribute("data-kind", "bleed", { timeout: 20_000 });
  await expect(hint).toContainText("The mic hears the playback; use wired headphones.");
  // The leak was not credited as a sung note, and the run stopped there: nothing is saved.
  const rows = page.getByTestId("match-trials").locator("li");
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText("the mic heard the playback");
  await expect(page.getByTestId("match-verdict")).toHaveCount(0);
  await expect(page.getByTestId("result-retry")).toBeVisible();
  await expect(page.getByTestId("bleed-check")).toHaveAttribute("href", /part=bleed/);
  await shootAll(page, "50-match-bleed");
  await expectNoOverflow(page);

  // The fallback, keyboard only: Quiet mode for today.
  await page.getByTestId("bleed-quiet").focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => quietNow(request, stack.apiURL)).toBe(true);
  await expect(hint).toHaveCount(0);
  await page.goto("/settings/voice");
  await expect(page.getByTestId("quiet-control")).toHaveAttribute("data-quiet", "1");
  expect(problems).toEqual([]);
});

test("the hint's other way out: the bleed check of the set-up, on its own", async ({ page }) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  const problems = watchErrors(page);
  await page.goto("/settings/voice/setup?part=match");
  await page.getByTestId("match-start").click();
  await expect(page.getByTestId("recheck-hint")).toHaveAttribute("data-kind", "bleed", { timeout: 20_000 });
  await page.getByTestId("bleed-check").click();
  await expect(page).toHaveURL(/part=bleed/);
  await expect(page.getByRole("heading", { name: "Speaker check" })).toBeVisible();
  await shootAll(page, "51-bleed-check");
  await expectNoOverflow(page);
  expect(problems).toEqual([]);
});

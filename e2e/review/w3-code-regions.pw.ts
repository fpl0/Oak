// The starter's editable region, seen and reached (ux §3.6 "change the highlighted part"). Regressions:
// - A code-modify step locks everything outside its ⟪…⟫ region, but the region was not drawn at all, and a
//   keyboard learner who Tabbed into the editor landed on a locked line where typing silently did nothing; the
//   verdict then read only "1 thing to look at." It is boxed now, Tab lands at its end, and the verdict says
//   "Nothing changed yet. Edit the highlighted part…".
// - The Make's marked spot (`⟪4⟫`) never got its box: the editor was looked up by the Workbench's id.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../support/ui.ts";
import { noHmr, resetClock, seed, shootAll, watch } from "./support.ts";

test("a code-modify region is boxed, Tab lands in it, and typing there edits it (U03.L03 S4)", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await resetClock(request);
  await seed(request, "after U03.L02");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  await page.goto("/learn/U03.L03?step=S4");
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", "S4", { timeout: 60_000 });
  const box = page.locator(".cm-content .oak-mark-target");
  await expect(box).toHaveText("4 2 1 0", { timeout: 15_000 });
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  const fb = page.getByTestId("step-feedback");
  await expect(fb).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  await expect(fb).toContainText("Nothing changed yet. Edit the highlighted part");
  // The box survives the check (the Workbench resets its marks after every check).
  await expect(box).toHaveText("4 2 1 0");
  await shootAll(page, "w3-region-boxed");
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => !!document.activeElement?.closest(".cm-editor"))) break;
  }
  for (let i = 0; i < 7; i++) await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.insertText("-3 -5 -6 -7");
  await expect(page.locator(".cm-content")).toContainText('n("-3 -5 -6 -7")');
  // The box follows the edit (it marks what may be changed).
  await expect(box).toHaveText("-3 -5 -6 -7");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(fb).toHaveAttribute("data-status", "pass", { timeout: 30_000 });
  expect(problems).toEqual([]);
});

test("the Make's marked spot gets its box until the first edit (U00.L02 S6)", async ({ page, request }) => {
  test.setTimeout(120_000);
  await resetClock(request);
  await seed(request, "onboarded");
  await noHmr(page);
  const problems = watch(page);
  await page.goto("/learn/U00.L02?step=S6");
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", "S6", { timeout: 60_000 });
  await expect(page.locator(".cm-content .oak-mark-target")).toHaveText("4", { timeout: 15_000 });
  expect(problems).toEqual([]);
});

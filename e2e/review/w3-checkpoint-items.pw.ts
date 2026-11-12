// U03.CP in the real checkpoint player at 1280×720, as a learner who skips what they are unsure of and writes the
// key signature from the keyboard. Regression: a skipped item counted as answered ("25 of 26 answered" after
// skipping every item, then "All 26 items answered"); the footer and the review now say what was skipped.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../support/ui.ts";
import { noHmr, resetClock, seed, shootAll, watch } from "./support.ts";

test.use({ viewport: { width: 1280, height: 720 } });

test("U03.CP: skips are counted as skips, and E♭ major's signature is written by keyboard", async ({
  page,
  request,
}) => {
  test.setTimeout(200_000);
  await resetClock(request);
  await seed(request, "U03.CP due");
  await noHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  const problems = watch(page);
  await page.goto("/checkpoint/U03");
  await expect(page.getByTestId("checkpoint-intro")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("start-checkpoint").click();
  const step = page.getByTestId("lesson-step");
  const progress = page.getByTestId("checkpoint-progress");
  let skipped = 0;
  for (let n = 0; n < 30; n++) {
    await expect(step).toBeVisible({ timeout: 60_000 });
    if ((await step.getAttribute("data-exercise")) === "staff-write") break;
    const id = await step.getAttribute("data-step");
    await page.getByTestId("skip-item").click();
    skipped++;
    await expect(step).not.toHaveAttribute("data-step", id ?? "", { timeout: 30_000 });
  }
  expect(skipped).toBeGreaterThan(0);
  await expect(progress).toHaveText(new RegExp(`^0 of \\d+ answered, ${skipped} skipped$`));
  // The key signature, from the keyboard only: flats, then B E A in order; Mod+Shift+Enter saves the answer.
  const surface = page.getByTestId("keysig-surface");
  await surface.focus();
  await page.keyboard.press("-");
  for (const k of ["b", "e", "a"]) await page.keyboard.press(k);
  await expect(page.getByRole("list", { name: "Your key signature" })).toHaveText("B♭E♭A♭");
  await shootAll(page, "w3-cp-keysig-written");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(page.getByText("Answer saved.")).toBeVisible({ timeout: 30_000 });
  await expect(progress).toHaveText(new RegExp(`^1 of \\d+ answered, ${skipped} skipped$`));
  await expect(page.getByTestId("next-item")).toBeEnabled();
  expect(problems).toEqual([]);
});

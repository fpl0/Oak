// Wave 5 review (review:journey): the lesson's code steps at 1440×900 and 1280×720. Defect found and fixed: a step
// whose code has long lines is meant to take the full width with the music under it (LessonPlayer `wide`), but the
// code stage overwrote that choice with the two-column layout, so the editor sat at half width beside an empty
// column and cut the line off: A1.L01's `.scope()` (the point of the step) and the editable `⟪0, 0, 0⟫` of
// `.partials([1, 0, 0, 0])` were out of sight (at 1280 the longest line now scrolls inside the editor). And, with
// no defect: U09's form steps at 1280×720 with the staff on: no sideways scroll, the step's action on screen.
import { expect, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../support/ui.ts";
import { shootAll, watch } from "./support.ts";
import { openStep, quietHmr, seedPoint } from "./w4-support.ts";
import { forgetLesson, noSideScroll } from "./w5-support.ts";

/** Every line of the editor is in view: nothing scrolls sideways inside it. */
async function codeFits(page: Page, label: string) {
  const scroller = page.locator(".cm-scroller").first();
  await expect(scroller).toBeVisible({ timeout: 30_000 });
  const over = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(over, `${label}: the code fits its editor`).toBeLessThanOrEqual(1);
}

test("A1.L01's long lines are in full view: .scope() and the editable partials", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await seedPoint(request, "side lesson offered");
  await quietHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    for (const s of ["S3", "S4", "S5"]) {
      await openStep(page, "A1.L01", s);
      // At 1440 every line fits; at 1280 the longest (S5's 110 characters) scrolls inside the editor, never the page.
      if (size.width === 1440) await codeFits(page, `A1.L01 ${s} at ${size.width}`);
      await noSideScroll(page);
    }
    await expect(page.locator(".cm-content").first()).toContainText(".partials([1, 0, 0, 0])");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStep(page, "A1.L01", "S3");
  await expect(page.locator(".cm-content").first()).toContainText(".scope()");
  await shootAll(page, "w5-layout-a1-scope");
  await openStep(page, "A1.L01", "S5");
  await shootAll(page, "w5-layout-a1-partials");
  expect(problems).toEqual([]);
});

test("U09's form steps at 1280×720 with the staff on: no sideways scroll, the action on screen", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await seedPoint(request, "U09.CP due");
  forgetLesson("U09.L02");
  await quietHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  await page.setViewportSize({ width: 1280, height: 720 });
  const problems = watch(page);
  for (const [l, s, action] of [
    ["U09.L02", "S3", "continue"],
    ["U09.L02", "S6", "save-sketch"],
    ["U09.L04", "S7", "save-sketch"],
  ] as const) {
    await openStep(page, l, s);
    // The staff panel switched on where the step offers it.
    const staff = page.getByTestId("panel-switch").getByRole("switch", { name: /Staff/ });
    if ((await staff.count()) > 0 && (await staff.getAttribute("aria-checked")) !== "true")
      await staff.click();
    await noSideScroll(page);
    const box = await page.getByTestId(action).boundingBox();
    expect(box !== null && box.y + box.height <= 720, `${l} ${s}: the step's action is on screen`).toBe(true);
  }
  await shootAll(page, "w5-layout-u09-form-720");
  expect(problems).toEqual([]);
});

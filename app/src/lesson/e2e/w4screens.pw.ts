// The Wave 4 lesson surfaces in Paper and Bark at 1440×900 and 1280×800 (wave4.md §10 item 4), on the dev fixture
// U05.L99: the gate box below 0.9 with what to fix, the unlock moment (your voicing next to Strudel's), a staged
// chord dictation half way (bass passed, a quality pad per chord open), a by-ear step in parts, the lead sheet.
// No horizontal overflow; Check and Continue stay on screen with the tutor drawer closed; reduced motion on in
// Bark. Also the chord lenses off: the lead sheet still draws (nothing depends on a label).
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { CADENCE_C, CADENCE_C_JUMPY, PARTS_BASS_ONLY } from "../dev/wave4-fixture.ts";
import { expect, setCode, stepIs, test } from "./support.ts";
import { api, noOverflow, onScreen, reseedFresh } from "./w3support.ts";
import { openFixture } from "./w4support.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

async function settle(page: Page) {
  await expect(page.getByText("Drawing…")).toHaveCount(0, { timeout: 30_000 });
}

for (const m of SCREENSHOT_MATRIX) {
  test(`Wave 4 steps in ${m.theme} at ${m.width}x${m.height}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme, ...(m.theme === "bark" ? { motion: "off" as const } : {}) });
    await openFixture(page, "S2");
    await stepIs(page, "S2");
    await setCode(page, CADENCE_C_JUMPY.replace("[0,2,4]>", "[7,9,11]>"));
    await page.getByTestId("check").click();
    await expect(page.getByTestId("gate-box")).toHaveAttribute("data-tone", "near", { timeout: 30_000 });
    await settle(page);
    await noOverflow(page);
    await onScreen(page, "check");
    await shoot(page, SHOTS, "w4-gate-near", m.theme);
    await setCode(page, CADENCE_C);
    await page.getByTestId("check").click();
    await expect(page.getByTestId("gate-strudel-code")).toBeVisible({ timeout: 30_000 });
    await settle(page);
    await page.getByTestId("gate-moment").scrollIntoViewIfNeeded();
    await noOverflow(page);
    await onScreen(page, "continue");
    await shoot(page, SHOTS, "w4-gate-moment", m.theme);

    await page.goto("/learn/U05.L99?preview=true&step=S3");
    await stepIs(page, "S3");
    const step = page.getByTestId("lesson-step");
    for (const d of ["1", "5", "6", "4"])
      await step.locator(`[data-stage="bass"] [data-degree="${d}"]`).first().click();
    await page.getByTestId("check-stage").click();
    await expect(step.locator('li[data-stage="quality"]')).toHaveAttribute("data-status", "open", {
      timeout: 30_000,
    });
    await step.locator('li[data-stage="quality"] [data-option="maj"]').click();
    await noOverflow(page);
    await shoot(page, SHOTS, "w4-staged", m.theme);

    await page.goto("/learn/U05.L99?preview=true&step=S4");
    await stepIs(page, "S4");
    await setCode(page, PARTS_BASS_ONLY);
    await page.getByTestId("check-part").click();
    await expect(page.locator('[data-part-track="bass"]')).toHaveAttribute("data-mark", "passed", {
      timeout: 30_000,
    });
    await settle(page);
    await noOverflow(page);
    await shoot(page, SHOTS, "w4-parts", m.theme);

    await page.goto("/learn/U05.L99?preview=true&step=S5");
    await stepIs(page, "S5");
    await expect(page.getByTestId("lead-sheet")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
    await noOverflow(page);
    await shoot(page, SHOTS, "w4-lead-sheet", m.theme);
  });
}

test("the chord lenses off: the lead sheet and the RN palette lay out the same", async ({ page }) => {
  test.setTimeout(120_000);
  await openFixture(page, "S5");
  const lenses = (on: boolean) =>
    api(page, "PUT", "/settings/lenses", {
      value: { degrees: true, solfege: false, noteNames: false, chordSymbols: on, romanNumerals: on },
    });
  expect((await lenses(false)).status).toBe(200);
  await page.reload();
  await stepIs(page, "S5");
  await expect(page.getByTestId("lead-sheet")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  // The step decides inside a lesson (wave4.md §4.3): its chart is shown whatever the lenses say.
  await expect(page.getByTestId("lead-sheet")).toHaveAttribute("data-chords", "C G Am F");
  await noOverflow(page);
  await page.goto("/learn/U05.L99?preview=true&step=S3");
  await stepIs(page, "S3");
  await noOverflow(page);
  expect((await lenses(true)).status).toBe(200);
});

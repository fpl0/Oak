// The Wave 4 integration surfaces on the real lessons, in Paper and Bark at 1440×900 and 1280×800 (wave4.md §10
// item 4; reduced motion on in Bark): a staged chord dictation whose bass stage missed (the verdict names the bar,
// the slot is marked), a function strip answered wrong, `voicing()` used before the gate (the verdict leads with the
// locked tool), U07.CP's tune from the page (the lead sheet above the editor, in 3/4), and U07.L09's sung step from the
// lead sheet in Quiet mode. No horizontal overflow; Check stays on screen with the tutor drawer closed.
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { expect, setCode, stepIs, test } from "./support.ts";
import { noOverflow, onScreen, reseedFresh, seed, setQuiet } from "./w3support.ts";
import { answerWidget, enterStage, lessonDef } from "./walk.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

async function settle(page: Page) {
  await expect(page.getByText("Drawing…")).toHaveCount(0, { timeout: 30_000 });
}

for (const m of SCREENSHOT_MATRIX) {
  test(`Wave 4 lessons and U07.CP in ${m.theme} at ${m.width}x${m.height}`, async ({ page }) => {
    test.setTimeout(200_000);
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme, ...(m.theme === "bark" ? { motion: "off" as const } : {}) });

    // A staged chord dictation: the bass heard wrong under bar 3.
    await seed(page, "after U06.L08");
    await setQuiet(page, false);
    const l09 = await lessonDef("U06.L09");
    await page.goto("/learn/U06.L09?step=S2");
    await stepIs(page, "S2");
    await enterStage(page, l09.steps[1]?.exercise as never, "bass", ["1", "3", "5", "4"]);
    await page.getByTestId("check-stage").click();
    await expect(page.getByTestId("stage-verdict")).toContainText("Loop bar 3", { timeout: 30_000 });
    await noOverflow(page);
    await onScreen(page, "check-stage");
    await shoot(page, SHOTS, "w4-staged-wrong", m.theme);

    // A function strip with bar 3 marked away.
    await seed(page, "after U06.L02");
    await setQuiet(page, false);
    const l03 = await lessonDef("U06.L03");
    const strip = l03.steps.find((s) => s.id === "S6")?.exercise;
    await page.goto("/learn/U06.L03?step=S6");
    await stepIs(page, "S6");
    await answerWidget(page, strip as never, { answer: { choice: ["T", "PD", "PD", "T"] } });
    await page.getByTestId("check").click();
    await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail", {
      timeout: 30_000,
    });
    await noOverflow(page);
    await onScreen(page, "check");
    await shoot(page, SHOTS, "w4-slots-wrong", m.theme);

    // voicing() before the gate: the verdict says the tool is not open yet.
    await seed(page, "U05.L07 gate open");
    await setQuiet(page, false);
    await page.goto("/learn/U05.L07");
    await expect(page.getByTestId("gate-box")).toBeVisible({ timeout: 30_000 });
    await setCode(page, 'setcpm(80/4)\n\nchords: chord("<C F G C>").voicing().s("piano")');
    await page.getByTestId("check").click();
    await expect(page.getByTestId("step-feedback-summary")).toContainText("unlocks in U05.L08", {
      timeout: 30_000,
    });
    await settle(page);
    await noOverflow(page);
    await shoot(page, SHOTS, "w4-locked-voicing", m.theme);

    // U07.L09's sung step from the lead sheet, in Quiet mode.
    await seed(page, "after U07.L08");
    await setQuiet(page, true);
    await page.goto("/learn/U07.L09?step=S4");
    await stepIs(page, "S4");
    await expect(page.getByTestId("lead-sheet")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Sing", exact: true })).toHaveCount(0);
    await noOverflow(page);
    await shoot(page, SHOTS, "w4-quiet-lead-sheet", m.theme);
    await setQuiet(page, false);

    // U07.CP: the tune from the page above the editor.
    await seed(page, "U07.CP due");
    await page.goto("/checkpoint/U07");
    await page.getByTestId("start-checkpoint").click();
    for (let i = 0; i < 20; i++) {
      await expect(page.getByTestId("lesson-step")).toBeVisible({ timeout: 30_000 });
      const id = await page.evaluate(
        () =>
          (
            globalThis as unknown as { __oakCheckpoint: { exercise(): { id: string } | null } }
          ).__oakCheckpoint.exercise()?.id,
      );
      if (id === "from-the-page") break;
      await page.getByTestId("skip-item").click();
    }
    // The page is a lead sheet: the tune with its chords C F G C above it (read from the page's chord track).
    const sheet = page.getByTestId("lead-sheet").first();
    await expect(sheet).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
    await expect(sheet).toHaveAttribute("data-chords", "C F G C");
    await expect(page.getByTestId("lesson-step").locator(".cm-editor")).toBeVisible();
    await settle(page);
    await noOverflow(page);
    await onScreen(page, "check");
    await shoot(page, SHOTS, "w4-cp-from-the-page", m.theme);
  });
}

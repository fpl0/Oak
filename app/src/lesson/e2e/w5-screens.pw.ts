// The Wave 5 lesson surfaces in Paper and Bark at 1440×900 and 1280×800 (wave5.md §10 item 4): a side lesson's
// first step (optional, what it makes better, Leave for now) and its end (back to the Toolbox), and on the dev
// fixture U11.L99 the form map over a song in A minor, the form strip, the 12-bar grid, the scale builder, the
// scope with the harmonics probe and "match this sound" after a check. No horizontal overflow; Check and Continue
// stay on screen with the tutor drawer closed; reduced motion on in Bark. Then the line lenses off: the fixture's
// song still lays out (nothing depends on a label).
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { MATCH_REFERENCE } from "../dev/wave5-fixture.ts";
import { expect, setCode, stepIs, test } from "./support.ts";
import { api, noOverflow, onScreen, reseedFresh, seed, setQuiet } from "./w3support.ts";
import { lessonDefW5 } from "./w5walk.ts";
import { walkLesson } from "./walk.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

async function fixtureStep(page: Page, id: string) {
  await page.goto(`/learn/U11.L99?preview=true&step=${id}`);
  await stepIs(page, id);
  await expect(page.getByText("Drawing…")).toHaveCount(0, { timeout: 30_000 });
}

for (const m of SCREENSHOT_MATRIX) {
  test(`Wave 5 lesson surfaces in ${m.theme} at ${m.width}x${m.height}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme, ...(m.theme === "bark" ? { motion: "off" as const } : {}) });
    // Each size starts from the gate, A1.L01 not begun.
    await seed(page, "after U03.L02");
    await setQuiet(page, false);

    await page.goto("/learn/A1.L01?from=toolbox");
    await expect(page.getByTestId("side-lesson-note")).toBeVisible({ timeout: 30_000 });
    await noOverflow(page);
    await onScreen(page, "continue");
    await shoot(page, SHOTS, "w5-side-first", m.theme);
    // Keyboard: Tab reaches "Leave for now" and its focus ring shows.
    await page.getByTestId("side-leave").focus();
    await expect(page.getByTestId("side-leave")).toBeFocused();
    await shoot(page, SHOTS, "w5-side-leave-focus", m.theme);

    // A1.L01 S3: the learner's own .scope() opens the panel beside a code-only step.
    const a1 = await lessonDefW5("A1.L01");
    await walkLesson(page, a1, { lessonId: "A1.L01", mic: false, quiet: false, until: "S3" });
    await page
      .getByTestId("lesson-step")
      .getByRole("button", { name: /^Run|Play/ })
      .first()
      .click();
    await expect(page.getByTestId("scope-panel").first()).toBeVisible({ timeout: 30_000 });
    await noOverflow(page);
    await onScreen(page, "check");
    await shoot(page, SHOTS, "w5-a1-scope", m.theme);

    await fixtureStep(page, "S1");
    await expect(page.getByTestId("form-map").first()).toBeVisible({ timeout: 30_000 });
    // The map once the code is read: four sections, verse and chorus.
    await expect(page.getByTestId("form-sections").first()).toContainText(/Chorus/i, { timeout: 30_000 });
    await noOverflow(page);
    await onScreen(page, "continue");
    await shoot(page, SHOTS, "w5-form-map", m.theme);

    for (const [id, name] of [
      ["S2", "w5-form-answer"],
      ["S3", "w5-bar-grid"],
      ["S4", "w5-scale-builder"],
    ] as const) {
      await fixtureStep(page, id);
      await noOverflow(page);
      await onScreen(page, "continue");
      await shoot(page, SHOTS, name, m.theme);
    }

    await fixtureStep(page, "S7");
    await expect(page.getByTestId("scope-panel").first()).toBeVisible({ timeout: 30_000 });
    await noOverflow(page);
    await shoot(page, SHOTS, "w5-scope-probe", m.theme);

    await fixtureStep(page, "S8");
    await setCode(page, MATCH_REFERENCE.replace(".lpf(400)", ".lpf(1600)"));
    await page.getByTestId("check").click();
    await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", /fail|error/, {
      timeout: 30_000,
    });
    await noOverflow(page);
    await onScreen(page, "check");
    await shoot(page, SHOTS, "w5-match-sound", m.theme);
  });
}

test("the line lenses off: the song and its form map still lay out", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const r = await api(page, "PUT", "/settings/lenses", {
    value: {
      degrees: true,
      solfege: true,
      noteNames: false,
      sections: false,
      bassRoles: false,
      blueNotes: false,
    },
  });
  expect(r.status, "the line lenses off").toBe(200);
  await fixtureStep(page, "S1");
  // The step's own panel decides inside a lesson (wave3.md §4.3): the form map stays open.
  await expect(page.getByTestId("form-map").first()).toBeVisible({ timeout: 30_000 });
  await noOverflow(page);
  await onScreen(page, "continue");
  await shoot(page, SHOTS, "w5-lenses-off", "paper");
});

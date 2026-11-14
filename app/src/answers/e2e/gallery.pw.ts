// The answer gallery in both themes at both reference sizes: every widget renders in every state with no console
// error and no horizontal overflow; the reduced-motion preference collapses transitions. Screenshots go to
// app/src/answers/e2e/screenshots/ (gitignored): the overview, and each widget on its own. Every page is loaded
// once; the matrix's cells change its size and theme in place.
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { FIXTURE_IDS } from "../dev/fixture-ids.ts";
import { collectErrors, openGallery, SHOTS } from "./fixtures.ts";

/** Sets the size and the theme in place (the gallery's own theme switch): no reload between the matrix's cells. */
async function setCell(page: Page, m: (typeof SCREENSHOT_MATRIX)[number]): Promise<void> {
  await page.setViewportSize({ width: m.width, height: m.height });
  await page.getByRole("radio", { name: m.theme === "paper" ? "Paper" : "Bark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", m.theme);
}

// The whole gallery is loaded once; the four cells of the matrix then change its size and theme in place
// (wave5.md §7.1: a screenshot matrix seeds and loads once).
test("every widget renders in every state, in both themes at both sizes", async ({ page }) => {
  const errors = collectErrors(page);
  await useUiPrefs(page, { theme: "paper" });
  await openGallery(page);
  await expect(page.getByRole("heading", { level: 1, name: "Answer widgets" })).toBeVisible();
  // One live copy and five states per fixture; every kind has its widget (no "not available yet").
  await expect(page.locator("section[data-fixture]")).toHaveCount(FIXTURE_IDS.length);
  for (const [id, kind] of FIXTURE_IDS) {
    const section = page.locator(`section[data-fixture="${id}"]`);
    await expect(section.locator("[data-state]")).toHaveCount(5);
    await expect(section.locator(`[data-answer="${kind}"]`)).toHaveCount(6);
  }
  await expect(page.getByText("This answer type isn't available yet")).toHaveCount(0);
  // Staff answers engrave in every state; a reveal prints the answer and draws it dashed.
  await expect(page.locator("[data-answer='staff-input'] [data-status='ready']").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.locator("section[data-fixture='staff-input'] [data-state='revealed'] [data-testid='staff-reveal']"),
  ).toHaveText("Answer: C4 E4 G4 C5");
  await expect(
    page.locator("[data-answer='click-staff'] .oak-staff[data-status='ready']").first(),
  ).toBeVisible({
    timeout: 30_000,
  });
  for (const m of SCREENSHOT_MATRIX) {
    await setCell(page, m);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${m.theme} ${m.width}x${m.height} overflows`).toBeLessThanOrEqual(0);
    await shoot(page, SHOTS, "gallery", m.theme);
  }
  expect(errors).toEqual([]);
});

// Each widget on its own, in Paper at 1440×900 and Bark at 1280×800 (the other two pairs are in the overview). The
// widgets are independent pages (`?only=<id>`, a full load each), so one page loads them one after another and
// shoots both pairs of each in place: every widget keeps its own load, its own readiness, overflow and console
// checks and its own screenshots, without a new browser context or a second load per widget. Nothing on these pages
// is interacted with or stored. Every widget's step keeps the 90-second deadline it had as a test of its own (the
// area's timeout): a step that overruns fails and names its widget.
const WIDGET_DEADLINE_MS = 90_000;
// The Wave 6 examples have their own walk (wave6-shots.pw.ts: each loaded once, both themes and both sizes in
// place), so this one stops where they begin.
const WALK_IDS = FIXTURE_IDS.slice(
  0,
  FIXTURE_IDS.findIndex(([id]) => id === "staff-rhythm"),
);
// Two halves, so that neither runs near a minute on a busy machine.
const HALF = Math.ceil(WALK_IDS.length / 2);
for (const [n, ids] of [WALK_IDS.slice(0, HALF), WALK_IDS.slice(HALF)].entries())
  test(`every widget on its own, ${n + 1} of 2: paper 1440x900 and bark 1280x800`, async ({ page }) => {
    test.setTimeout(ids.length * 15_000);
    const errors = collectErrors(page);
    await useUiPrefs(page, { theme: "paper" });
    for (const [id, kind] of ids)
      await test.step(
        id,
        async () => {
          await openGallery(page, `?only=${id}`);
          await expect(page.locator(`section[data-fixture="${id}"]`)).toBeVisible();
          if (kind === "click-staff")
            await expect(page.locator(".oak-staff[data-status='ready']").first()).toBeVisible({
              timeout: 30_000,
            });
          if (kind === "staff-input")
            await expect(page.locator("[data-answer='staff-input'] [data-status='ready']")).toHaveCount(6, {
              timeout: 30_000,
            });
          for (const m of [SCREENSHOT_MATRIX[0], SCREENSHOT_MATRIX[3]] as const) {
            await setCell(page, m);
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth - window.innerWidth,
            );
            expect(overflow, `${id} overflows at ${m.theme} ${m.width}x${m.height}`).toBeLessThanOrEqual(0);
            await shoot(page, SHOTS, id, m.theme);
          }
          expect(errors, `${id}: console errors`).toEqual([]);
        },
        { timeout: WIDGET_DEADLINE_MS },
      );
  });

test("reduced motion: nothing animates longer than 120 ms", async ({ page }) => {
  await useUiPrefs(page, { theme: "paper", motion: "on" });
  await openGallery(page, "?only=choice");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  const longest = await page.evaluate(() => {
    let max = 0;
    for (const el of document.querySelectorAll("[data-answer] *")) {
      const cs = getComputedStyle(el);
      for (const d of [...cs.transitionDuration.split(","), ...cs.animationDuration.split(",")]) {
        const s = d.trim();
        const ms = s.endsWith("ms") ? Number.parseFloat(s) : Number.parseFloat(s) * 1000;
        if (Number.isFinite(ms)) max = Math.max(max, ms);
      }
    }
    return max;
  });
  expect(longest).toBeLessThanOrEqual(120);
});

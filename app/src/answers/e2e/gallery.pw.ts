// The answer gallery in both themes at both reference sizes: every widget renders in every state with no console
// error and no horizontal overflow; the reduced-motion preference collapses transitions. Screenshots go to
// app/src/answers/e2e/screenshots/ (gitignored): the overview, and each widget on its own.
import { expect, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { FIXTURE_IDS } from "../dev/fixture-ids.ts";
import { collectErrors, openGallery, SHOTS } from "./fixtures.ts";

for (const m of SCREENSHOT_MATRIX) {
  test(`every widget renders in every state: ${m.theme} ${m.width}x${m.height}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme });
    await openGallery(page);
    await expect(page.getByRole("heading", { level: 1, name: "Answer widgets" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", m.theme);
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
      page.locator(
        "section[data-fixture='staff-input'] [data-state='revealed'] [data-testid='staff-reveal']",
      ),
    ).toHaveText("Answer: C4 E4 G4 C5");
    await expect(
      page.locator("[data-answer='click-staff'] .oak-staff[data-status='ready']").first(),
    ).toBeVisible({
      timeout: 30_000,
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shoot(page, SHOTS, "gallery", m.theme);
    expect(errors).toEqual([]);
  });
}

// Each widget on its own, in Paper at 1440×900 and Bark at 1280×800 (the other two pairs are in the overview). The
// widgets are independent pages (`?only=<id>`, a full load each), so one page per pair loads them one after another:
// every widget keeps its own load, its own readiness, overflow and console checks and its own screenshot, without a
// new browser context per widget. Nothing on these pages is interacted with or stored. Every widget's step keeps the
// 90-second deadline it had as a test of its own (the area's timeout): a step that overruns fails and names its widget.
const WIDGET_DEADLINE_MS = 90_000;
for (const m of [SCREENSHOT_MATRIX[0], SCREENSHOT_MATRIX[3]] as const)
  test(`every widget on its own: ${m.theme} ${m.width}x${m.height}`, async ({ page }) => {
    test.setTimeout(FIXTURE_IDS.length * 15_000);
    const errors = collectErrors(page);
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme });
    for (const [id, kind] of FIXTURE_IDS)
      await test.step(
        `${id}: ${m.theme} ${m.width}x${m.height}`,
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
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          expect(overflow, `${id} overflows`).toBeLessThanOrEqual(0);
          await shoot(page, SHOTS, id, m.theme);
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

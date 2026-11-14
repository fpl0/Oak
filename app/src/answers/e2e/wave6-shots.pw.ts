// Screenshots of the Wave 6 answer widgets in both themes and at both sizes (wave6.md §10 item 4): each example is
// loaded once, then the size and the theme change in place. Every shot is checked for horizontal overflow.
import { expect, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { FIXTURE_IDS } from "../dev/fixture-ids.ts";
import { collectErrors, openGallery, SHOTS } from "./fixtures.ts";

const GROUPS: Record<string, readonly string[]> = {
  "rhythm II": [
    "staff-rhythm",
    "staff-triplets",
    "staff-68",
    "staff-rhythm-line",
    "staff-swing",
    "grid-68",
    "grid-24",
    "tap-push",
    "tap-triplets",
    "tap-68",
  ],
  "sevenths and numerals": [
    "quality-sevenths",
    "text-chord-seventh",
    "keyboard-seventh",
    "guide-tones",
    "rn-sevenths",
    "rn-applied",
    "rn-colours",
    "rn-pivot",
    "rn-mixolydian",
  ],
  "modes, key changes and the form map": [
    "choice-mode",
    "scale-from",
    "scale-from-keys",
    "degree-chromatic",
    "degree-chromatic-seq",
    "key-change-bars",
    "key-change-choice",
    "choice-pivot",
    "form-map",
    "text-interval-compound",
  ],
};

for (const [group, ids] of Object.entries(GROUPS)) {
  test(`Wave 6 widgets, ${group}: both themes, both sizes, no overflow`, async ({ page }) => {
    const errors = collectErrors(page);
    await useUiPrefs(page, { theme: "paper" });
    for (const id of ids) {
      await openGallery(page, `?only=${id}&state=wrong,revealed`);
      if (id.startsWith("staff-"))
        await expect(page.locator(`[data-live="${id}"] [data-status='ready']`)).toBeVisible();
      for (const m of SCREENSHOT_MATRIX) {
        await page.setViewportSize({ width: m.width, height: m.height });
        // The gallery's own theme switch: no reload.
        await page.getByRole("radio", { name: m.theme === "paper" ? "Paper" : "Bark" }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", m.theme);
        const overflow = await page.evaluate(() => {
          const main = document.getElementById("main");
          return {
            page: document.documentElement.scrollWidth - window.innerWidth,
            main: main ? main.scrollWidth - main.clientWidth : 0,
          };
        });
        expect(`${id} ${m.theme} ${m.width}: ${overflow.page} ${overflow.main}`).toBe(
          `${id} ${m.theme} ${m.width}: 0 0`,
        );
        await shoot(page, SHOTS, `w6-${id}`, m.theme);
      }
    }
    expect(errors).toEqual([]);
  });
}

test("every Wave 6 example is in one of the walks above", () => {
  const first = FIXTURE_IDS.findIndex(([id]) => id === "staff-rhythm");
  const walked = new Set(Object.values(GROUPS).flat());
  expect(
    FIXTURE_IDS.slice(first)
      .map(([id]) => id)
      .filter((id) => !walked.has(id)),
  ).toEqual([]);
});

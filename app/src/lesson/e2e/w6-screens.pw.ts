// The Wave 6 lesson surfaces in Paper and Bark at 1440×900 and 1280×800 (wave6.md §10 item 4), on the six exemplars'
// own steps: sevenths in the chord band and on the keyboard, the four-part ear step, a push on the roll, the tap pad,
// a mode beside its parent on the staff, the scale builder, an applied dominant in the chord band and on the numeral
// palette, the sung chromatic line, a borrowed chord's numeral, a key plan on the roll and the song with its form.
// One seed point and one page per theme: each step is loaded once and the size changes in place (wave5.md §7.1). No
// horizontal overflow at either size; the step's primary action stays on screen with the tutor drawer closed;
// reduced motion on in Bark.
import { fileURLToPath } from "node:url";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { expect, stepIs, test } from "./support.ts";
import { noOverflow, onScreen, reseedFresh, seed, setQuiet } from "./w3support.ts";
import { PREVIEW_POINT } from "./w6walk.ts";

test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

/** [lesson, step, the control that must stay on screen, the shot's name]. */
const STEPS = [
  ["U12.L01", "S3", "continue", "w6-u12-sevenths-band"],
  ["U12.L01", "S4", "check", "w6-u12-keyboard-chord"],
  ["U12.L01", "S6", "check", "w6-u12-ear-parts"],
  ["U13.L01", "S2", "continue", "w6-u13-tap"],
  ["U13.L01", "S5", "check", "w6-u13-push"],
  ["U14.L01", "S3", "continue", "w6-u14-mode-staff"],
  ["U14.L01", "S4", "check", "w6-u14-scale-builder"],
  ["U15.L02", "S5", "check", "w6-u15-applied-band"],
  ["U15.L02", "S6", "check", "w6-u15-numerals"],
  ["U15.L02", "S7", "continue", "w6-u15-sing"],
  ["U16.L01", "S5", "check", "w6-u16-borrowed-numerals"],
  ["U17.L02", "S4", "check", "w6-u17-key-plan"],
  ["U17.L02", "S7", "save-sketch", "w6-u17-make-form"],
  // Integration: a drawn echo on the tap pad, and drawn "which bar" trials on their own bar timeline.
  ["U13.L05", "S2", "continue", "w6-u13-echo"],
  ["U13.L05", "S6", "check", "w6-u13-read-in-code"],
  ["U15.L06", "S2", "check", "w6-u15-drawn-bars"],
  ["U17.L03", "S4", "check", "w6-u17-drawn-modulation"],
] as const;

const THEMES = ["paper", "bark"] as const;
const SIZES = SCREENSHOT_MATRIX.filter((m) => m.theme === "paper").map((m) => ({
  width: m.width,
  height: m.height,
}));

// One test per theme (a theme is set before the first paint; the sizes change in place): each seeds the same point,
// which the second restores from the snapshot.
for (const theme of THEMES) {
  test(`Wave 6 lesson surfaces in ${theme} at both sizes`, async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, PREVIEW_POINT);
    await setQuiet(page, false);
    await useUiPrefs(page, { theme, ...(theme === "bark" ? { motion: "off" as const } : {}) });
    for (const [lesson, step, control, name] of STEPS) {
      await page.setViewportSize(SIZES[0] as { width: number; height: number });
      await page.goto(`/learn/${lesson}?preview=true&step=${step}`);
      await stepIs(page, step);
      // The music is read and drawn before the picture is taken (the grader loads on the first step).
      await expect(page.getByText(/Drawing…|Reading the code/)).toHaveCount(0, { timeout: 30_000 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      for (const size of SIZES) {
        await page.setViewportSize(size);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await noOverflow(page);
        await onScreen(page, control);
        await shoot(page, SHOTS, name, theme);
      }
    }
  });
}

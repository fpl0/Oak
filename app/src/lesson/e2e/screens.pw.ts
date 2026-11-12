// The player's screens in Paper and Bark at 1440×900 and 1280×800 (docs/design/wave2.md §8): a graded step
// with feedback, a quiz, the Make, the complete screen, a locked lesson, the checkpoint intro. Nothing overflows
// sideways and at 1280×800 the step's primary actions are on screen without scrolling. Reduced motion: nothing
// in the player moves for longer than 120 ms.
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { expect, setCode, stepIs, test } from "./support.ts";

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const mel = (d: string) => `setcpm(90/4)\n\nmel: n("${d}").scale("C4:major").s("piano")`;

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
async function onScreen(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  const vp = page.viewportSize();
  expect(box).not.toBeNull();
  if (box && vp) {
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  }
}

for (const m of SCREENSHOT_MATRIX) {
  test(`the player in ${m.theme} at ${m.width}x${m.height}`, async ({ page }) => {
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme });

    // A graded modify after a failed check, with a hint.
    await page.goto("/learn/U00.L00?step=S5");
    await stepIs(page, "S5");
    await setCode(page, mel("1 3 5 3"));
    await page.getByTestId("check").click();
    await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
    await page.getByTestId("hint").click();
    await expect(page.getByTestId("hint-texts")).toBeVisible();
    await expect(page.getByTestId("workbench")).toHaveAttribute("data-analysis", "ready");
    await expect(page.getByTestId("workbench").getByTestId("roll-canvas")).toBeVisible();
    await noOverflow(page);
    await onScreen(page, "check");
    await onScreen(page, "continue");
    await shoot(page, SHOTS, "modify", m.theme);

    // The quiz (four parts, no Workbench).
    await page.goto("/learn/U00.L00?step=S6");
    await stepIs(page, "S6");
    await expect(page.locator(".oak-lesson-prose svg").first()).toBeVisible();
    await expect(page.getByText("Drawing…")).toHaveCount(0, { timeout: 30_000 });
    await noOverflow(page);
    await onScreen(page, "check");
    await shoot(page, SHOTS, "quiz", m.theme);

    // An ear step with a generated stimulus.
    await page.goto("/learn/U00.L00?step=S7");
    await stepIs(page, "S7");
    await noOverflow(page);
    await shoot(page, SHOTS, "ear", m.theme);

    // The Make over the Band, after a Run.
    await page.goto("/learn/U00.L00?step=S12");
    await stepIs(page, "S12");
    await page.getByTestId("play-toggle").click();
    await expect(page.locator('[data-rule="degrees"]')).toHaveAttribute("data-ok", "1", { timeout: 20_000 });
    await page.getByTestId("play-toggle").click();
    await noOverflow(page);
    await onScreen(page, "save-sketch");
    await shoot(page, SHOTS, "make", m.theme);
    await page.getByTestId("save-sketch").click();
    await expect(page.getByTestId("lesson-complete")).toBeVisible();
    await shoot(page, SHOTS, "complete", m.theme);

    // A lesson that is not open yet, and the checkpoint before its lessons are done.
    await page.goto("/learn/U03.L09");
    await expect(
      page.getByText("This lesson isn't open yet").or(page.getByText("planned but not written yet")),
    ).toBeVisible();
    await shoot(page, SHOTS, "locked", m.theme);
    await page.goto("/checkpoint/U01");
    await expect(page.getByTestId("checkpoint-intro")).toBeVisible();
    await noOverflow(page);
    await shoot(page, SHOTS, "checkpoint-intro", m.theme);
  });
}

test("reduced motion: nothing in the player moves for longer than 120 ms", async ({ page }) => {
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/learn/U00.L00?step=S4");
  await stepIs(page, "S4");
  const slow = await page.evaluate(() => {
    const out: string[] = [];
    const ms = (v: string) =>
      Math.max(
        ...v
          .split(",")
          .map((x) => (x.trim().endsWith("ms") ? Number.parseFloat(x) : Number.parseFloat(x) * 1000)),
      );
    for (const el of document.querySelectorAll("[data-testid=lesson-step] *")) {
      const cs = getComputedStyle(el);
      const moves =
        /transform|all|translate|scale/.test(cs.transitionProperty) && ms(cs.transitionDuration) > 120;
      const anim = cs.animationName !== "none" && ms(cs.animationDuration) > 120;
      if (moves || anim) out.push(`${el.tagName}.${(el as HTMLElement).className}`.slice(0, 80));
    }
    return out;
  });
  expect(slow).toEqual([]);
});

test("keyboard only: a quiz answered and continued without the pointer", async ({ page }) => {
  await page.goto("/learn/U00.L00?step=S4");
  await stepIs(page, "S4");
  // Tab into the first question's choices and pick with the digit keys.
  await page.locator('[data-question="1"] [data-option="n0"]').focus();
  await page.keyboard.press("1");
  await page.locator('[data-question="2"] input').focus();
  await page.keyboard.type("4");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass");
  await page.getByTestId("step-title").focus();
  await page.keyboard.press("Enter");
  await stepIs(page, "S5");
  // Alt+← revisits the previous step, Alt+→ returns.
  await page.getByTestId("step-title").focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await stepIs(page, "S4");
  await page.keyboard.press("Alt+ArrowRight");
  await stepIs(page, "S5");
  // The step title has focus after each move (a visible focus ring lands somewhere sensible).
  await expect(page.getByTestId("step-title")).toBeFocused();
});

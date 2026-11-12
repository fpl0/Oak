// Wave 3 review, notation: writing a key signature on the staff (U03.L06 S4, D major), by mouse and by keyboard,
// and the ways to get stuck. Regressions:
// - The staff was drawn at abcjs's default scale (lines 8 px apart): hitting a line by mouse was fiddly. It is
//   drawn half as large again.
// - The second sharp was drawn on top of the first (1.15 spaces apart); they sit side by side now.
// - A circle of fifths beside the staff filled the whole signature in from one click on the asked key — it
//   answered the question (and U03.CP's E♭ item) for the learner. It is gone from this widget.
// - A pass read "That's it. Somewhere in the piece: Exactly right."; a pass says "That's it." once.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../support/ui.ts";
import { noHmr, resetClock, seed, shootAll, watch } from "./support.ts";

test("U03.L06 S4: D major's sharps by mouse and by keyboard, wrong ways first", async ({ page, request }) => {
  test.setTimeout(200_000);
  await resetClock(request);
  await seed(request, "after U03.L05");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  await page.goto("/learn/U03.L06?step=S4");
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", "S4", { timeout: 60_000 });
  const surface = page.getByTestId("keysig-surface");
  await expect(surface).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: /circle of fifths/i })).toHaveCount(0);
  await expect(page.getByText("Or pick the key")).toHaveCount(0);
  await expect(page.getByText(/· graded/i)).toBeVisible();
  await shootAll(page, "w3-keysig-empty");

  // The staff is large enough to aim at: its five lines span at least 44 px (11 px a space).
  const staffBox = await page.locator(".oak-si-host g.abcjs-staff").first().boundingBox();
  expect(staffBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  // Mouse: the top line of the treble staff is F — a click there adds F♯.
  if (!staffBox) throw new Error("no staff");
  await page.mouse.click(staffBox.x + staffBox.width * 0.5, staffBox.y);
  const placed = page.getByRole("list", { name: "Your key signature" });
  await expect(placed).toHaveText("F♯");
  // The third space is C: C♯ next, beside F♯ — never on top of it.
  await page.mouse.click(staffBox.x + staffBox.width * 0.5, staffBox.y + (staffBox.height / 4) * 1.5);
  await expect(placed).toHaveText("F♯C♯");
  const glyphs = page.locator('[data-status="ready"] svg.pointer-events-none path.stroke-text');
  await expect(glyphs).toHaveCount(2);
  const [a, b] = [await glyphs.nth(0).boundingBox(), await glyphs.nth(1).boundingBox()];
  expect((b?.x ?? 0) - ((a?.x ?? 0) + (a?.width ?? 0))).toBeGreaterThanOrEqual(0);
  await shootAll(page, "w3-keysig-mouse");

  // Keyboard only: the wrong way round, then flats, then Backspace back to the right answer.
  await surface.focus();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(placed).toHaveText("Nothing placed yet.");
  await page.keyboard.press("c");
  await page.keyboard.press("f");
  await page.keyboard.press("Enter");
  const fb = page.getByTestId("step-feedback");
  await expect(fb).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  await expect(fb).toBeInViewport();
  await shootAll(page, "w3-keysig-reversed");
  const reversed = (await fb.textContent()) ?? "";
  expect(reversed).not.toContain("Somewhere in the piece");
  expect(reversed).not.toMatch(/note differs/);
  expect(reversed).toContain("order");
  await surface.focus();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("-");
  await page.keyboard.press("b");
  await page.keyboard.press("e");
  await expect(placed).toHaveText("B♭E♭");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("#");
  await page.keyboard.press("f");
  await page.keyboard.press("c");
  await expect(placed).toHaveText("F♯C♯");
  await page.keyboard.press("Enter");
  await expect(fb).toHaveAttribute("data-status", "pass", { timeout: 30_000 });
  await expect(fb).toHaveText("That's it.");
  await expect(page.getByTestId("keysig-reading")).toContainText("D major");
  await shootAll(page, "w3-keysig-pass");
  await expect(page.getByTestId("continue")).toBeEnabled();
  expect(problems).toEqual([]);
});

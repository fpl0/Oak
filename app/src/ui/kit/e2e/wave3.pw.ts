// Wave 3 kit changes: a ghost button reads as a button (a tonal fill, not bare text) in both themes while an
// icon-only button stays quiet; the page widths come from shared tokens; the shortcut sheet lists the keys
// components handle themselves, the tutor composer's included, and closes with Esc.
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

for (const theme of ["paper", "bark"] as const)
  test(`ghost buttons have a visible fill in ${theme}; icon buttons stay transparent`, async ({ page }) => {
    await useUiPrefs(page, { theme, motion: "off" });
    await page.goto("/dev/kit");
    await expect(page.getByRole("heading", { level: 1, name: "UI kit" })).toBeVisible();
    const skip = page.getByRole("button", { name: "Skip", exact: true });
    await expect(skip).toBeVisible();
    expect(await skip.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    // The text is the full text colour, not the muted one.
    const [text, ghostText] = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--oak-text)";
      document.body.append(probe);
      const t = getComputedStyle(probe).color;
      probe.remove();
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Skip");
      return [t, b ? getComputedStyle(b).color : ""];
    });
    expect(ghostText).toBe(text);
    // The shell's icon buttons (search, tutor) are not tinted.
    const icon = page.getByRole("button", { name: /Search|Command palette/ }).first();
    if (await icon.count())
      expect(await icon.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    await skip.scrollIntoViewIfNeeded();
    await skip.focus();
    await shoot(page, SHOTS, "w3-ghost", theme);
  });

test("pages sit on the shared width tokens", async ({ page }) => {
  await useUiPrefs(page, { theme: "paper" });
  await page.goto("/album");
  await expect(page.getByTestId("album-title")).toBeVisible({ timeout: 20_000 });
  const widths = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    const main = document.querySelector("#main .mx-auto, main .mx-auto") as HTMLElement | null;
    return {
      wide: css.getPropertyValue("--oak-page-wide").trim(),
      focus: css.getPropertyValue("--oak-page-focus").trim(),
      narrow: css.getPropertyValue("--oak-page-narrow").trim(),
      page: main ? getComputedStyle(main).maxWidth : null,
    };
  });
  expect(widths).toEqual({ wide: "72rem", focus: "60rem", narrow: "48rem", page: "1152px" });
});

test("the shortcut sheet lists the keys components handle, the tutor composer's included", async ({
  page,
}) => {
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/settings/about");
  await expect(page.getByTestId("tutor-status").or(page.locator("#main"))).toBeAttached();
  await page.locator("#main").focus();
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  for (const id of ["editor", "workbench", "answers", "staff-input", "keys-intervals", "tutor"])
    await expect(sheet.locator(`[data-sheet-section="${id}"]`)).toBeAttached();
  // Wave 3: the lens bar and panels, staff input, key signatures, the circle and intervals.
  const workbench = sheet.locator('[data-sheet-section="workbench"]');
  for (const text of [
    "Degree labels",
    "Solfège labels",
    "Note-name labels",
    "Key-signature panel",
    "Circle of fifths",
  ])
    await expect(workbench).toContainText(new RegExp(text, "i"));
  await expect(sheet.locator('[data-sheet-section="staff-input"]')).toContainText("Dot the length");
  await expect(sheet.locator('[data-sheet-section="keys-intervals"]')).toContainText(
    "Interval: pick the number",
  );
  const composer = sheet.locator('[data-sheet-section="tutor"]');
  await expect(composer).toContainText("Tutor composer");
  await expect(composer).toContainText("Recall your last message");
  await expect(sheet.locator('[data-sheet-section="editor"]')).toContainText("Undo (an applied card too)");
  // Global keys come from the live keymap: Mod+I, now listed once.
  await expect(sheet.getByText("Ask Claude (focus the tutor; again to close it)")).toHaveCount(1);
  await shoot(page, SHOTS, "w3-shortcuts", "paper");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  // Both themes, both sizes: the sheet scrolls inside itself; the new sections read at the end of it.
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, m.theme);
    await page.locator("#main").focus();
    await page.keyboard.press("?");
    await expect(sheet).toBeVisible();
    await sheet.locator('[data-sheet-section="keys-intervals"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/w3-shortcuts-wave3-${m.theme}-${m.width}x${m.height}.png` });
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  }
});

// Wave 4 review of the Toolbox's harmony surfaces from a real seeded learner ("after U05.L08": the voicing gate
// passed by typed code, `chord()` and `voicing()` just unlocked): the voicing() unlock moment puts a hand voicing
// beside Strudel's and both name the same chords (each in its own inversion); the harmony tool pages open their
// panels. Both themes at both reference sizes: no horizontal overflow, AA text, keyboard-only (Escape closes the
// moment, focus returns).
import { expect, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { contrastIssues, expectNoHorizontalOverflow, SHOTS, seed } from "./support.ts";

const WB = "[data-testid=workbench]";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await seed(page, "after U05.L08");
  await page.close();
});

test("the voicing() moment: hand and Strudel name the same chords, in both themes, by keyboard", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const m of SCREENSHOT_MATRIX) {
    await useUiPrefs(page, { theme: m.theme, motion: "off" });
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.goto("/toolbox/tb.voicing");
    await expect(page.getByTestId("tool-example").locator(`${WB}[data-analysis=ready]`)).toBeVisible({
      timeout: 60_000,
    });
    const replay = page.getByRole("button", { name: "Replay the unlock moment" });
    await replay.focus();
    await page.keyboard.press("Enter");
    const compare = page.getByTestId("voicing-compare");
    await expect(compare).toBeVisible();
    const sides = [compare.getByTestId("voicing-side-vchand"), compare.getByTestId("voicing-side-vcstrudel")];
    const named: string[][] = [];
    for (const side of sides) {
      await expect(side.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
      named.push(
        await side
          .locator("[data-testid=chord-band] li[data-symbol]")
          .evaluateAll((els) => els.map((e) => e.getAttribute("data-symbol") ?? "")),
      );
    }
    // The same chords; the inversions are each voicing's own (the seeded hand voicing leads its voices, so its
    // G is G/B; Strudel's default voicing puts the 3rd of C lowest: C/E).
    const chordsOnly = (xs: string[] | undefined) => (xs ?? []).map((x) => x.split("/")[0]);
    expect(named[0]?.length).toBeGreaterThan(1);
    expect(chordsOnly(named[1])).toEqual(chordsOnly(named[0]));
    await expectNoHorizontalOverflow(page);
    // The moment cross-fades in (reduced motion): AA once it has landed.
    await expect
      .poll(() => contrastIssues(page), { message: `${m.theme} ${m.width}`, timeout: 5_000 })
      .toEqual([]);
    await shoot(page, SHOTS, "w4-voicing-moment", m.theme);
    await page.keyboard.press("Escape");
    await expect(compare).toHaveCount(0);
    await expect(replay).toBeFocused();
  }
  expect(errors).toEqual([]);
});

const TOOLS = [
  "tb.feature.rn",
  "tb.lens.function",
  "tb.lens.chord-tones",
  "tb.lens.range",
  "tb.feature.leadsheet",
];

test("harmony tool pages: their example opens with its panel, AA text in both themes", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, "C2 open");
  for (const m of SCREENSHOT_MATRIX) {
    await useUiPrefs(page, { theme: m.theme, motion: "off" });
    await page.setViewportSize({ width: m.width, height: m.height });
    for (const tool of TOOLS) {
      await page.goto(`/toolbox/${tool}`);
      await expect(page.locator("main h1")).toBeVisible({ timeout: 30_000 });
      // Every harmony tool has a live example: its Workbench has read the code before anything is judged.
      await expect(page.getByTestId("tool-example").locator(`${WB}[data-analysis=ready]`)).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText("Reading the code")).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      expect(await contrastIssues(page), `${tool} ${m.theme} ${m.width}`).toEqual([]);
      if (tool === "tb.feature.rn" || tool === "tb.feature.leadsheet")
        await shoot(page, SHOTS, `w4-tool-${tool.split(".").pop()}`, m.theme);
    }
  }
});

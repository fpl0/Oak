// Wave 3 on the workbench's own page (port 5193, every lens unlocked through the playground's lens source):
// the lens bar and its keys, degree lines under the staff read in each bar's key (a patterned .scale()), the
// grand staff, the key-signature panel and the circle of fifths (preview in another key without touching the
// code; "Use" is one explicit edit of the .scale() argument), all by keyboard. Screenshots of the panels.
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const WB = "[data-testid=workbench]";
const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

async function open(page: Page, query: string): Promise<void> {
  // Other engineers' edits reload the page through Vite's HMR socket mid-test: block it.
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(`/${query}`);
  await page.waitForSelector(`${WB}[data-analysis=ready]`, { timeout: 45_000 });
  await expect(page.locator("[data-testid=staff-view]")).toHaveAttribute("data-status", "ready");
}

/**
 * The lyric lines under the staff, one string per line (abcjs draws a note's lines as the tspans of one text
 * element: line i is every note's i-th tspan, in document order; staves are kept apart by their system line).
 */
function lyrics(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const rows = new Map<string, string[]>();
    for (const t of document.querySelectorAll(".oak-staff-host .abcjs-lyric")) {
      const staff = [...t.classList].filter((c) => /^abcjs-[lv]\d+$/.test(c)).join(" ");
      const spans = [...t.querySelectorAll("tspan")].map((s) => (s.textContent ?? "").trim());
      const lines = spans.length ? spans : [(t.textContent ?? "").trim()];
      lines.forEach((text, i) => {
        if (!text) return;
        const key = `${staff}:${i}`;
        rows.set(key, [...(rows.get(key) ?? []), text]);
      });
    }
    return [...rows.values()].map((r) => r.join(" "));
  });
}

test("lenses: the bar's keys switch labels, the staff's lines follow each bar's key", async ({ page }) => {
  await open(page, "?example=patterned-keys&lenses=1");
  const wb = page.locator(WB);
  await expect(wb).toHaveAttribute("data-labels", "lenses");
  await expect(wb).toHaveAttribute("data-lenses", "degree");
  await expect(page.getByTestId("lens-switch")).toBeVisible();
  await expect(page.getByTestId("staff-key")).toHaveText("C major → G major");
  await expect(page.getByTestId("staff-clef")).toHaveText("Treble clef");
  await expect(page.getByTestId("staff-view")).toHaveAttribute("data-annotations", "degree");
  await expect.poll(() => lyrics(page)).toEqual(["1 3 5 7 1 1 3 5 7 1"]);
  // Keyboard: focus the workbench (not the editor), S adds syllables, D drops degrees, Shift+N adds names.
  await page.getByTestId("transport").click({ position: { x: 300, y: 5 } });
  await page.keyboard.press("s");
  await expect(wb).toHaveAttribute("data-lenses", "degree solfege");
  await expect(page.getByTestId("lens-solfege")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => lyrics(page)).toEqual(["1 3 5 7 1 1 3 5 7 1", "do mi sol ti do do mi sol ti do"]);
  // Degree colours on the heads: bar 1's C4 is degree 1, bar 2's F♯5 is degree 7.
  await expect(page.locator(".oak-staff-host [data-oak-deg]")).toHaveCount(10);
  await expect(page.locator(".oak-staff-host [data-oak-deg='7']")).toHaveCount(2);
  await expect(page.locator(".oak-staff-host [data-oak-deg='1']")).toHaveCount(4);
  await page.keyboard.press("d");
  await expect(page.locator(".oak-staff-host [data-oak-deg]")).toHaveCount(0);
  await page.keyboard.press("Shift+N");
  await expect(wb).toHaveAttribute("data-lenses", "solfege noteName");
  await expect
    .poll(() => lyrics(page))
    .toEqual(["do mi sol ti do do mi sol ti do", "C4 E4 G4 B4 C5 G4 B4 D5 F♯5 G5"]);
  // The staff notes say their degree in their own bar's key.
  await expect(
    page.locator('.oak-staff-host [data-oak-events^="mel|2|"][data-oak-degree]').first(),
  ).toHaveAttribute("aria-label", /G4, bar 2, beat 1, degree 1, do/);
  // Notes table: degree and syllable columns.
  await page.getByRole("button", { name: "Notes table" }).click();
  const table = page.getByTestId("notes-table");
  await expect(table.locator("thead")).toContainText("Degree");
  await expect(table.locator("tbody tr").nth(8)).toContainText("F♯5");
  await expect(table.locator("tbody tr").nth(8)).toContainText("7");
  await expect(table.locator("tbody tr").nth(8)).toContainText("ti");
});

test("a melody over a bass is a grand staff with lines under both staves", async ({ page }) => {
  await open(page, "?example=grand&lenses=1");
  await expect(page.getByTestId("staff-clef")).toHaveText("Grand staff");
  await expect(page.getByTestId("staff-key")).toHaveText("D major · 2♯");
  await expect.poll(async () => (await lyrics(page)).sort()).toEqual(["1 4", "5 3 1 3 4 6 5"].sort());
});

test("the key panel and the circle: hear another key without an edit, then use it as one edit", async ({
  page,
}) => {
  await open(page, "?example=degrees-d&lenses=1");
  const code = () => page.locator(".cm-content").textContent();
  const before = await code();
  expect(before).toContain('.scale("D4:major")');
  await page.getByTestId("transport").click({ position: { x: 300, y: 5 } });
  await page.keyboard.press("Shift+K");
  const panel = page.getByTestId("key-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("key-panel-name")).toHaveText("D major");
  await expect(page.getByTestId("key-panel-signature")).toContainText("2 sharps: F♯ C♯");
  const scale = page.getByTestId("key-panel-scale").locator("li");
  await expect(scale).toHaveCount(7);
  await expect(scale.nth(2)).toContainText("3F♯");
  await expect(scale.nth(6)).toContainText("7C♯");
  await expect(page.locator("[data-testid=keysig-staff][data-ready='1'] svg")).toBeVisible();
  await expect(panel.getByText("Relative")).toBeVisible();
  await expect(panel.getByRole("button", { name: /A major/ })).toBeVisible();

  await page.getByTestId("panel-switch").getByRole("button", { name: "Circle" }).click();
  const circle = page.getByTestId("circle");
  await expect(circle.locator("[data-here='1']")).toHaveAttribute("data-key", "D major");
  // Keyboard round the ring: focus the ring, one step anticlockwise is G, Enter previews it.
  await circle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(circle.locator("[data-focus='1']")).toHaveAttribute("data-key", "G major");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("circle-status")).toContainText("Hearing your code in G major", {
    timeout: 15_000,
  });
  await expect(circle.locator("[data-on='1']")).toHaveAttribute("data-key", "G major");
  // The preview never touched the code.
  expect(await code()).toBe(before);
  await page.screenshot({ path: `${SHOTS}/lens-panels-preview.png`, fullPage: true });
  await page.getByTestId("circle-use").click();
  await expect.poll(code).toContain('.scale("G4:major")');
  expect((await code())?.replace('.scale("G4:major")', '.scale("D4:major")')).toBe(before);
  // The edit is the piece's key now: the panel and the ring follow it.
  await expect(page.getByTestId("key-panel-name")).toHaveText("G major", { timeout: 10_000 });
  await expect(circle.locator("[data-here='1']")).toHaveAttribute("data-key", "G major");
  // One undo puts it back.
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(code).toBe(before);
  await page.locator(WB).locator("[data-testid=play-toggle]").click();
  await page.locator("[data-testid=play-toggle]").click();
});

test("code without a key cannot move key and the circle says why; no dead button", async ({ page }) => {
  await open(page, "?example=beat&lenses=1");
  await page.getByTestId("transport").click({ position: { x: 300, y: 5 } });
  await page.keyboard.press("Shift+C");
  await expect(page.getByTestId("circle-panel")).toBeVisible();
  await expect(page.getByTestId("circle-status")).toContainText(/letters|no key/i);
  await expect(page.getByTestId("circle-use")).toHaveCount(0);
});

test("panels screenshot (the standalone page is Paper only; themed shots come from the Studio suite)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await open(page, "?example=patterned-keys&lenses=1");
  await page.getByTestId("transport").click({ position: { x: 300, y: 5 } });
  await page.keyboard.press("s");
  await page.keyboard.press("Shift+K");
  await page.keyboard.press("Shift+C");
  await expect(page.getByTestId("circle-panel")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/lens-panels.png`, fullPage: true });
});

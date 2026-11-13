// Wave 4 on the workbench's own page (port 5193), as a lesson step hosts the Workbench (`/?w4=step`, the content
// decides): the panels a step opens (`initialPanels`: the chord band with symbols, numerals and function colours,
// the chord-tone lens), nothing before their unlock, the code-modify region redrawn after an edit from the live
// editable ranges, a lead sheet with a pickup bar, and a melody over the Band naming the Band's chords. Every chord,
// numeral and count is checked against headless Strudel and @oak/theory in wave4.test.ts and here.
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const WB = "[data-testid=workbench]";
const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

async function open(page: Page, query: string): Promise<void> {
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(`/?w4=step&${query}`);
  await page.waitForSelector(`${WB}[data-analysis=ready]`, { timeout: 45_000 });
  await expect(page.getByTestId("staff-view")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
}

const regions = (page: Page) =>
  page
    .locator("[data-testid=chord-band] li[data-symbol]")
    .evaluateAll((els) =>
      els.map((e) => [e.getAttribute("data-symbol"), e.getAttribute("data-rn"), e.getAttribute("data-fn")]),
    );

test("a step's panels: chord band (symbols, numerals, function), chord tones, staff labels; keys close them", async ({
  page,
}) => {
  await open(page, "panels=chords,function,chord-tones");
  const wb = page.locator(WB);
  await expect(wb).toHaveAttribute("data-labels", "content");
  await expect(wb).toHaveAttribute("data-panels", "chords function chord-tones");
  await expect(wb).toHaveAttribute("data-chords", "symbols romans function");
  // I V vi IV in C: T D T PD (theory: harmonicFunction; wave4.test.ts checks the same piece).
  expect(await regions(page)).toEqual([
    ["C", "I", "T"],
    ["G", "V", "D"],
    ["Am", "vi", "T"],
    ["F", "IV", "PD"],
  ]);
  await expect(page.getByTestId("chord-tone-pct")).toHaveText("Chord tones on strong beats: 7 of 8 · 88%");
  const staff = page.getByTestId("staff-view");
  await expect(staff).toHaveAttribute("data-chord-symbols", "C G Am F");
  await expect(staff).toHaveAttribute("data-romans", "I V vi IV");
  // The switches are there to close what the step opened (keyboard only).
  await expect(page.getByTestId("lens-function")).toHaveAttribute("aria-pressed", "true");
  await wb.focus();
  await page.keyboard.press("Shift+F");
  await expect(wb).toHaveAttribute("data-chords", "symbols romans");
  await expect(page.locator("[data-testid=chord-band] li[data-fn].oak-chord-region--fn")).toHaveCount(0);
  await page.keyboard.press("Shift+T");
  await expect(page.getByTestId("chord-tone-pct")).toHaveCount(0);
  await page.keyboard.press("Shift+F");
  await expect(wb).toHaveAttribute("data-chords", "symbols romans function");
  await page.locator(".oak-wb-views").screenshot({ path: `${SHOTS}/w4-step-panels.png` });
});

test("a step that opens nothing shows no chord labels; nothing opens before its unlock", async ({ page }) => {
  await open(page, "");
  const wb = page.locator(WB);
  await expect(wb).toHaveAttribute("data-panels", "");
  await expect(page.getByTestId("chord-band")).toHaveCount(0);
  await expect(page.getByTestId("staff-view")).not.toHaveAttribute("data-chord-symbols", /./);
  await expect(page.getByTestId("panel-switch")).toHaveCount(0);
  await wb.focus();
  await page.keyboard.press("Shift+F");
  await expect(wb).toHaveAttribute("data-chords", "");
  await open(page, "panels=chords,function,key&locked=1");
  await expect(wb).toHaveAttribute("data-panels", "");
  await expect(page.getByTestId("chord-band")).toHaveCount(0);
});

test("the code-modify region is redrawn where it is after an edit", async ({ page }) => {
  await open(page, "");
  const wb = page.locator(WB);
  const region = "<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>";
  const targetText = () =>
    page.locator(".oak-mark-target").evaluateAll((els) => els.map((e) => e.textContent ?? "").join(""));
  await expect.poll(targetText).toBe(region);
  const before = await wb.getAttribute("data-targets");
  const [from, to] = (before ?? "").split("-").map(Number);
  expect((to as number) - (from as number)).toBe(region.length);
  // Click just inside the region's "<" and type a chord: the region grows and the box follows it.
  const at = await page.evaluate(() => {
    const content = document.querySelector(".cm-content");
    const walker = document.createTreeWalker(content as Node, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? "").indexOf("<[0,2,4]");
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i + 1);
      r.setEnd(n, i + 2);
      const b = r.getBoundingClientRect();
      return { x: b.left + 1, y: b.top + b.height / 2 };
    }
    return null;
  });
  if (!at) throw new Error("region not found in the editor");
  await page.mouse.click(at.x, at.y);
  await page.keyboard.type("[0,2,4] ");
  const grown = "<[0,2,4] [0,2,4] [4,6,8] [5,7,9] [3,5,7]>";
  await expect.poll(targetText).toBe(grown);
  await expect(wb).toHaveAttribute("data-targets", `${from}-${(from as number) + grown.length}`);
});

test("a lead sheet: the melody alone with the changes above, the pickup bar as bar 0", async ({ page }) => {
  await open(page, "piece=pickup&staff=lead");
  const staff = page.getByTestId("staff-view");
  await expect(staff).toHaveAttribute("data-lead", "1");
  await expect(page.getByTestId("lead-badge")).toHaveText("lead sheet · pickup");
  // 3/4, pickup G4, then C E G | F A C | B G D over C F G (headless Strudel: wave4.test.ts).
  await expect(staff).toHaveAttribute("data-chord-symbols", "C F G");
  const notes = await page.locator(".oak-staff-host [data-oak-events]").count();
  expect(notes).toBe(10);
  // The melody alone: every engraved note is the mel track's.
  const ids = await page
    .locator(".oak-staff-host [data-oak-events]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-oak-events") ?? ""));
  expect(ids.every((id) => id.split(" ").every((x) => x.includes("mel")))).toBe(true);
  await expect(page.getByTestId("lead-save")).toBeVisible();
  await page.locator(".oak-wb-views").screenshot({ path: `${SHOTS}/w4-lead-sheet.png` });
});

test("a melody over the Band: the band names the Band's chords", async ({ page }) => {
  await open(page, "piece=band&band=1&panels=chords,chord-tones");
  const band = page.getByTestId("chord-band");
  await expect(band).toHaveAttribute("data-source", "band");
  // band.axis-4bar in C: I V vi IV over its own roots (the Band's bass decides the inversion: root position).
  expect(await regions(page)).toEqual([
    ["C", "I", "T"],
    ["G", "V", "D"],
    ["Am", "vi", "T"],
    ["F", "IV", "PD"],
  ]);
  await expect(page.getByTestId("chord-tone-pct")).toContainText("Chord tones on strong beats");
});

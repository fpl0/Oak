// Wave 2 workbench additions on the workbench's own page (port 5193): the loop region (L, [ ], Shift+[ ]),
// the metronome (M, audible on the master bus, never in the code) and the roll that pages with the playhead
// on long loops instead of squeezing 64 bars into the panel.
import { expect, type Page, test } from "@playwright/test";

const WB = "[data-testid=workbench]";

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForSelector(`${WB}[data-analysis=ready]`, { timeout: 45_000 });
}

/** Focus on the workbench (not the editor): its keys work there. */
async function focusWorkbench(page: Page): Promise<void> {
  await page.locator(WB).evaluate((el) => (el as HTMLElement).focus());
}

const head = (page: Page) =>
  page.evaluate(() =>
    Number(document.querySelector("[data-testid=roll-canvas]")?.getAttribute("data-playhead") || "NaN"),
  );

async function rms(page: Page, ms = 1200): Promise<number> {
  return page.evaluate(async (ms) => {
    const o = (globalThis as { __oakStrudel?: { master: { level(): { rms: number } } } }).__oakStrudel;
    let peak = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      peak = Math.max(peak, o?.master.level().rms ?? 0);
      await new Promise((r) => setTimeout(r, 20));
    }
    return peak;
  }, ms);
}

test("L loops a region: the playhead stays inside it; [ ] and Shift+[ ] resize and move it", async ({
  page,
}) => {
  await open(page);
  const before = await page.locator(".cm-content").textContent();
  await focusWorkbench(page);
  await page.keyboard.press("l");
  await expect(page.locator(WB)).toHaveAttribute("data-loop", "1-2");
  await expect(page.getByTestId("loop-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("loop-toggle")).toContainText("bars 1–2");

  await page.keyboard.press("Space");
  await expect(page.locator(WB)).toHaveAttribute("data-looping", "1", { timeout: 15_000 });
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "1");
  // 92 BPM: a bar is 2.6 s. Over 6 s (past the end of bar 2) the playhead never leaves bars 1–2.
  const heads: number[] = [];
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(250);
    const h = await head(page);
    if (Number.isFinite(h)) heads.push(h);
  }
  expect(heads.length).toBeGreaterThan(18);
  for (const h of heads) {
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2.05);
  }
  // It wrapped back to the start of the region at least once.
  let wraps = 0;
  for (let i = 1; i < heads.length; i++) if ((heads[i] as number) < (heads[i - 1] as number) - 1) wraps++;
  expect(wraps).toBeGreaterThanOrEqual(1);

  await page.keyboard.press("]");
  await expect(page.locator(WB)).toHaveAttribute("data-loop", "1-3");
  await page.keyboard.press("Shift+]");
  await expect(page.locator(WB)).toHaveAttribute("data-loop", "2-4");
  await page.keyboard.press("[");
  await expect(page.locator(WB)).toHaveAttribute("data-loop", "2-3");
  await expect(page.getByTestId("loop-toggle")).toContainText("bars 2–3");
  // The moved region plays live: the playhead goes to bars 2–3 without a restart.
  await expect.poll(async () => await head(page), { timeout: 8000 }).toBeGreaterThanOrEqual(1);
  const later: number[] = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(250);
    later.push(await head(page));
  }
  for (const h of later.filter(Number.isFinite)) {
    expect(h).toBeGreaterThanOrEqual(0.95);
    expect(h).toBeLessThan(3.05);
  }

  // L again: back to the whole loop, played by the editor.
  await page.keyboard.press("l");
  await expect(page.locator(WB)).not.toHaveAttribute("data-loop", /./);
  await expect(page.locator(WB)).toHaveAttribute("data-looping", "0", { timeout: 10_000 });
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "1", { timeout: 10_000 });
  await page.keyboard.press("Space");
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "0");
  // The code was never touched.
  expect(await page.locator(".cm-content").textContent()).toBe(before);
});

test("a Run while the loop is on hands the new code to the loop", async ({ page }) => {
  await open(page, "?example=degrees-d");
  await focusWorkbench(page);
  await page.keyboard.press("l");
  await expect(page.locator(WB)).toHaveAttribute("data-loop", "1-1");
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator(WB)).toHaveAttribute("data-looping", "1", { timeout: 15_000 });
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "1");
  await page.keyboard.press("ControlOrMeta+.");
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "0", { timeout: 5000 });
});

test("the loop controls work by pointer too and say what they do", async ({ page }) => {
  await open(page);
  await page.getByTestId("loop-toggle").click();
  await expect(page.locator(WB)).toHaveAttribute("data-loop", "1-2");
  await page.getByRole("button", { name: "Loop one bar longer" }).click();
  await page.getByRole("button", { name: "Move the loop one bar later" }).click();
  await expect(page.locator(WB)).toHaveAttribute("data-loop", "2-4");
  await expect(page.getByRole("button", { name: "Move the loop one bar later" })).toBeDisabled();
  await page.getByRole("button", { name: "Loop one bar shorter" }).click();
  await page.getByRole("button", { name: "Loop one bar shorter" }).click();
  await expect(page.locator(WB)).toHaveAttribute("data-loop", "2-2");
  await expect(page.getByTestId("loop-toggle")).toContainText("bar 2");
  await expect(page.getByRole("button", { name: "Loop one bar shorter" })).toBeDisabled();
});

test("M: the metronome clicks on the master bus while the music is muted, and never enters the code", async ({
  page,
}) => {
  await open(page, "?example=degrees-d");
  const before = await page.locator(".cm-content").textContent();
  // Mute the only track: what is left on the master bus is the metronome.
  await page.getByTestId("mute-mel").click();
  await page.getByTestId("play-toggle").click();
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "1", { timeout: 15_000 });
  await page.waitForTimeout(600);
  const silent = await rms(page, 1000);
  await focusWorkbench(page);
  await page.keyboard.press("m");
  await expect(page.locator(WB)).toHaveAttribute("data-metronome", "1");
  await expect(page.getByTestId("metronome-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("metronome-beats").locator("i")).toHaveCount(4);
  const clicking = await rms(page, 1600);
  expect(clicking).toBeGreaterThan(0.005);
  expect(clicking).toBeGreaterThan(silent * 4 + 0.002);
  // The visual twin lights a beat.
  await expect(page.locator("[data-testid=metronome-beats] i[data-on='1']")).toHaveCount(1);
  await page.keyboard.press("m");
  await expect(page.locator(WB)).toHaveAttribute("data-metronome", "0");
  await page.waitForTimeout(400);
  expect(await rms(page, 1000)).toBeLessThan(0.004);
  await page.getByTestId("play-toggle").click();
  expect(await page.locator(".cm-content").textContent()).toBe(before);
});

test("long loops: the roll shows 16 bars at a time and pages by hand or with the playhead", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page, "?example=long-64");
  const canvas = page.getByTestId("roll-canvas");
  await expect(page.getByTestId("roll-pager")).toContainText("Bars 1–16 of 64");
  await expect(canvas).toHaveAttribute("data-window", "0-16");
  await page.getByRole("button", { name: "Roll: later bars" }).click();
  await expect(page.getByTestId("roll-pager")).toContainText("Bars 17–32 of 64");
  await expect(canvas).toHaveAttribute("data-window", "16-32");
  await page.getByRole("button", { name: "Roll: earlier bars" }).click();
  await expect(canvas).toHaveAttribute("data-window", "0-16");

  // 240 BPM is one bar a second: after 16 bars the page turns by itself.
  await page.getByTestId("play-toggle").click();
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "1", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Roll: later bars" })).toBeDisabled();
  await expect(canvas).toHaveAttribute("data-window", "16-32", { timeout: 25_000 });
  const h = await head(page);
  expect(h).toBeGreaterThanOrEqual(16);
  expect(h).toBeLessThan(32);
  await page.getByTestId("play-toggle").click();
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "0");
  // Stopped: the last page stays, and paging by hand works again.
  await expect(page.getByRole("button", { name: "Roll: earlier bars" })).toBeEnabled();
});

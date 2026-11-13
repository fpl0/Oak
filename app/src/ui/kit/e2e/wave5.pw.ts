// Wave 5 kit: the new pieces (section ribbon, bar grid, line chart, scope frame, control read-out) in both themes and
// sizes, from the keyboard and under reduced motion. Every test blocks Vite's HMR socket; the gallery needs no seed
// (it is mounted on its own over a settings page).
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../../e2e/support/stack.ts";
import { useUiPrefs } from "../../../../../e2e/support/ui.ts";

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

/** Mounts kit/gallery/KitWave5.tsx over an app page (no other area's route needed) in a scrolling layer. */
async function openGallery(page: Page) {
  await page.goto("/settings/about");
  await expect(page.locator("#main")).toBeAttached();
  await page.evaluate(async () => {
    const host = document.createElement("div");
    host.id = "kit-w5";
    host.setAttribute(
      "style",
      "position:fixed;inset:0;overflow:auto;z-index:60;background:var(--oak-bg);color:var(--oak-text)",
    );
    document.body.append(host);
    const src = "/src/ui/kit/gallery/KitWave5.tsx";
    const m = (await import(/* @vite-ignore */ src)) as { mountKitWave5(el: HTMLElement): () => void };
    m.mountKitWave5(host);
  });
  await expect(page.getByRole("heading", { level: 1, name: "UI kit · Wave 5" })).toBeVisible();
}

async function shootLayer(page: Page, name: string, theme: string) {
  const size = page.viewportSize() ?? { width: 0, height: 0 };
  const pages = await page.evaluate(() => {
    const el = document.getElementById("kit-w5");
    if (!el) return 1;
    el.scrollTop = 0;
    return Math.max(1, Math.ceil(el.scrollHeight / el.clientHeight));
  });
  for (let i = 0; i < Math.min(pages, 7); i++) {
    await page.evaluate((n) => {
      const el = document.getElementById("kit-w5");
      if (el) el.scrollTop = n * el.clientHeight;
    }, i);
    const suffix = i === 0 ? "" : `-p${i + 1}`;
    await page.screenshot({
      path: `${SHOTS}/${name}-${theme}-${size.width}x${size.height}${suffix}.png`,
      animations: "disabled",
    });
  }
}

for (const m of SCREENSHOT_MATRIX) {
  test(`Wave 5 pieces render in ${m.theme} at ${m.width}x${m.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme, motion: "off" });
    await openGallery(page);
    const overflow = await page.evaluate(() => {
      const el = document.getElementById("kit-w5") as HTMLElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
    // Every canvas drew something (the frame's grid at least) at the device pixel ratio.
    const canvases = await page.locator("#kit-w5 canvas").evaluateAll((els) =>
      els.map((c) => {
        const el = c as HTMLCanvasElement;
        return { w: el.width, h: el.height, css: el.clientWidth };
      }),
    );
    expect(canvases.length).toBeGreaterThanOrEqual(5);
    for (const c of canvases) {
      expect(c.w).toBeGreaterThan(0);
      expect(c.w).toBeGreaterThanOrEqual(c.css);
    }
    // A focused section shows its ring in the shot.
    await page
      .getByTestId("ribbon-loop")
      .getByRole("button", { name: /^Verse \(A\)/ })
      .focus();
    await shootLayer(page, "w5-kit", m.theme);
    expect(errors).toEqual([]);
  });
}

test("the section ribbon loops a section from the keyboard and counts bars after a pickup", async ({
  page,
}) => {
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await openGallery(page);
  const ribbon = page.getByRole("group", { name: "Sections of “Porch Light”" });
  const blocks = ribbon.getByRole("button");
  await expect(blocks).toHaveCount(4);
  // One tab stop: the looping section.
  await expect(ribbon.locator('[tabindex="0"]')).toHaveCount(1);
  await expect(ribbon.locator('[data-section="chorus"]')).toHaveAttribute("tabindex", "0");
  await expect(ribbon.locator('[data-section="chorus"]')).toHaveAttribute("aria-pressed", "true");
  await expect(ribbon.locator('[data-section="chorus"]')).toHaveAttribute(
    "aria-label",
    "Chorus (B), bars 5–8, energy 78 %, playing now, looping",
  );
  await expect(page.getByTestId("ribbon-loop").getByTestId("ribbon-status")).toHaveText(
    "Looping Chorus, bars 5–8. Enter or Esc stops.",
  );
  // Escape stops; arrows move; Enter loops the focused one.
  await ribbon.locator('[data-section="chorus"]').focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ribbon-loop-state")).toHaveText("No loop");
  await page.keyboard.press("ArrowRight");
  await expect(ribbon.locator('[data-section="verse2"]')).toBeFocused();
  await page.keyboard.press("End");
  await expect(ribbon.locator('[data-section="chorus2"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ribbon-loop-state")).toHaveText("Loop: chorus2");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ribbon-loop-state")).toHaveText("No loop");
  await ribbon.locator('[data-section="verse"]').click();
  await expect(page.getByTestId("ribbon-loop-state")).toHaveText("Loop: verse");
  // The playhead moves with the bar.
  const head = page.getByTestId("ribbon-loop").getByTestId("ribbon-playhead");
  const x1 = (await head.boundingBox())?.x ?? 0;
  await page.getByRole("button", { name: "Next bar" }).click();
  const x2 = (await head.boundingBox())?.x ?? 0;
  expect(x2).toBeGreaterThan(x1);
  await page.getByRole("button", { name: "Stop", exact: true }).first().click();
  await expect(head).toHaveCount(0);

  // A pickup piece: the first section takes in the pickup, the second starts at bar 5 (counted from bar 1).
  const pick = page.getByRole("group", { name: "Pick the section that answers" });
  await expect(pick.locator('[data-section="question"]')).toHaveAttribute(
    "aria-label",
    "Question (A), the pickup and bars 1–4",
  );
  await expect(pick.locator('[data-section="answer"]')).toHaveAttribute("aria-label", "Answer (B), bars 5–8");
  await pick.locator('[data-section="question"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(pick.locator('[data-section="answer"]')).toHaveAttribute("aria-pressed", "true");

  // Problem and empty states say what to do in words.
  await expect(page.getByTestId("ribbon-problem")).toContainText("Write one arrange() per labelled track");
  await expect(page.getByTestId("ribbon-empty")).toHaveText(
    "No sections yet: write one arrange() per labelled track and run it.",
  );
});

test("the bar grid moves by bar and by line and reports states in words", async ({ page }) => {
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  await openGallery(page);
  const chart = page.getByRole("group", { name: "Twelve-bar blues in C" });
  // The chords are @oak/theory's: I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7 in C.
  const names = await chart
    .getByRole("button")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(names.map((n) => /: (\w+)/.exec(n ?? "")?.[1])).toEqual([
    "C7",
    "C7",
    "C7",
    "C7",
    "F7",
    "F7",
    "C7",
    "C7",
    "G7",
    "F7",
    "C7",
    "G7",
  ]);
  await expect(chart.locator('[data-bar="6"]')).toHaveAttribute(
    "aria-label",
    "Bar 6: F7, given, playing now",
  );

  const grid = page.getByRole("group", { name: "Write the numerals of the twelve bars" });
  await expect(grid.locator('[data-bar="5"]')).toHaveAttribute("aria-pressed", "true");
  await expect(grid.locator('[data-bar="7"]')).toHaveAttribute("aria-label", "Bar 7: empty");
  await expect(grid.locator('[data-bar="7"]')).toContainText("////");
  await grid.locator('[data-bar="5"]').focus();
  await page.keyboard.press("ArrowDown");
  await expect(grid.locator('[data-bar="9"]')).toBeFocused();
  await page.keyboard.press("End");
  await expect(grid.locator('[data-bar="12"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(grid.locator('[data-bar="12"]')).toBeFocused();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Home" : "Control+Home");
  await expect(grid.locator('[data-bar="1"]')).toBeFocused();
  // Fill bar 5 wrong and bar 6 right, check: icon and words, never colour alone.
  await grid.locator('[data-bar="5"]').click();
  await page.getByRole("radio", { name: "V7", exact: true }).click();
  await grid.locator('[data-bar="6"]').click();
  await page.getByRole("radio", { name: "IV7", exact: true }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await expect(grid.locator('[data-bar="5"]')).toHaveAttribute("data-state", "unmet");
  await expect(grid.locator('[data-bar="5"]')).toContainText("not yet");
  await expect(grid.locator('[data-bar="6"]')).toHaveAttribute("aria-label", "Bar 6: IV7, right");
});

test("the line chart names its lowest and highest point", async ({ page }) => {
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await openGallery(page);
  await expect(page.getByTestId("chart-sections").getByRole("img")).toHaveAttribute(
    "aria-label",
    "Energy by section: lowest 38 % at Verse, highest 92 % at Chorus 2.",
  );
  await expect(page.getByTestId("chart-sections").locator("table tr")).toHaveCount(4);
  await expect(page.getByTestId("chart-sections").locator('[data-marked="true"]')).toHaveAttribute(
    "data-point",
    "1",
  );
  // One label per section on the per-bar chart.
  await expect(page.getByTestId("chart-bars").locator("[data-chart-labels] > span")).toHaveCount(4);
});

test("controls step on their own scale, with fine and coarse keys", async ({ page }) => {
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await openGallery(page);
  const cutoff = page.getByRole("slider", { name: "Cutoff" });
  await expect(cutoff).toHaveAttribute("aria-valuetext", "800 Hz");
  await cutoff.focus();
  await page.keyboard.press("ArrowUp");
  await expect(cutoff).toHaveAttribute("aria-valuetext", "848 Hz");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(cutoff).toHaveAttribute("aria-valuetext", "1.7 kHz");
  await expect(cutoff).toHaveAttribute("aria-valuenow", "1700");
  await page.keyboard.press("Alt+ArrowDown");
  await expect(cutoff).toHaveAttribute("aria-valuenow", "1680");
  await page.keyboard.press("End");
  await expect(cutoff).toHaveAttribute("aria-valuetext", "20 kHz");
  await page.getByRole("button", { name: "Reset cutoff to 800 Hz" }).click();
  await expect(cutoff).toHaveAttribute("aria-valuenow", "800");
  // The filter probe follows the control.
  await expect(page.getByTestId("scope-filter")).toContainText(".lpf(800) with resonance 1");

  const attack = page.getByRole("slider", { name: "Attack" });
  await attack.focus();
  await page.keyboard.press("ArrowRight");
  await expect(attack).toHaveAttribute("aria-valuetext", "20 ms");
  await page.keyboard.press("Alt+ArrowRight");
  await expect(attack).toHaveAttribute("aria-valuetext", "21 ms");
  await page.keyboard.press("PageUp");
  await expect(attack).toHaveAttribute("aria-valuenow", "0.121");
  // Pointer: the middle of the cutoff track is about 632 Hz on a log scale.
  const track = await cutoff.locator("..").boundingBox();
  if (!track) throw new Error("no track");
  await page.mouse.click(track.x + track.width / 2, track.y + track.height / 2);
  await expect(cutoff).toHaveAttribute("aria-valuenow", "632");
  // Disabled: out of the tab order, says why.
  const fb = page.getByRole("slider", { name: "Delay feedback" });
  await expect(fb).toHaveAttribute("tabindex", "-1");
  await expect(fb).toHaveAttribute("aria-disabled", "true");
});

test("the scope frame: an empty state until Play, then a live redraw; reduced motion throttles it", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await useUiPrefs(page, { theme: "bark" });
  await openGallery(page);
  const live = page.getByTestId("scope-live");
  await expect(live).toHaveAttribute("data-scope-state", "empty");
  await expect(live.getByTestId("scope-empty")).toHaveText("Press Play to see the wave");
  await live.getByRole("button", { name: "Play" }).click();
  await expect(live).toHaveAttribute("data-scope-state", "live");
  // Under reduced motion the canvas redraws at most ten times a second.
  const draws = await live.locator("canvas").evaluate(async (c) => {
    const el = c as HTMLCanvasElement;
    const ctx = el.getContext("2d") as CanvasRenderingContext2D;
    let n = 0;
    const clear = ctx.clearRect.bind(ctx);
    ctx.clearRect = (...a: Parameters<CanvasRenderingContext2D["clearRect"]>) => {
      n++;
      clear(...a);
    };
    await new Promise((r) => setTimeout(r, 1000));
    return n;
  });
  expect(draws).toBeGreaterThanOrEqual(3);
  expect(draws).toBeLessThanOrEqual(12);
  // The still frames describe themselves.
  await expect(page.getByTestId("scope-spectrum").getByRole("img")).toHaveAttribute(
    "aria-label",
    "Spectrum: the harmonics of a sawtooth on A2. Level against frequency.",
  );
});

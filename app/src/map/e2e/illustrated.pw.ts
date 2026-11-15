import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { fixtureGraph } from "../illustrated/fixtures.ts";
import { layoutIllustratedOak } from "../illustrated/layout.ts";
import { treeNeighbour } from "../illustrated/navigation.ts";
import { ILLUSTRATED_URL } from "./playwright.config.ts";

// The illustrated tree on its own harness page (seeded fixtures, no API): the map project starts it beside the
// app's stack. The /oak page itself is covered by oak.pw.ts.
test.use({ baseURL: ILLUSTRATED_URL });

const screenshots = fileURLToPath(new URL("./screenshots/illustrated/", import.meta.url));
const layout = layoutIllustratedOak(fixtureGraph);
const arrows = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" } as const;

async function settled(page: Page) {
  await expect(page.locator(".illustrated-oak")).toHaveAttribute("data-ready", "true");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

for (const seed of ["new", "mid", "mastered"] as const) {
  test(`${seed}: Paper and Bark, both viewport sizes`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await mkdir(screenshots, { recursive: true });
    for (const theme of ["paper", "bark"]) {
      // Seed directly, never replay lessons. One page per fixture/theme; resize the same state in place.
      await page.goto(`/?seed=${seed}&theme=${theme}`);
      await expect(page.locator("[data-node]")).toHaveCount(143);
      for (const [width, height] of [
        [1280, 800],
        [1440, 900],
      ] as const) {
        await page.setViewportSize({ width, height });
        await settled(page);
        expect(
          await page.evaluate(() => ({
            w: document.documentElement.scrollWidth,
            h: document.documentElement.scrollHeight,
          })),
        ).toEqual({ w: width, h: height });
        const bounds = await page.locator("[data-node]").evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          }),
        );
        expect(bounds.every((r) => r.left >= 0 && r.top >= 0 && r.right <= width && r.bottom <= height)).toBe(
          true,
        );
        const contrast = await page.locator(".illustrated-strands").evaluate((el) => {
          const style = getComputedStyle(el);
          const luminance = (rgb: string) => {
            const channels = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
              const c = Number(v) / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
            return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
          };
          const fg = luminance(style.color);
          const bg = luminance(style.backgroundColor);
          return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
        });
        expect(contrast).toBeGreaterThanOrEqual(4.5);
        await page.screenshot({ path: `${screenshots}${seed}-${theme}-${width}x${height}.png` });
        await page.locator('[data-node][tabindex="0"]').focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.locator("[data-node]:focus .illustrated-focus")).toHaveCSS("opacity", "1");
        await page.keyboard.press("0");
        await page.locator("[data-node]:focus").evaluate((el) => (el as SVGElement).blur());
        console.log(`${seed} ${theme} ${width}×${height}: label contrast ${contrast.toFixed(2)}:1`);
      }
    }
    expect(errors).toEqual([]);
  });
}

test("arrows traverse all 143 leaves; panel, next, zoom, pan and acorns work", async ({ page }) => {
  await page.goto("/?seed=mid&theme=paper");
  await settled(page);
  const first = layout.nodes[0];
  if (!first) throw new Error("Missing first leaf");
  await page.locator(`[data-node="${first.id}"]`).focus();
  let current = first.id;
  const seen = new Set([current]);
  // Find the shortest directional route to each not-yet-visited leaf, exercising real key events.
  for (const target of layout.nodes) {
    if (seen.has(target.id)) continue;
    const queue = [{ id: current, path: [] as (keyof typeof arrows)[] }];
    const searched = new Set([current]);
    let path: (keyof typeof arrows)[] | undefined;
    while (queue.length) {
      const entry = queue.shift();
      if (!entry) break;
      if (entry.id === target.id) {
        path = entry.path;
        break;
      }
      for (const direction of Object.keys(arrows) as (keyof typeof arrows)[]) {
        const to = treeNeighbour(layout, entry.id, direction);
        if (to && !searched.has(to)) {
          searched.add(to);
          queue.push({ id: to, path: [...entry.path, direction] });
        }
      }
    }
    if (!path) throw new Error(`Unreachable leaf ${target.id}`);
    for (const direction of path) {
      await page.keyboard.press(arrows[direction]);
      current = treeNeighbour(layout, current, direction) ?? current;
      seen.add(current);
    }
    await expect(page.locator(`[data-node="${target.id}"]`)).toBeFocused();
  }
  expect(seen.size).toBe(143);
  await page.keyboard.press("End");
  await expect(page.locator(`[data-node="${layout.nodes.at(-1)?.id}"]`)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Leaf inspector" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Leaf inspector" })).toHaveCount(0);
  // Esc gives focus back to the leaf on the next frame: wait for it before the next key (N is a leaf key).
  await expect(page.locator(`[data-node="${layout.nodes.at(-1)?.id}"]`)).toBeFocused();
  await page.keyboard.press("n");
  await expect(page.locator('[data-node="B01"]')).toBeFocused();
  const canvas = page.getByTestId("oak-canvas");
  await page.keyboard.press("0");
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("Missing canvas bounds");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-scale")))
    .toBeCloseTo(Math.min(canvasBox.width / 1600, canvasBox.height / 1000), 2);
  const fitted = Number(await canvas.getAttribute("data-scale"));
  await page.keyboard.press("+");
  await expect.poll(async () => Number(await canvas.getAttribute("data-scale"))).toBeGreaterThan(fitted);
  await page.keyboard.press("-");
  await expect.poll(async () => Number(await canvas.getAttribute("data-scale"))).toBeCloseTo(fitted, 2);
  await page.keyboard.press("w");
  await expect.poll(async () => Number(await canvas.getAttribute("data-scale"))).toBeGreaterThanOrEqual(0.85);
  await page.keyboard.press("+");
  const scene = canvas.locator(":scope > g");
  const before = await scene.getAttribute("transform");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing canvas");
  await page.mouse.move(box.x + 650, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 320, { steps: 12 });
  await page.mouse.up();
  await expect(scene).not.toHaveAttribute("transform", before ?? "");
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await page.getByRole("button", { name: "Whole tree" }).click();
  await settled(page);
  await page.locator('[data-node="R01"]').click();
  await expect(page.getByRole("complementary")).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.locator('[data-node="R01"]')).toBeFocused();
  await expect(page.getByRole("link", { name: "Open released track: A little heartbeat" })).toHaveAttribute(
    "href",
    "/album/fixture-intro",
  );
  await page.screenshot({ path: `${screenshots}keyboard-focus-paper.png` });
});

test("new leaf unfurls once; reduced motion has no growth", async ({ page }) => {
  await page.goto("/?seed=mid&motion=full");
  await settled(page);
  await page.getByRole("button", { name: "Mark a newly learned leaf" }).click();
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(1);
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished));
  });
  await page.getByRole("button", { name: "Mark a newly learned leaf" }).click();
  await settled(page);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.goto("/?seed=mid&motion=reduced");
  await settled(page);
  await page.getByRole("button", { name: "Mark a newly learned leaf" }).click();
  await settled(page);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?seed=mid&motion=full");
  await settled(page);
  await page.getByRole("button", { name: "Mark a newly learned leaf" }).click();
  await settled(page);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

// The whole course (carry f1: "60 fps while panning with every leaf of all 259 sessions"): every real leaf grown, 37
// more for headroom (180), all twenty capstone acorns, twelve B-sides on the ground and ten leaves glinting.
test("the whole course, 180 leaves and 32 acorns: sustained wheel pan frame measurement", async ({
  page,
}, info) => {
  await page.goto("/?seed=mastered&stress=whole&motion=reduced");
  await settled(page);
  await expect(page.locator("[data-node]")).toHaveCount(180);
  await expect(page.locator(".illustrated-acorn")).toHaveCount(32);
  await page.getByRole("button", { name: "Fit width" }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const metrics = await page.evaluate(async () => {
    const svg = document.querySelector<SVGSVGElement>('[data-testid="oak-canvas"]');
    if (!svg) throw new Error("Missing canvas");
    const r = svg.getBoundingClientRect();
    const intervals: number[] = [];
    const eventTimes: number[] = [];
    let previous = 0;
    // Sustained wheel pan runs through the actual event handler and measures browser frame cadence.
    for (let i = 0; i < 180; i++) {
      const t = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      if (previous) intervals.push(t - previous);
      previous = t;
      const start = performance.now();
      svg.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: Math.sin(i / 15) * 4,
          deltaY: Math.cos(i / 17) * 3,
          clientX: r.x + 500,
          clientY: r.y + 300,
          bubbles: true,
          cancelable: true,
        }),
      );
      eventTimes.push(performance.now() - start);
    }
    const sorted = [...intervals].sort((a, b) => a - b);
    return {
      leaves: 180,
      frames: intervals.length,
      fps: 1000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length),
      medianMs: sorted[Math.floor(sorted.length / 2)],
      p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      maxMs: Math.max(...intervals),
      handlerP95Ms: [...eventTimes].sort((a, b) => a - b)[Math.floor(eventTimes.length * 0.95)],
      framesOver25ms: intervals.filter((t) => t > 25).length,
    };
  });
  console.log(`PAN_METRICS ${JSON.stringify(metrics)}`);
  await info.attach("pan-metrics.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  expect(metrics.fps).toBeGreaterThanOrEqual(55);
  expect(metrics.p95Ms).toBeLessThanOrEqual(20);
});

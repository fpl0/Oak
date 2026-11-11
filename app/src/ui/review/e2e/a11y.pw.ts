// Keyboard and motion across the review scope: Tab reaches every control with a visible focus ring, nothing
// animates longer than 120 ms with reduced motion, and the album, Studio, Toolbox and Oak are usable without a
// pointer.
import { expect, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { api, createSketch, seed } from "./support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

let paths: string[] = [];

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await seed(page, "C1 released");
  const sketch = await createSketch(page, "Keys only", 'setcpm(90/4)\n\ndrums: s("bd hh sd hh")\n');
  const album = await api<{ tracks: { id: string }[] }>(page, "GET", "/album");
  paths = [
    "/studio",
    `/studio/${sketch}`,
    "/toolbox",
    "/toolbox/tb.s",
    "/toolbox/tb.voicing",
    "/oak",
    "/oak?view=course",
    "/oak?view=leaves",
    "/album",
    `/album/${album.body.tracks[0]?.id}`,
    "/capstone/C1",
  ];
  await page.close();
});

/** Tabs `n` times; returns the focused elements that show no focus indicator. */
async function tabAndCheck(page: Page, n: number): Promise<string[]> {
  const bad: string[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring =
        (cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth) > 0) ||
        (cs.boxShadow !== "none" && cs.boxShadow !== "") ||
        el.closest(".cm-editor") !== null ||
        // SVG nodes draw their ring as a child (the Oak's leaves).
        [...el.querySelectorAll(".oak-focus")].some((r) => getComputedStyle(r).opacity === "1");
      const label = `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}"`;
      return ring ? null : label;
    });
    if (r) bad.push(r);
  }
  return bad;
}

test("every focusable control on every surface shows a focus ring", async ({ page }) => {
  test.setTimeout(300_000);
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  const problems: Record<string, string[]> = {};
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("#main")).toBeVisible();
    await page.waitForTimeout(1200);
    const bad = await tabAndCheck(page, 40);
    if (bad.length) problems[path] = [...new Set(bad)];
  }
  expect(problems).toEqual({});
});

test("reduced motion: nothing animates for longer than 120 ms", async ({ page }) => {
  test.setTimeout(300_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await useUiPrefs(page, { theme: "paper", motion: "system" });
  const problems: Record<string, string[]> = {};
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("#main")).toBeVisible();
    await page.waitForTimeout(300);
    const long = await page.evaluate(() =>
      document.getAnimations().flatMap((a) => {
        const t = a.effect?.getComputedTiming();
        const d = typeof t?.duration === "number" ? t.duration : 0;
        const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
        // The playhead is allowed to move (ux §7.6).
        if (!target || target.closest("[data-playhead]")) return [];
        return d > 120
          ? [`${target.tagName.toLowerCase()}.${String(target.className).slice(0, 40)} ${Math.round(d)}ms`]
          : [];
      }),
    );
    if (long.length) problems[path] = long;
  }
  expect(problems).toEqual({});
});

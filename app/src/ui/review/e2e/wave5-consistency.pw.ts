// Wave 5 consistency pass over the Wave 4 surfaces, with fresh eyes: the Transcription Studio (an own-audio project
// and the ladder), the capstone workspace (C2 and X1), the album and a track page — in both themes at both reference
// sizes. Each is read for one product: no horizontal overflow, every text run AA on its surface, a visible focus
// ring on every stop of the first keyboard pass. Screenshots go to ./screenshots (w5c-*).
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { api, contrastIssues, expectNoHorizontalOverflow, SHOTS, seed } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

/**
 * Tabs through the first `stops` focus stops from the top of `#main` and returns those without a visible ring: an
 * outline of at least 1.5 px, a box-shadow ring, or (in the code editor) the ring on the editor's frame.
 */
async function focusRingGaps(page: Page, stops = 14): Promise<string[]> {
  await page.locator("#main").focus();
  const gaps: string[] = [];
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const main = document.getElementById("main");
      if (main && !main.contains(el)) return { inMain: false, ok: true, name: "" };
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth) >= 1.5;
      const ring = cs.boxShadow !== "none" && cs.boxShadow !== "";
      // The code editor rings its frame while focus is inside (workbench.css `.oak-wb-editor:focus-within`).
      let editorRing = false;
      if (el.closest(".cm-editor"))
        for (let e: HTMLElement | null = el.parentElement, n = 0; e && n < 6; e = e.parentElement, n++) {
          const ecs = getComputedStyle(e);
          if (ecs.outlineStyle !== "none" && Number.parseFloat(ecs.outlineWidth) >= 1.5) editorRing = true;
        }
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 40);
      return {
        inMain: true,
        ok: outline || ring || editorRing,
        name: `${el.tagName.toLowerCase()} “${name}”`,
      };
    });
    if (!r) break;
    if (r.inMain && !r.ok) gaps.push(r.name);
  }
  return gaps;
}

interface Surface {
  name: string;
  point: string;
  path(page: Page): Promise<string>;
  ready(page: Page): Promise<void>;
}

const SURFACES: readonly Surface[] = [
  {
    name: "transcribe-own-audio",
    point: "own-audio project",
    path: async (page) => {
      const list = await api<{ items: { id: string; sourceKind: string }[] }>(page, "GET", "/transcriptions");
      const own = list.body.items.find((t) => t.sourceKind === "own-audio");
      expect(own, "the seed has an own-audio project").toBeTruthy();
      return `/transcribe/${own?.id}`;
    },
    ready: (p) => expect(p.locator("main h1")).toBeVisible({ timeout: 20_000 }),
  },
  {
    name: "transcribe-ladder",
    point: "ladder L3",
    path: async () => "/transcribe",
    ready: (p) => expect(p.locator("main h1")).toBeVisible({ timeout: 20_000 }),
  },
  {
    name: "capstone-c2",
    point: "C2.S1 done",
    path: async () => "/capstone/C2",
    ready: (p) => expect(p.locator("main h1")).toBeVisible({ timeout: 30_000 }),
  },
  {
    name: "capstone-x1",
    point: "X1.S2 done",
    path: async () => "/capstone/X1",
    ready: (p) => expect(p.locator("main h1")).toBeVisible({ timeout: 30_000 }),
  },
  {
    name: "album",
    point: "X1 released",
    path: async () => "/album",
    ready: (p) => expect(p.getByTestId("album-title")).toBeVisible({ timeout: 20_000 }),
  },
  {
    name: "album-track",
    point: "X1 released",
    path: async (page) => {
      const album = await api<{ tracks: { id: string }[] }>(page, "GET", "/album");
      return `/album/${album.body.tracks[album.body.tracks.length - 1]?.id}`;
    },
    ready: (p) => expect(p.locator("main h1")).toBeVisible({ timeout: 20_000 }),
  },
];

for (const s of SURFACES) {
  test(`${s.name}: one product in both themes and sizes (overflow, AA text, focus rings)`, async ({
    page,
  }) => {
    await seed(page, s.point);
    const path = await s.path(page);
    const problems: string[] = [];
    for (const m of SCREENSHOT_MATRIX) {
      await useUiPrefs(page, { theme: m.theme, motion: "off" });
      await page.setViewportSize({ width: m.width, height: m.height });
      await page.goto(path);
      await s.ready(page);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalOverflow(page);
      for (const c of await contrastIssues(page)) problems.push(`${m.theme} ${m.width}: ${c}`);
      await shoot(page, SHOTS, `w5c-${s.name}`, m.theme);
      if (m.width === 1440 && m.theme === "paper")
        for (const g of await focusRingGaps(page)) problems.push(`focus: ${g}`);
    }
    expect(problems).toEqual([]);
  });
}

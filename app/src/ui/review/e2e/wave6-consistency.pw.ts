// Wave 6 consistency pass over the Wave 5 surfaces, with fresh eyes: the capstone workspace with sections (C3) and
// with the twelve-bar chart (C5), the blues transcription (X2), the ladder at L6, the album after C5 with a track
// page, and Today on a day with a side lesson offered — in both themes at both reference sizes. Each is read for
// one product: no horizontal overflow, every text run AA on its surface, a visible focus ring on every stop of the
// first keyboard pass, no console error. Screenshots go to ./screenshots (w6c-*). The form map, the scope and the
// chart panels of the Workbench are covered the same way by wave5-surfaces.pw.ts ("form map, chart and scope
// together"), from a sketch that fills all three.
//
// One page per state (wave5.md §7.1): a surface seeds once and loads once per theme; the size changes in place.
import { expect, type Page, test } from "@playwright/test";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import {
  api,
  contrastIssues,
  expectNoHorizontalOverflow,
  focusRingGaps,
  SHOTS,
  seed,
  settled,
} from "./support.ts";

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
] as const;

interface Surface {
  name: string;
  point: string;
  path(page: Page): Promise<string>;
  ready(page: Page): Promise<void>;
  /** What must be in view at 1280×800 without scrolling (the surface's next action). */
  inView?(page: Page): Promise<void>;
}

const heading = (p: Page) => expect(p.locator("main h1").first()).toBeVisible({ timeout: 30_000 });

const SURFACES: readonly Surface[] = [
  {
    // The capstone workspace with sections: the form strip over the Workbench (C3's third day, arranging).
    name: "capstone-c3-sections",
    point: "C3.S2 done",
    path: async () => "/capstone/C3",
    ready: heading,
  },
  {
    // The twelve-bar piece: its chart and the blues rules beside the Workbench.
    name: "capstone-c5-twelve-bar",
    point: "C5.S1 done",
    path: async () => "/capstone/C5",
    ready: heading,
  },
  {
    name: "capstone-x2",
    point: "X2.S1 done",
    path: async () => "/capstone/X2",
    ready: heading,
  },
  {
    name: "transcribe-ladder-l6",
    point: "ladder L6",
    path: async () => "/transcribe",
    ready: heading,
  },
  {
    name: "album-after-c5",
    point: "C5 released",
    path: async () => "/album",
    ready: (p) => expect(p.getByTestId("album-title")).toBeVisible({ timeout: 20_000 }),
  },
  {
    name: "album-track-c5",
    point: "C5 released",
    path: async (page) => {
      const album = await api<{ tracks: { id: string }[] }>(page, "GET", "/album");
      return `/album/${album.body.tracks[album.body.tracks.length - 1]?.id}`;
    },
    ready: heading,
  },
  {
    name: "today-side-lesson",
    point: "side lesson offered",
    path: async () => "/",
    ready: (p) => expect(p.getByTestId("page-title")).toBeVisible({ timeout: 20_000 }),
    inView: (p) =>
      expect(p.getByRole("button", { name: /^(Start|Resume|Continue)/ }).first()).toBeInViewport({
        ratio: 1,
      }),
  },
];

for (const s of SURFACES) {
  test(`${s.name}: one product in both themes and sizes (overflow, AA text, focus rings)`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await seed(page, s.point);
    const path = await s.path(page);
    const problems: string[] = [];
    for (const theme of ["paper", "bark"] as const) {
      await useUiPrefs(page, { theme, motion: "off" });
      await page.setViewportSize(SIZES[0]);
      await page.goto(path);
      await s.ready(page);
      await settled(page);
      for (const size of SIZES) {
        await page.setViewportSize(size);
        await settled(page);
        await expectNoHorizontalOverflow(page);
        for (const c of await contrastIssues(page)) problems.push(`${theme} ${size.width}: ${c}`);
        if (size.width === 1280) await s.inView?.(page);
        await shoot(page, SHOTS, `w6c-${s.name}`, theme);
      }
      if (theme === "paper") for (const g of await focusRingGaps(page)) problems.push(`focus: ${g}`);
    }
    expect(problems).toEqual([]);
    expect(errors).toEqual([]);
  });
}

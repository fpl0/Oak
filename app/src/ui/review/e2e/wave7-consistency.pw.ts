// Wave 7 consistency pass over the Wave 6 surfaces, with fresh eyes: the key strip (C7's second day), the device
// counter and the master step (CF-A's last session), and the end of the core — Today the day after, the finished
// album (Side A, twelve tracks), Progress, and Settings › Learning with the tracks as places — in both themes at both
// reference sizes. Each is read for one product: no horizontal overflow, every text run AA on its surface, a visible
// focus ring on every stop of the first keyboard pass, no page error. Screenshots go to ./screenshots (w7c-*).
//
// One page per state (wave5.md §7.1): a learner is seeded once per state and each page loads once; the theme and
// the size change in place.
import { expect, type Page, test } from "@playwright/test";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import {
  animationsDone,
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

const heading = (p: Page) => expect(p.locator("main h1").first()).toBeVisible({ timeout: 30_000 });
const title = (p: Page) => expect(p.getByTestId("page-title")).toBeVisible({ timeout: 20_000 });

interface View {
  name: string;
  path: string;
  ready(page: Page): Promise<void>;
}

const STATES: readonly { point: string; views: readonly View[] }[] = [
  // The key strip over C7's song (its second day: the lift written).
  { point: "C7.S2 done", views: [{ name: "capstone-c7-key-strip", path: "/capstone/C7", ready: heading }] },
  // The device counter and the master step of the core finale.
  {
    point: "CF-A.S3 done",
    views: [{ name: "capstone-cf-a-master", path: "/capstone/CF-A", ready: heading }],
  },
  // The end of the core: Today the day after, the finished album, Progress, the tracks in Settings.
  {
    point: "core complete",
    views: [
      { name: "today-after-core", path: "/", ready: title },
      {
        name: "album-finished",
        path: "/album",
        ready: (p) => expect(p.getByTestId("album-title")).toBeVisible({ timeout: 20_000 }),
      },
      { name: "progress-after-core", path: "/progress", ready: title },
      {
        name: "settings-tracks",
        path: "/settings/learning",
        ready: (p) => expect(p.getByTestId("settings-tracks")).toBeVisible({ timeout: 20_000 }),
      },
    ],
  },
];

for (const s of STATES) {
  test(`${s.point}: ${s.views.map((v) => v.name).join(", ")} read as one product (overflow, AA, focus)`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await seed(page, s.point);
    await useUiPrefs(page, { theme: "paper", motion: "off" });
    const problems: string[] = [];
    for (const v of s.views) {
      await page.setViewportSize(SIZES[0]);
      await page.goto(v.path);
      await v.ready(page);
      await settled(page);
      for (const theme of ["paper", "bark"] as const) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);
        for (const size of SIZES) {
          await page.setViewportSize(size);
          await animationsDone(page);
          await expectNoHorizontalOverflow(page);
          for (const c of await contrastIssues(page)) problems.push(`${v.name} ${theme} ${size.width}: ${c}`);
          await shoot(page, SHOTS, `w7c-${v.name}`, theme);
        }
      }
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "paper";
      });
      for (const g of await focusRingGaps(page)) problems.push(`${v.name} focus: ${g}`);
    }
    expect(problems).toEqual([]);
    expect(errors).toEqual([]);
  });
}

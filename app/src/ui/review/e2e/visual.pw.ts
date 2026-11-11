// Every surface of the review scope, screenshotted in Paper and Bark at 1440×900 and 1280×800 at a late point of
// the course (C1 released: every Wave 2 tool, a released album, a grown Oak), checked for horizontal overflow.
import { expect, test } from "@playwright/test";
import { api, createSketch, expectNoHorizontalOverflow, matrix, seed } from "./support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

test("C1 released: studio, toolbox, oak, album, capstone", async ({ page }) => {
  test.setTimeout(600_000);
  await seed(page, "C1 released");
  const sketchId = await createSketch(
    page,
    "Evening loop",
    'setcpm(90/4)\n\ndrums: s("bd hh sd hh")\nbass: note("c2 a1 f1 g1").s("sawtooth").lpf(600)\n',
  );
  const album = await api<{ tracks: { id: string }[] }>(page, "GET", "/album");
  const trackId = album.body.tracks[0]?.id;
  const toolId = "tb.s";

  const surfaces: [string, string, (p: import("@playwright/test").Page) => Promise<void>][] = [
    [
      "/studio",
      "studio-index",
      async (p) => void (await expect(p.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 })),
    ],
    [
      `/studio/${sketchId}`,
      "studio-sketch",
      async (p) => void (await expect(p.locator(".cm-content").first()).toBeVisible({ timeout: 30_000 })),
    ],
    [
      "/toolbox",
      "toolbox-index",
      async (p) => void (await expect(p.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 })),
    ],
    [
      `/toolbox/${toolId}`,
      "toolbox-tool",
      async (p) => void (await expect(p.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 })),
    ],
    [
      "/oak",
      "oak",
      async (p) => void (await expect(p.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 })),
    ],
    [
      "/album",
      "album",
      async (p) => void (await expect(p.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 })),
    ],
    ...(trackId
      ? [
          [
            `/album/${trackId}`,
            "album-track",
            async (p: import("@playwright/test").Page) =>
              void (await expect(p.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 })),
          ] as [string, string, (p: import("@playwright/test").Page) => Promise<void>],
        ]
      : []),
    [
      "/capstone/C1",
      "capstone-c1",
      async (p) => void (await expect(p.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 })),
    ],
  ];
  for (const [path, name, ready] of surfaces) {
    await matrix(page, path, name, async (p) => {
      await ready(p);
      await p.waitForTimeout(600);
      await expectNoHorizontalOverflow(p);
    });
  }
});

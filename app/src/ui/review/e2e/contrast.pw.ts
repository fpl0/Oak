// WCAG 2.2 AA text contrast on every surface of the review scope, in Paper and Bark, with the tutor panel docked
// at 1280×800 (the narrowest supported layout: nothing may overflow sideways either).
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { api, contrastIssues, createSketch, expectNoHorizontalOverflow, seed } from "./support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

let paths: string[] = [];
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await seed(page, "C1 released");
  const sketch = await createSketch(
    page,
    "Contrast",
    'setcpm(90/4)\n\ndrums: s("bd hh sd hh")\nbass: note("c2 g1").s("sawtooth")\n',
  );
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

for (const theme of ["paper", "bark"] as const)
  test(`text contrast meets AA in ${theme}`, async ({ page }) => {
    test.setTimeout(300_000);
    await useUiPrefs(page, { theme, motion: "off" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      const key = "oak.ui.v1";
      const cur = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...cur, tutorOpen: true }));
    });
    const problems: Record<string, string[]> = {};
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("#main")).toBeVisible();
      await page.waitForTimeout(1500);
      await expectNoHorizontalOverflow(page);
      const bad = await contrastIssues(page);
      if (bad.length) problems[path] = bad;
    }
    expect(problems).toEqual({});
  });

// The Oak with no leaf grown and with every leaf mastered, and the Toolbox reached by deep links to locked and
// unknown tools (and `/studio?try=` with them): every state says what it is and what to do next.
import { expect, type Page, test } from "@playwright/test";
import { skills } from "../../../../../content/skills.ts";
import { useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { api, expectNoHorizontalOverflow, matrix, seed } from "./support.ts";

test.describe.configure({ mode: "serial" });
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

const oakReady = async (p: Page) => {
  await expect(p.getByRole("heading", { level: 1, name: "The Oak" })).toBeVisible({ timeout: 30_000 });
  await expect(p.locator("[aria-busy=true]")).toHaveCount(0, { timeout: 30_000 });
  await p.waitForTimeout(400);
  await expectNoHorizontalOverflow(p);
};

test("no leaf grown yet: the Oak, its three views, and the next step", async ({ page }) => {
  await seed(page, "onboarded");
  for (const view of ["tree", "course", "leaves"])
    await matrix(page, `/oak?view=${view}`, `oak-none-${view}`, oakReady);
  await page.goto("/oak");
  await expect(page.getByText(/0 of \d+ leaves grown/)).toBeVisible();
});

test("every leaf mastered: the Oak in full leaf", async ({ page }) => {
  await seed(page, "C1 released");
  const at = new Date().toISOString();
  await page.route("**/api/skills/map", (r) =>
    r.fulfill({
      json: {
        reviveSec: 180,
        nodes: skills.map((s) => ({
          skillId: s.id,
          P: 0.95,
          R: 0.95,
          D: 5,
          M: 0.9,
          level: "mastered",
          debt: false,
          debtReason: null,
          provisional: false,
          paused: false,
          freshness: 1,
          drying: false,
          updatedAt: at,
        })),
      },
    }),
  );
  for (const view of ["tree", "leaves"]) await matrix(page, `/oak?view=${view}`, `oak-all-${view}`, oakReady);
  await page.goto("/oak");
  await expect(
    page.getByText(`${skills.length} of ${skills.length} leaves grown.`, { exact: true }),
  ).toBeVisible();
});

test("deep links to a locked tool, an unknown tool, and trying them in the Studio", async ({ page }) => {
  await seed(page, "onboarded");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await matrix(page, "/toolbox/tb.lpf", "toolbox-locked", async (p) => {
    await expect(p.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(p);
  });
  await page.goto("/toolbox/tb.lpf");
  await expect(page.getByText(/unlocks|Unlocks|locked/).first()).toBeVisible();
  // A locked tool offers no way to use it early.
  await expect(page.getByRole("button", { name: /Open in Studio/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Open in Studio/ })).toHaveCount(0);

  await matrix(page, "/toolbox/tb.nope", "toolbox-unknown", async (p) => {
    await expect(p.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  });
  await expect(page.getByRole("link", { name: /Toolbox/ }).first()).toBeVisible();

  const before = (await api<{ items: unknown[] }>(page, "GET", "/sketches")).body;
  await page.goto("/studio?try=tb.lpf");
  await expect(page.getByText(/isn't unlocked yet/)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/studio$/);
  await page.goto("/studio?try=tb.nope");
  await expect(page.getByText("That tool isn't in the toolbox")).toBeVisible({ timeout: 30_000 });
  const after = (await api<{ items: unknown[] }>(page, "GET", "/sketches")).body;
  expect(after.items.length).toBe(before.items.length);
});

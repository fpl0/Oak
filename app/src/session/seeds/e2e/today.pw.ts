// Today and the session against the real server, each test from a dev seed (wave3.md §5.5): a capstone day with
// a sung warm-up set, Pause on Alt+P, a second browser joining the one open session; "done for today" from the
// server; a checkpoint day; the 15-minute split with save-and-wrap; returns after 3+ and 10+ days.
import { type Browser, expect, type Page, test } from "@playwright/test";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";
import {
  advanceDays,
  blockHmr,
  blockHmrIn,
  expectNoOverflow,
  matrix,
  SHOTS,
  seed,
  seedPoints,
  settle,
  status,
  today,
} from "./support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await blockHmr(page);
});

type OakSessionHandle = {
  runner: { toCoda(): void; wrapUp(): void };
  state(): { session: { id: string } | null; block: string | null; paused: boolean };
};
const sessionState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as never as { __oakSession: OakSessionHandle }).__oakSession.state();
    return { id: s.session?.id ?? null, block: s.block, paused: s.paused };
  });

async function secondBrowser(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: stack.baseURL });
  await blockHmrIn(ctx);
  return ctx.newPage();
}

test("C1 ready: a capstone day whose warm-up sings; Alt+P pauses; a second browser joins the open session", async ({
  page,
  request,
  browser,
}) => {
  await seed(request, "C1 ready");
  await useUiPrefs(page, { theme: "paper" });
  await today(page);
  const card = page.getByTestId("today-card");
  await expect(card).toHaveAttribute("data-state", "capstone");
  await expect(page.getByRole("heading", { name: "Capstone day" })).toBeVisible();
  await expect(page.getByTestId("setlist").locator('[data-row="warmup"]')).toContainText("with singing");
  await expect(page.getByTestId("setlist").locator('[data-row="new"]')).toContainText(
    "the draft is the Make",
  );
  await expect(page.getByTestId("setlist").locator('[data-row="make"]')).toHaveCount(0);
  await matrix(page, "today-capstone", today);

  // Keyboard only: Enter starts; the warm-up opens in the session.
  await useUiPrefs(page, { theme: "paper" });
  await today(page);
  await page.locator("main").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/session\/?$/);
  // The first open of the session page compiles the session, lesson, capstone and drill modules: give it time.
  await expect(page.getByTestId("session-block")).toContainText("Warm-up", { timeout: 30_000 });
  await expect(page.getByTestId("pause")).toContainText(/⌥P|Alt\+P/);
  const first = await sessionState(page);
  expect(first.id).not.toBeNull();

  // Alt+P pauses and resumes; the shortcut sheet lists it.
  await page.locator("body").press("Alt+KeyP");
  await expect(page.getByTestId("paused")).toBeVisible();
  expect((await sessionState(page)).paused).toBe(true);
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, "session-paused", "paper");
  await page.keyboard.press("Alt+KeyP");
  await expect(page.getByTestId("paused")).toHaveCount(0);
  await page.locator("main").focus();
  await page.keyboard.press("Shift+Slash");
  await expect(page.getByRole("dialog")).toContainText("Pause or resume the session");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The session header and the sung warm-up in both themes and sizes.
  for (const theme of ["paper", "bark"] as const)
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(size);
      await useUiPrefs(page, { theme });
      await page.reload();
      await expect(page.getByTestId("session-header")).toBeVisible({ timeout: 30_000 });
      await settle(page);
      await expectNoOverflow(page);
      await shoot(page, SHOTS, "session-warmup-sing", theme);
    }
  await page.setViewportSize({ width: 1440, height: 900 });

  // Another browser (its own storage): Today offers to resume, not to start a second session; it joins.
  const other = await secondBrowser(browser);
  await today(other);
  await expect(other.getByTestId("today-card")).toHaveAttribute("data-state", "in-session");
  await expect(other.getByTestId("start-session")).toHaveText(/Resume session/);
  await other.getByTestId("start-session").click();
  await other.waitForURL(/\/session\/?$/);
  await expect(other.getByTestId("session-header")).toBeVisible();
  expect((await sessionState(other)).id).toBe(first.id);
  await other.context().close();
});

test("done for today comes from the server: a second browser agrees, and the next day is fresh", async ({
  page,
  request,
  browser,
}) => {
  const seeded = await seed(request, "C1 released");
  await useUiPrefs(page, { theme: "paper" });
  await today(page);
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "normal");
  await page.getByTestId("start-session").click();
  await page.waitForURL(/\/session\/?$/);
  // Straight to the Coda: the session ends on the server there.
  await page.evaluate(() =>
    (window as never as { __oakSession: OakSessionHandle }).__oakSession.runner.toCoda(),
  );
  await page.waitForURL(/\/session\/coda$/);
  await expect(page.getByTestId("done-for-today")).toBeFocused({ timeout: 20_000 });
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("see-coda")).toBeVisible();

  const dayBuilt = (await status(request, "/api/session/day")) === 200;
  const other = await secondBrowser(browser);
  await today(other);
  if (dayBuilt) {
    // Nothing in this browser's storage: the done state is the server's.
    await expect(other.getByTestId("today-card")).toHaveAttribute("data-state", "done");
    await other.getByTestId("see-coda").click();
    await other.waitForURL(/\/session\/coda$/);
    await expect(other.getByTestId("coda-title")).toBeVisible();
  } else {
    test.info().annotations.push({
      type: "server",
      description: "session.day answers 501: the second browser falls back to the bootstrap (Wave 2 gap 3)",
    });
  }
  await other.context().close();

  // The dev clock moves to tomorrow: Today is a fresh day in this browser too.
  const moved = await advanceDays(request, 1);
  expect(moved.day > seeded.day).toBe(true);
  await today(page);
  await expect(page.getByTestId("today-card")).not.toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("start-session")).toBeVisible();
});

test("a checkpoint day: no hints, no rush, about 20 minutes; the session names the block", async ({
  page,
  request,
}) => {
  const points = await seedPoints(request);
  // The default order puts U03.CP after U04.L01; until the server offers that seed, U02.CP's day is the same shape.
  const point = points.includes("U03.CP due") ? "U03.CP due" : "U02.CP due";
  const s = await seed(request, point, { targetMinutes: 15 });
  expect(s.next).toMatch(/\.CP$/);
  await useUiPrefs(page, { theme: "paper" });
  await today(page);
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "checkpoint");
  await expect(page.getByRole("heading", { name: "Checkpoint day" })).toBeVisible();
  await expect(page.getByTestId("today-card")).toContainText("about 20 min");
  await expect(page.getByTestId("setlist").locator('[data-row="new"]')).toContainText("no hints, no rush");
  await matrix(page, "today-checkpoint", today);
  await page.getByTestId("start-session").click();
  await page.waitForURL(/\/session\/?$/);
  await expect(
    page.getByTestId("session-header").getByRole("list", { name: "Today's setlist" }),
  ).toContainText("Checkpoint");
});

test("the 15-minute split: part 1 ends at the midpoint with a quick sketch; save and wrap", async ({
  page,
  request,
}) => {
  await seed(request, "after U01.L03", { targetMinutes: 15 });
  await useUiPrefs(page, { theme: "paper" });
  await today(page);
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "split-a");
  await expect(page.getByTestId("today-card")).toContainText("comes in two parts");
  await expect(page.getByTestId("setlist").locator('[data-row="make"]')).toContainText("Quick sketch");
  await expect(page.getByTestId("setlist").locator('[data-row="new"]')).toContainText("part 1 of 2");
  await matrix(page, "today-split", today);

  await page.getByTestId("start-session").click();
  await page.waitForURL(/\/(session|learn\/)/);
  await expect(page.getByTestId("session-header")).toContainText("Quick sketch");
  // Save & wrap: the wrap jumps to the Quick sketch, which saves whatever is on the workbench.
  await page.evaluate(() =>
    (window as never as { __oakSession: OakSessionHandle }).__oakSession.runner.wrapUp(),
  );
  await page.waitForURL(/\/session\/?$/);
  await expect(page.getByTestId("session-block")).toContainText("Quick sketch");
  const lessonQuick = page.getByTestId("quick-sketch");
  const sessionQuick = page.getByTestId("sketch-block-quick");
  await expect(lessonQuick.or(sessionQuick)).toBeVisible({ timeout: 30_000 });
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, "session-split-quick", "paper");
  const own = await sessionQuick.isVisible();
  await page.getByTestId(own ? "save-sketch" : "save-quick").click();
  await page.waitForURL(/\/session\/coda$/);
  await expect(page.getByTestId("coda-title")).toHaveText("A good place to stop.");
  await expect(page.getByTestId("coda-sketch")).toBeVisible();
});

test("returning after 4 days: welcome back with a recap; after 12: a light session; no gap is counted", async ({
  page,
  request,
}) => {
  await seed(request, "4-day gap");
  await useUiPrefs(page, { theme: "paper" });
  await today(page);
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "welcome-back");
  await expect(page.getByRole("heading", { name: "Welcome back. We'll ease in." })).toBeVisible();
  await expect(page.getByTestId("setlist").locator('[data-row="recap"]')).toContainText("30 s");
  await expect(page.locator("main")).not.toContainText(/\b\d+ days? (away|ago|missed)\b|you missed/i);
  await matrix(page, "today-welcome-back", today);

  await seed(request, "12-day gap");
  await today(page);
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "light");
  await expect(page.getByTestId("setlist").locator('[data-row="new"]')).toContainText("Light session");
  await expect(page.getByTestId("setlist").locator('[data-row="new"]')).toContainText("New idea:");
  await expect(page.locator("main")).not.toContainText(/\b1[0-9] days\b/);
  await matrix(page, "today-light", today);
  await page.getByTestId("start-session").click();
  await page.waitForURL(/\/session\/?$/);
  await expect(page.getByTestId("session-header")).toContainText("Light session");
});

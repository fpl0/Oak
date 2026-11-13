// A learner's day through U03–U04 against the real server, each test from a dev seed (wave3.md §5.5): the U03.CP
// and U04.CP checkpoint days; the edge of what is written (U04.CP passed, U05 not written yet) on Today, the Oak
// and Progress; Today's done state straight after onboarding; the one-tap loosen calling the real ladder
// endpoint; and a session that crosses the 04:00 rollover, with its unlock ceremony and Coda.
import { type Browser, expect, type Page, test } from "@playwright/test";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";
import {
  advanceDays,
  api,
  blockHmr,
  blockHmrIn,
  expectNoOverflow,
  matrix,
  SHOTS,
  seed,
  settle,
  today,
} from "./support.ts";

test.beforeEach(async ({ page }) => {
  await blockHmr(page);
});

type OakSessionHandle = {
  runner: { toCoda(): void };
  report(r: unknown): void;
  state(): { plan: { warmup: { items: { id: string }[] } } | null; block: string | null };
};

/** Every warm-up set reported skipped, so the session moves on to its New block. */
async function skipWarmup(page: Page): Promise<void> {
  await page.evaluate(() => {
    const o = (window as never as { __oakSession: OakSessionHandle }).__oakSession;
    for (const item of o.state().plan?.warmup.items ?? [])
      o.report({
        block: "warmup",
        source: "drills",
        warmupItemId: item.id,
        drillSessionId: null,
        meanCredit: null,
        skipped: true,
      });
  });
}

const toCoda = (page: Page) =>
  page.evaluate(() => (window as never as { __oakSession: OakSessionHandle }).__oakSession.runner.toCoda());

async function secondBrowser(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: stack.baseURL });
  await blockHmrIn(ctx);
  return ctx.newPage();
}

test("checkpoint days: U03.CP and U04.CP are the day's New block, and the checkpoint opens in the session", async ({
  page,
  request,
}) => {
  await useUiPrefs(page, { theme: "paper" });
  for (const cp of ["U03.CP", "U04.CP"] as const) {
    await seed(request, `${cp} due`);
    const plan = await api<{ kind: string; mapItemId: string | null }>(request, "GET", "/api/session/today");
    expect(plan).toMatchObject({ kind: "checkpoint", mapItemId: cp });
    await today(page);
    const card = page.getByTestId("today-card");
    await expect(card).toHaveAttribute("data-state", "checkpoint");
    await expect(page.getByRole("heading", { name: "Checkpoint day" })).toBeVisible();
    await expect(page.getByTestId("setlist").locator('[data-row="new"]')).toContainText("no hints, no rush");
    if (cp === "U04.CP") {
      await matrix(page, "today-u04-cp", today);
      await useUiPrefs(page, { theme: "paper" });
    }
    await page.getByTestId("start-session").click();
    await page.waitForURL(/\/session\/?$/);
    // The first open of the session page compiles the session, lesson and drill modules: give it time.
    await expect(
      page.getByTestId("session-header").getByRole("list", { name: "Today's setlist" }),
    ).toContainText("Checkpoint", { timeout: 30_000 });
    await skipWarmup(page);
    await expect(page.getByTestId("checkpoint-intro")).toBeVisible({ timeout: 30_000 });
    await settle(page);
    await expectNoOverflow(page);
    await shoot(page, SHOTS, `session-${cp.toLowerCase().replace(".", "-")}`, "paper");
  }
});

test("the edge of what's written: Today, the Oak and Progress say so; review, Studio and practice stay open", async ({
  page,
  request,
}) => {
  // Wave 3 ended at U04.CP with U05 unwritten; Wave 4 authors U05 lesson by lesson (U05.L01 first), so the seed
  // completes what is written and the edge is the first U05 lesson nobody has written yet.
  const s = await seed(request, "after U04.CP");
  expect(s.next ?? "").toMatch(/^U05\.L0\d$/);
  const plan = await api<{ kind: string }>(request, "GET", "/api/session/today");
  test.skip(
    plan.kind !== "review",
    `${s.next} is written: the edge moved on (w4-days.pw.ts covers it past X1)`,
  );
  const next = s.next as string;
  /** The leaf the next lesson introduces (contracts §4). */
  const leaf =
    {
      "U05.L01": "C01",
      "U05.L02": "C02",
      "U05.L03": "C03",
      "U05.L04": "N05",
      "U05.L05": "C04",
      "U05.L06": "N04",
      "U05.L07": "C05",
    }[next] ?? "C05";
  await useUiPrefs(page, { theme: "paper" });
  await today(page);
  const card = page.getByTestId("today-card");
  await expect(card).toHaveAttribute("data-state", "edge");
  await expect(card.getByRole("heading", { name: "The edge of what's written" })).toBeVisible();
  await expect(card).toContainText("still being written");
  await expect(card).toContainText(next === "U05.L01" ? "through Intervals" : "The rest of Triads");
  await expect(page.getByTestId("setlist").locator('[data-row="warmup"]')).toBeVisible();
  // No dead doors: the next unlock names where it comes from, the Studio chip is the server's, once.
  await expect(page.getByTestId("goal-gradient")).toContainText("still being written");
  const other = page.getByRole("navigation", { name: "Other ways today" });
  await expect(other.getByRole("link", { name: "Studio" })).toHaveCount(1);
  await expect(other.getByRole("link", { name: "Practice" })).toHaveAttribute("href", "/practice");
  await expect(page.locator("main")).not.toContainText(/behind|failed|lost/i);
  await matrix(page, "today-edge", today);
  await useUiPrefs(page, { theme: "paper" });

  // The Oak: what's next is named, and still being written; its lesson is never a link.
  await page.goto("/oak?view=tree");
  await expect(page.getByTestId("whats-next")).toContainText(next);
  await expect(page.getByTestId("whats-next")).toContainText("still being written");
  await page.locator(`[data-node="${leaf}"]`).focus();
  await page.keyboard.press("Enter");
  const panel = page.getByTestId("oak-panel");
  await expect(panel).toContainText("still being written");
  await expect(panel.locator(`a[href="/learn/${next}"]`)).toHaveCount(0);
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, "oak-edge-panel", "paper");
  await page.goto("/oak?view=course");
  const u05 = page.getByRole("heading", { name: /U05/ }).locator("..");
  await expect(u05.getByText("being written").first()).toBeVisible();
  // Course-view links carry `?from=map` (Wave 5: the lesson's end returns to the map).
  await expect(page.locator(`a[href^="/learn/${next}?"], a[href="/learn/${next}"]`)).toHaveCount(0);
  await expect(page.locator('a[href="/learn/U04.L04?from=map"]')).toHaveCount(1);

  // Progress: the same plain fact, with Practice and Studio.
  const progress = async (p: Page) => {
    await p.goto("/progress");
    await expect(p.getByTestId("progress-edge")).toBeVisible();
  };
  await progress(page);
  await expect(page.getByTestId("progress-edge")).toContainText(
    "You have reached the edge of what's written.",
  );
  await matrix(page, "progress-edge", progress);
  await useUiPrefs(page, { theme: "paper" });

  // The review session runs, ends, and Today is done with the edge named for next time.
  await useUiPrefs(page, { theme: "paper" });
  await today(page);
  await page.getByTestId("start-session").click();
  await page.waitForURL(/\/session\/?$/);
  await toCoda(page);
  await page.waitForURL(/\/session\/coda$/);
  await expect(page.getByTestId("done-for-today")).toBeFocused({ timeout: 20_000 });
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("today-done")).toContainText("still being written");
  await expect(page.getByTestId("see-coda")).toBeVisible();
  await settle(page);
  await shoot(page, SHOTS, "today-edge-done", "paper");
  // Studio from Today's done card opens.
  await page.getByRole("link", { name: "Keep playing in Studio" }).click();
  await page.waitForURL(/\/studio/);
});

test("straight after onboarding, Today is done in this browser and in another one; no Coda to point at", async ({
  page,
  request,
  browser,
}) => {
  await seed(request, "onboarded");
  // Onboarding finished yesterday: move the clock back to that day, as if the learner had just finished it.
  await advanceDays(request, -1);
  const day = await api<{ doneForToday: boolean; summarySessionId: string | null }>(
    request,
    "GET",
    "/api/session/day",
  );
  expect(day.doneForToday).toBe(true);
  await useUiPrefs(page, { theme: "paper" });
  await today(page);
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("today-done")).toContainText("Next time");
  // The Coda link is there only when a session of today has a summary: real onboarding has none (its Coda was
  // its own); the seeded learner's U00.L01 ran as a session, so the server names it and the link opens it.
  if (day.summarySessionId === null) await expect(page.getByTestId("see-coda")).toHaveCount(0);
  else {
    await page.getByTestId("see-coda").click();
    await page.waitForURL(/\/session\/coda$/);
    await expect(page.getByTestId("coda-title")).toBeVisible({ timeout: 20_000 });
    await today(page);
  }
  const other = await secondBrowser(browser);
  await today(other);
  await expect(other.getByTestId("today-card")).toHaveAttribute("data-state", "done");
  await other.context().close();
  // The next day is a fresh day.
  await advanceDays(request, 1);
  await today(page);
  await expect(page.getByTestId("start-session")).toBeVisible();
});

test("back after three weeks: the one-tap loosen calls the ladder endpoint and the tolerance moves one step", async ({
  page,
  request,
}) => {
  await seed(request, "21-day gap");
  // A learner whose ladder had tightened to ±35¢ before the break.
  await api(request, "PUT", "/api/voice/ladder", { mode: "fixed", cents: 35 });
  await api(request, "PUT", "/api/voice/ladder", { mode: "auto" });
  const before = await api<{ ladder: { cents: number; offerLoosen: boolean } }>(request, "GET", "/api/voice");
  expect(before.ladder).toMatchObject({ cents: 35, offerLoosen: true });
  await useUiPrefs(page, { theme: "paper" });
  await today(page);
  const loosen = page.getByTestId("loosen");
  await expect(loosen).toHaveText(/±50¢/);
  await settle(page);
  await shoot(page, SHOTS, "today-loosen", "paper");
  const put = page.waitForRequest(
    (r) =>
      r.method() === "PUT" &&
      r.url().endsWith("/api/voice/ladder") &&
      r.postData()?.includes("loosen") === true,
  );
  await loosen.click();
  await put;
  await expect(page.getByText("Singing is checked at ±50¢ now.")).toBeVisible();
  await expect(loosen).toHaveCount(0);
  const after = await api<{
    ladder: { cents: number; offerLoosen: boolean; lastChange: { reason: string } };
  }>(request, "GET", "/api/voice");
  expect(after.ladder.cents).toBe(50);
  expect(after.ladder.offerLoosen).toBe(false);
  expect(after.ladder.lastChange.reason).toBe("loosen");
});

/** The next instant at hh:mm in the learner's time zone (within a day of `from`). */
function nextLocal(from: Date, tz: string, hh: number, mm: number): Date {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const t = new Date(Math.ceil(from.getTime() / 60_000) * 60_000);
  for (let i = 0; i < 24 * 60 + 1; i++) {
    const [h, m] = fmt.format(t).split(":").map(Number);
    if (h === hh && m === mm) return t;
    t.setTime(t.getTime() + 60_000);
  }
  throw new Error(`no ${hh}:${mm} in ${tz}`);
}

test("a session that crosses the 04:00 rollover: the ceremony and the Coda play, reload, and count for the new day", async ({
  page,
  request,
}) => {
  await seed(request, "C1 released");
  const profile = await api<{ timezone: string; rolloverHour: number }>(request, "GET", "/api/profile");
  const clock = await api<{ now: string; day: string }>(request, "GET", "/api/dev/clock");
  const at = nextLocal(new Date(clock.now), profile.timezone, (profile.rolloverHour + 23) % 24, 55);
  const before = await api<{ day: string }>(request, "PUT", "/api/dev/clock", { at: at.toISOString() });
  // The session's own lesson unlocks the degree labels; the ceremony shows them as it would after U03.L02.
  await page.route(/\/api\/session\/[^/]+\/end$/, async (route) => {
    const body = (await (await route.fetch()).json()) as { unlocks: unknown[] };
    body.unlocks = [
      ...body.unlocks,
      {
        itemId: "tb.feature.degree-labels",
        kind: "feature",
        sourceKind: "session-complete",
        sourceId: "e2e",
        unlockedAt: new Date().toISOString(),
        seen: false,
      },
    ];
    await route.fulfill({ json: body });
  });
  // The Coda plays the ceremony for unlocks the learner has not seen yet (`unlocks.list`).
  await page.route(/\/api\/unlocks$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const body = (await (await route.fetch()).json()) as { items: { itemId: string }[] };
    if (!body.items.some((u) => u.itemId === "tb.feature.degree-labels"))
      body.items.push({
        itemId: "tb.feature.degree-labels",
        kind: "feature",
        sourceKind: "session-complete",
        sourceId: "e2e",
        unlockedAt: new Date().toISOString(),
        seen: false,
      } as never);
    await route.fulfill({ json: body });
  });
  await page.route(/\/api\/unlocks\/[^/]+\/seen$/, (route) => route.fulfill({ json: { ok: true } }));
  await useUiPrefs(page, { theme: "paper" });
  await today(page);
  await page.getByTestId("start-session").click();
  await page.waitForURL(/\/session\/?$/);
  // Ten minutes later it is past the rollover: a new learner day.
  const after = await api<{ day: string }>(request, "PUT", "/api/dev/clock", { advanceMs: 10 * 60_000 });
  expect(after.day > before.day).toBe(true);
  await toCoda(page);
  await page.waitForURL(/\/session\/coda$/);
  await expect(page.getByTestId("coda-unlock-moment")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("ceremony-tool")).toHaveText(/degree labels/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("done-for-today")).toBeFocused();
  await settle(page);
  await shoot(page, SHOTS, "coda-rollover", "paper");
  // The session counts for the day its end fell on.
  const day = await api<{ day: string; doneForToday: boolean; summarySessionId: string | null }>(
    request,
    "GET",
    "/api/session/day",
  );
  expect(day).toMatchObject({ day: after.day, doneForToday: true });
  expect(day.summarySessionId).not.toBeNull();
  // A reload keeps the Coda (the server's summary of today's last session).
  await page.reload();
  await expect(page.getByTestId("coda-title")).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/session\/coda$/);
  await page.getByTestId("done-for-today").click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("see-coda")).toBeVisible();
});

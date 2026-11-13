// Wave 5 review (review:journey), breaking the U08–U11 days on purpose:
//  - C3.S1 across the 04:00 day boundary, with a reload in the middle: the session belongs to the day it began, the
//    reload resumes the draft from the top with the form strip reading A B A B, the session finishes, Today is done,
//    and the next learner day opens session 2;
//  - the side lesson A1.L01 left half-way from Today's offer at U03: Today says the session is open, and the next
//    day the core lesson is the session again while the side lesson is offered once, to pick up where it was left;
//  - Quiet mode switched on in another tab in the middle of a minor-degree set in Practice: the sung way home goes,
//    the set goes on, the answer can still be heard alone and in context.
import { expect, type Page, test } from "@playwright/test";
import { C3_GROOVE } from "../../app/src/capstone/e2e/w5-pieces.ts";
import { setCapstoneCode, skipWarmup, startSession, today } from "../journey/w4-day.ts";
import { useUiPrefs } from "../support/ui.ts";
import { advanceDays, api, clockTo, resetClock, reviewMic, shootAll, watch } from "./support.ts";
import { quietHmr, seedPoint, setQuiet, step } from "./w4-support.ts";

test.use({ launchOptions: { args: reviewMic("hold-c4.wav") }, permissions: ["microphone"] });

test.afterEach(async ({ request }) => {
  await resetClock(request);
  await setQuiet(request, false);
});

type Plan = { kind: string; mapItemId: string; day: string; sideLesson?: { lessonId: string } | null };

test("C3.S1 across 04:00 with a reload: one session, the day it began; session 2 the next day", async ({
  page,
  request,
}) => {
  test.setTimeout(220_000);
  await clockTo(request, "2026-11-12T03:20:00Z");
  await seedPoint(request, "C3 open");
  await clockTo(request, "2026-11-12T03:40:00Z");
  await quietHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  const problems = watch(page);
  const plan = await api<Plan>(request, "GET", "/api/session/today");
  expect(plan).toMatchObject({ kind: "capstone", mapItemId: "C3.S1", day: "2026-11-11" });
  await today(page);
  await startSession(page);
  await skipWarmup(page);
  const start = page.getByRole("button", { name: "Start session 1 of 3" });
  const ws = page.getByTestId("capstone-workspace");
  await expect(ws.or(start)).toBeVisible({ timeout: 60_000 });
  if (await start.isVisible()) await start.click();
  await expect(ws).toBeVisible({ timeout: 60_000 });
  await setCapstoneCode(page, "C3", C3_GROOVE);
  await expect(page.getByTestId("form-letters")).toHaveText("A B A B", { timeout: 60_000 });
  await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });

  // 04:10: a new learner day has begun while the session is open; the tab is reloaded. The session started 30
  // minutes ago is still the open one (server/src/services/sessions.ts `openToday`, decision 52): the reload lands on
  // the resume card, or on Today's "Your session is open" with Resume, never on a new day's warm-up.
  await clockTo(request, "2026-11-12T04:10:00Z");
  const open = await api<{ open: { id: string; mapItemId: string } | null }>(
    request,
    "GET",
    "/api/session/day",
  );
  expect(open.open?.mapItemId).toBe("C3.S1");
  await page.reload();
  const card = page.getByTestId("capstone-resume");
  const resume = page.getByRole("button", { name: /Resume session/ });
  await expect(card.or(resume)).toBeVisible({ timeout: 60_000 });
  if (await resume.isVisible()) {
    await expect(page.getByRole("region", { name: "Your session is open" })).toBeVisible();
    await shootAll(page, "w5-break-c3-reload-after-0400-today");
    await resume.click();
  }
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).not.toContainText("doesn't run");
  await shootAll(page, "w5-break-c3-reload-after-0400");
  await page.getByTestId("resume-continue").click();
  await expect(ws).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("form-letters")).toHaveText("A B A B", { timeout: 60_000 });
  await page.getByTestId("finish-session").click();
  await page.waitForURL(/\/session\/coda$/, { timeout: 30_000 });
  await expect(page.locator("main")).toContainText("C3", { timeout: 30_000 });
  await page.getByTestId("done-for-today").click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 30_000 });
  // Today is done, not session 2 straight away.
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done", { timeout: 30_000 });
  const sessions = await api<{ sessions: { status: string }[] }>(
    request,
    "GET",
    "/api/capstones/C3/sessions",
  );
  expect(sessions.sessions.map((s) => s.status)).toEqual(["done", "open", "locked"]);
  // The next learner day: session 2 of 3.
  await advanceDays(request, 1);
  const next = await api<Plan>(request, "GET", "/api/session/today");
  expect(next).toMatchObject({ kind: "capstone", mapItemId: "C3.S2" });
  expect(problems).toEqual([]);
});

type H = {
  state(): { plan: { warmup: { items: { id: string }[] } } | null; block: string | null };
  report(r: unknown): void;
};
async function skipTheWarmup(page: Page) {
  await expect
    .poll(
      async () => page.evaluate(() => (window as never as { __oakSession: H }).__oakSession.state().block),
      {
        timeout: 30_000,
      },
    )
    .not.toBeNull();
  await page.evaluate(() => {
    const o = (window as never as { __oakSession: H }).__oakSession;
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

test("A1.L01 left half-way at U03: the session stays open today; tomorrow the core, and the side lesson offered to pick up", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  await seedPoint(request, "side lesson offered");
  await quietHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  await page.goto("/");
  await expect(page.getByTestId("side-offer")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("side-offer-start").click();
  await page.waitForURL(/\/session\/?$/);
  await skipTheWarmup(page);
  await expect(step(page)).toHaveAttribute("data-step", "S1", { timeout: 60_000 });
  for (const s of ["S1", "S2"]) {
    await expect(step(page)).toHaveAttribute("data-step", s, { timeout: 30_000 });
    if (s === "S2") {
      await step(page).locator("[data-option]").first().click();
      await page.getByTestId("check").click();
      await expect(page.getByTestId("predict-outcome")).toBeVisible({ timeout: 30_000 });
    }
    await expect(page.getByTestId("continue")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("continue").click();
  }
  await expect(step(page)).toHaveAttribute("data-step", "S3", { timeout: 30_000 });
  // Left by the header's Today link, half-way.
  await page.getByRole("link", { name: /Today/ }).first().click();
  await expect(page.getByTestId("today-card")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("main")).toContainText("Your session is open");
  await shootAll(page, "w5-break-side-left-today");
  // The next learner day: the core lesson is the session; the side lesson is offered once, to pick up.
  await advanceDays(request, 1);
  const plan = await api<Plan>(request, "GET", "/api/session/today");
  expect(plan).toMatchObject({ kind: "lesson", mapItemId: "U03.L03" });
  await page.goto("/");
  const offer = page.getByTestId("side-offer");
  await expect(offer).toBeVisible({ timeout: 30_000 });
  await expect(offer).toContainText(/where you left it/);
  await expect(page.locator("main")).not.toContainText(/behind|overdue|unfinished/i);
  await shootAll(page, "w5-break-side-next-day");
  // Picking it up starts at the step it was left at.
  await page.getByTestId("side-offer-start").click();
  await page.waitForURL(/\/session\/?$/);
  await skipTheWarmup(page);
  await expect(step(page)).toHaveAttribute("data-step", "S3", { timeout: 60_000 });
  await expect(page.getByTestId("side-lesson-note")).toContainText("Optional side lesson");
  expect(problems).toEqual([]);
});

test("Quiet mode switched on in another tab in the middle of a minor-degree set", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(200_000);
  await seedPoint(request, "after U10.L05");
  await setQuiet(request, false);
  await quietHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  const problems = watch(page);
  await page.goto("/practice/fam.deg.fet-minor");
  await expect(page.getByTestId("start-set")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("start-set").click();
  const block = page.getByTestId("listen-block");
  const counter = page.getByTestId("trial-counter");
  await expect(block.or(counter)).toBeVisible({ timeout: 60_000 });
  if (await block.isVisible()) await page.getByRole("button", { name: /Start the set/ }).click();
  type T = { expected: { degrees: string[] }; params: { key: { mode: string } } };
  const trial = async () =>
    (await page.evaluate(() => (globalThis as { __oakDrillTrial?: unknown }).__oakDrillTrial)) as T;
  const answer = async () => {
    await expect(page.getByTestId("stage-text")).toHaveText("Your turn.", { timeout: 60_000 });
    const t = await trial();
    // The key is set as minor: the trial is in a minor key, the cadence can be heard again.
    expect(t.params.key.mode).toMatch(/minor/);
    await expect(page.getByRole("button", { name: /^Cadence/ })).toBeVisible();
    await page.locator("[data-degree]").first().focus();
    await page.keyboard.press((t.expected.degrees[0] as string).replace(/^[b#]/, ""));
    await expect(page.getByTestId("trial-feedback")).toHaveAttribute("data-correct", "true", {
      timeout: 30_000,
    });
  };
  await expect(counter).toHaveText(/Trial 1 of/, { timeout: 60_000 });
  // Answered until a trial asks for the way home to be sung (not every trial does).
  let n = 1;
  for (; n <= 6; n++) {
    await answer();
    if (/Sing it home/.test((await page.getByTestId("next-trial").textContent()) ?? "")) break;
    await page.getByTestId("next-trial").click();
    await expect(counter).toHaveText(new RegExp(`Trial ${n + 1} of`), { timeout: 60_000 });
  }
  await expect(page.getByTestId("next-trial")).toContainText("Sing it home");
  const other = await context.newPage();
  await quietHmr(other);
  await other.goto("/settings/voice");
  const control = other.getByTestId("quiet-control");
  await expect(control).toBeVisible({ timeout: 60_000 });
  await control.getByRole("switch").click();
  await expect(control).toHaveAttribute("data-quiet", "1", { timeout: 20_000 });
  await other.close();
  // Quiet now: the way home is heard, not sung, already on this trial.
  await expect(page.getByTestId("next-trial")).not.toContainText("Sing it home", { timeout: 20_000 });
  await shootAll(page, "w5-break-minor-quiet-mid-set");
  await expect(page.getByTestId("next-trial")).toContainText("Hear it home");
  await page.getByTestId("next-trial").click();
  await expect(page.getByTestId("quiet-resolution")).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Space");
  await expect(page.getByTestId("trial-feedback")).toContainText("Heard home, in your head.", {
    timeout: 30_000,
  });
  await page.getByTestId("next-trial").click();
  await expect(counter).toHaveText(new RegExp(`Trial ${n + 1} of`), { timeout: 60_000 });
  await answer();
  await expect(page.getByTestId("next-trial")).not.toContainText("Sing it home");
  // The answer alone and in context, after it.
  await expect(page.getByRole("button", { name: /The note alone/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Hear it in context/ })).toBeVisible();
  expect(problems).toEqual([]);
});

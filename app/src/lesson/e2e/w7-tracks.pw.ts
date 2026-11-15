// The advanced tracks in the lesson and checkpoint players with the core unfinished (Wave 7, wave7.md §5.1–§5.3,
// §10 items 18–19):
// - J2.L04 passed over (seed "J2.L04 locked (U14.CP not passed)": J1–J2.L03 done, U14.CP not passed): its page says
//   it waits for U14.CP and the track goes on without it (never a failure); J3.L01 opens; J.CP1 can be started;
// - from the dev seed just after U13.CP (the Jazz and Rhythm tracks open, U14.L02 the core's next lesson): J5.L01's
//   gate is U17.CP; J2.L01 follows J1.L05; J.CP1 before it is due says what it covers, when it opens and that it
//   holds back only "ii–V Ballad" (read in Paper and Bark at 1440×900 and 1280×800, one page per state);
// - J1.L01 at the 15-minute target splits as a core lesson does: part A ends at its wrapAt with a Quick sketch, the
//   server keeps part A, part B starts after it; the core's next lesson is untouched;
// - J1.L01 as the day's New block (the learner's focus on Jazz, wave7.md §5.2): started from Today, the warm-up,
//   the lesson inside its session, the session's Coda; the core is not moved on.
import type { Page } from "@playwright/test";
import { RAW, visibleText } from "./cpwalk.ts";
import { expect, setCode, stepIs, test } from "./support.ts";
import { api, reseedFresh, seed, setQuiet } from "./w3support.ts";
import { lessonDefW5 } from "./w5walk.ts";
import { lookAt } from "./w7look.ts";
import { walkLesson } from "./walk.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

/** U13.CP passed yesterday: J and R open; the core's next lesson is U14.L02. */
const CORE_UNFINISHED = "after U13.CP";

type Progress = {
  lessons: { lessonId: string; status: string; splitPart: string | null }[];
};
const progressOf = async (page: Page, id: string) =>
  (await api<Progress>(page, "GET", "/lessons/progress")).body?.lessons.find((l) => l.lessonId === id);
type TodayPlan = { kind: string; mapItemId: string | null };

test("J2.L04 passed over without U14.CP: it waits, said plainly; J3.L01 and J.CP1 do not wait for it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // J1–J2.L03 done, U13.CP passed, U14.CP not: the track goes on to J.CP1 and J3 (wave7.md §5.1).
  await seed(page, "J2.L04 locked (U14.CP not passed)");
  await setQuiet(page, false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/learn/J2.L04");
  const line = page.getByTestId("track-locked");
  await expect(line).toBeVisible({ timeout: 30_000 });
  await expect(line).toHaveAttribute("data-kind", "waiting");
  await expect(line).toContainText(
    /^Chord-Scales is waiting for one thing: .+ passed\. The track goes on without it/,
  );
  await expect(line).not.toContainText(/fail|missing|\d+ more|locked/i);
  await lookAt(page, "w7-j2l04-waiting");
  // The lesson after it in the track is not held: it opens at its first step.
  await page.goto("/learn/J3.L01");
  await stepIs(page, "S1");
  await expect(page.getByTestId("track-locked")).toHaveCount(0);
  expect((await progressOf(page, "J3.L01"))?.status, "J3.L01 not locked").not.toBe("locked");
  // The checkpoint over J1–J2.L03 is due and can be started: it never waits for J2.L04 either.
  await page.goto("/checkpoint/J.CP1");
  await expect(page.getByTestId("start-checkpoint")).toBeVisible({ timeout: 30_000 });
});

test("J5.L01's gate and J2.L01's previous lesson, said plainly; J.CP1 before it is due holds back only ii–V Ballad", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await seed(page, CORE_UNFINISHED);
  await page.setViewportSize({ width: 1440, height: 900 });
  // J5.L01 (written): its gate is U17.CP, not met at U13 — one line, the server's own words.
  await page.goto("/learn/J5.L01");
  const gate = page.getByTestId("track-locked");
  await expect(gate).toBeVisible({ timeout: 30_000 });
  await expect(gate).toHaveAttribute("data-kind", "gate");
  await expect(gate).toHaveText(
    /^Tritone Substitution is waiting for one thing: .+ checkpoint passed\. Today has your next step\.$/,
  );
  await expect(gate).not.toContainText(/fail|missing|\d+ more/i);
  // The way on is Today (a link, reachable by keyboard); the preview is for development only.
  await expect(page.getByRole("link", { name: "Back to Today" })).toBeVisible();
  await lookAt(page, "w7-j5l01-gate");
  // J2.L01 (written): its gate is met; the lesson before it in the track is not done.
  await page.goto("/learn/J2.L01");
  const prev = page.getByTestId("track-locked");
  await expect(prev).toBeVisible({ timeout: 30_000 });
  await expect(prev).toHaveText("All Twelve Keys opens after J1.L05 Shells. Today has your next step.");

  await page.goto("/checkpoint/J.CP1");
  const intro = page.getByTestId("checkpoint-intro");
  await expect(intro).toBeVisible({ timeout: 30_000 });
  await expect(intro).toContainText("A short check of J1, J2.L01–L03");
  await expect(page.getByTestId("checkpoint-holds")).toHaveText(
    "It holds back only the track's capstone, “ii–V Ballad”. The track's lessons never wait for it.",
  );
  await expect(intro).toContainText("Opens a session after J2.L03 Extensions.");
  await expect(page.getByTestId("start-checkpoint")).toHaveCount(0);
  expect(await visibleText(page, "checkpoint-intro")).not.toMatch(RAW);
  await lookAt(page, "w7-jcp1-intro");
});

test("J1.L01 with the core unfinished, at 15 minutes: part A ends at its wrapAt, part B starts after it", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await seed(page, CORE_UNFINISHED);
  await setQuiet(page, false);
  const today = (await api<TodayPlan>(page, "GET", "/session/today")).body;
  expect(today?.mapItemId, "the core's next lesson").toBe("U14.L02");
  expect((await api(page, "PUT", "/profile", { targetMinutes: 15 })).status).toBe(200);
  try {
    const def = await lessonDefW5("J1.L01");
    const s4 = def.steps.find((s) => s.id === "S4");
    const pass = s4?.exercise?.tests.find((t) => t.expect === "pass")?.response as
      | { code?: string }
      | undefined;
    expect(pass?.code, "S4's passing code").toBeDefined();
    await page.goto("/learn/J1.L01?step=S4");
    await stepIs(page, "S4");
    await setCode(page, pass?.code as string);
    await page.getByTestId("check").click();
    await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("continue")).toHaveText(/Finish part A/);
    await page.getByTestId("continue").click();
    await expect(page.getByTestId("quick-sketch")).toContainText("That's part A");
    await page.getByTestId("save-quick").click();
    await expect(page.getByRole("heading", { name: "Part A done" })).toBeVisible({ timeout: 30_000 });
    expect((await progressOf(page, "J1.L01"))?.splitPart).toBe("A");
    // Part B the next time: from the step after the wrap.
    await page.goto("/learn/J1.L01");
    await stepIs(page, "S5");
    await expect(page.getByText("Part B", { exact: true })).toBeVisible();
    // The core is untouched: U14.L02 is still what the course does next.
    expect((await api<TodayPlan>(page, "GET", "/session/today")).body?.mapItemId).toBe("U14.L02");
    expect((await progressOf(page, "U14.L02"))?.status).not.toBe("completed");
  } finally {
    await api(page, "PUT", "/profile", { targetMinutes: 20 });
  }
});

type SessionHandle = {
  report(r: unknown): void;
  state(): {
    plan: { kind: string; mapItemId: string | null; warmup: { items: { id: string }[] } } | null;
    block: string | null;
  };
};
const sessionState = (page: Page) =>
  page.evaluate(() => (window as never as { __oakSession: SessionHandle }).__oakSession.state());

/** The warm-up belongs to the drills suites: reported skipped, as the learner's own skip would. */
async function skipWarmup(page: Page) {
  await expect.poll(async () => (await sessionState(page)).block, { timeout: 30_000 }).not.toBeNull();
  await page.evaluate(() => {
    const o = (window as never as { __oakSession: SessionHandle }).__oakSession;
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

test("J1.L01 as the day's New block with the core unfinished: warm-up, the lesson in its session, the Coda", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seed(page, CORE_UNFINISHED);
  await setQuiet(page, false);
  const focus = await api(page, "PUT", "/tracks/focus", { focus: "J" });
  expect(focus.status).toBe(200);
  const plan = (await api<TodayPlan>(page, "GET", "/session/today")).body;
  expect(plan, "with the focus on Jazz the New block is its next lesson").toMatchObject({
    kind: "lesson",
    mapItemId: "J1.L01",
  });
  await page.goto("/");
  const start = page.getByTestId("start-session");
  await expect(start).toBeVisible({ timeout: 30_000 });
  await start.click();
  await page.waitForURL(/\/session\/?$/, { timeout: 30_000 });
  expect((await sessionState(page)).plan).toMatchObject({ kind: "lesson", mapItemId: "J1.L01" });
  await skipWarmup(page);
  await expect(page.getByTestId("lesson-step")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("side-lesson-note"), "a track lesson is not a side lesson").toHaveCount(0);
  const def = await lessonDefW5("J1.L01");
  // The lesson's mistakes are walk-j1.pw.ts's; here it is the day's New block, through to the Coda.
  await walkLesson(page, def, {
    lessonId: "J1.L01",
    mic: false,
    quiet: false,
    inSession: true,
    listen: "short",
    mistakes: false,
  });
  await expect(page.getByTestId("coda-title")).toBeVisible({ timeout: 30_000 });
  expect((await progressOf(page, "J1.L01"))?.status).toBe("completed");
  expect((await progressOf(page, "U14.L02"))?.status, "the core is not moved on").not.toBe("completed");
});

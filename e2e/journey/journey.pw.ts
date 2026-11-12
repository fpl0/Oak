// The Wave 2 gate journey (docs/design/wave2.md §9) on the real stack: real server, real content, the scripted fake
// tutor, Chrome's fake microphone. Split at the final gate of Wave 3 into five tests of a few minutes each, every one
// starting from a dev seed (wave2.md §5) instead of replaying the days before it: onboarding with a microphone (a
// fresh learner); U00.L02 and U01.L01 as daily sessions with their warm-ups; U01.L02 with a tutor hint and an
// explanation, then the Studio sketch with a listening note, the Toolbox and the Oak; the U01 checkpoint; C0 made,
// released and found on the album with its cover, audio and liner notes. Zero console errors (beyond Strudel's
// learner-error line) and zero requests off this machine. A last test does onboarding in Quiet mode (no microphone)
// and one session.
import { expect, type Page, test } from "@playwright/test";
import { expectStep, fakeMic, throughTheLoop } from "../../app/src/onboarding/e2e/helpers.ts";
import { capstones } from "../../content/capstones.ts";
import u00l02 from "../../content/core/U00/L02/lesson.ts";
import u01l01 from "../../content/core/U01/L01/lesson.ts";
import u01l02 from "../../content/core/U01/L02/lesson.ts";
import { useUiPrefs } from "../support/ui.ts";
import { walkCapstone } from "./capstone-walk.ts";
import { walkCheckpoint } from "./checkpoint-walk.ts";
import { coda, lessonDay, startToday } from "./day.ts";
import { passingResponse, setCode, walkLesson } from "./lesson-walk.ts";
import {
  advanceDays,
  api,
  expectClean,
  noHmr,
  openToday,
  resetClock,
  seed,
  shootAll,
  watch,
} from "./support.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") }, permissions: ["microphone"] });

const SING_HOME = { sung: [{ midi: 60, cents: 0, credit: 1 }] };

/** The latency screen's 16 taps: one Space as each dot lights (as the onboarding suite does). */
async function tapAlong(page: Page) {
  await page.getByTestId("tap-start").click();
  await page.evaluate(() => {
    const list = document.querySelector('[data-testid="latency-tap"] ol');
    let last = -1;
    const obs = new MutationObserver(() => {
      const i = [...(list?.children ?? [])].findIndex((li) => li.getAttribute("aria-current") === "step");
      if (i > last) {
        last = i;
        setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " })), 15);
      }
    });
    if (list) obs.observe(list, { subtree: true, attributes: true });
  });
}

const tutorMessage = (page: Page) => page.getByTestId("tutor-chat").getByTestId("tutor-message").last();
async function tutorDone(page: Page) {
  await expect(tutorMessage(page)).toHaveAttribute("data-status", /done/, { timeout: 30_000 });
}

test("gate journey 1: a fresh learner goes through onboarding with a microphone", async ({
  page,
  request,
}) => {
  await resetClock(request);
  await seed(request, "fresh");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const w = watch(page);

  // --- day 1: onboarding with a microphone (it completes U00.L01 on the map) ----------------------------------
  await openToday(page);
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "first-run");
  await page.getByTestId("begin-onboarding").click();
  await throughTheLoop(page, 6);
  await page.getByTestId("react-continue").click();
  await expectStep(page, "prefs");
  await page.getByTestId("prefs-continue").click();
  await expectStep(page, "tutor");
  await expect(page.getByTestId("tutor-ready")).toBeVisible();
  await page.getByTestId("tutor-continue").click();
  await expectStep(page, "headphones");
  await page.getByTestId("lr-play").click();
  await page.getByTestId("lr-left").click({ timeout: 10_000 });
  await page.getByTestId("part-continue").click();
  await expectStep(page, "mic");
  await page.getByTestId("mic-allow").click();
  await expect(page.getByTestId("mic-live")).toBeVisible();
  await page.getByTestId("part-continue").click();
  await page.getByTestId("noise-start").click();
  await expect(page.getByText("Quiet enough")).toBeVisible();
  await page.getByTestId("part-continue").click();
  await page.getByTestId("bleed-start").click();
  await expect(page.getByText("No bleed")).toBeVisible();
  await page.getByTestId("part-continue").click();
  await expectStep(page, "range");
  await page.getByTestId("range-start").click();
  await expect(page.getByText(/Your singing zone: A2–E4/)).toBeVisible();
  await page.getByTestId("part-continue").click();
  await expectStep(page, "latency");
  await tapAlong(page);
  await expect(page.getByText(/Your taps land \d+ ms (after|before) the click/)).toBeVisible();
  await page.getByTestId("sing-start").click();
  await expect(page.getByText(/Your voice lands \d+ ms/)).toBeVisible();
  await page.getByTestId("part-continue").click();
  await expectStep(page, "first-sing");
  await page.getByTestId("first-sing-start").click();
  await expect(page.getByText("That note is 1: home.")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("part-continue").click();
  await expectStep(page, "sketch");
  await expect(page.getByTestId("workbench")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("sketch-save").click();
  await expectStep(page, "coda");
  await page.getByTestId("coda-done").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("today-card")).toBeVisible();
  const p1 = await api<{ lessons: { lessonId: string; status: string }[] }>(
    request,
    "GET",
    "/api/lessons/progress",
  );
  expect(p1.lessons.find((l) => l.lessonId === "U00.L01")?.status).toBe("completed");
  const profile = await api<{ tapLatencyMs: number | null; quiet: boolean }>(request, "GET", "/api/profile");
  expect(profile.quiet).toBe(false);
  await shootAll(page, "today-day1");

  expectClean(w);
});

test("gate journey 2: U00.L02 and U01.L01 as daily sessions, warm-ups included", async ({
  page,
  request,
}) => {
  // Onboarding (U00.L01) finished yesterday.
  await resetClock(request);
  await seed(request, "onboarded");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const w = watch(page);

  // --- day 2: U00.L02; the set-up parts done in onboarding are kept, the first note is sung --------------------
  await lessonDay(page, request, u00l02, { answers: { S5: SING_HOME } });

  // --- day 3: the warm-up the plan holds, then U01.L01 and its Make over the Band ------------------------------
  await advanceDays(request, 1);
  await lessonDay(page, request, u01l01, { makeTitle: "First beat" });

  expectClean(w);
});

test("gate journey 3: U01.L02 with a tutor hint and an explanation, then Studio, Toolbox and the Oak", async ({
  page,
  request,
}) => {
  // The Oak as it stands the day after onboarding, to compare with after U01.L02 (one lesson alone may grow no
  // leaf); then U01.L01 done yesterday, today U01.L02.
  await resetClock(request);
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  await seed(request, "onboarded");
  const leavesBefore = await grownLeaves(page);
  await seed(request, "after U01.L01");
  const w = watch(page);

  // --- day 4: U01.L02 with a tutor hint and an explanation on its first graded step ----------------------------
  await lessonDay(page, request, u01l02, {
    makeTitle: "Count to four",
    before: async (step) => {
      if (step.id !== "S5") return;
      const wrong = (
        step.exercise as { tests: { response: { code?: string }; expect: string }[] }
      ).tests.find((t) => t.expect === "fail" && t.response.code);
      expect(passingResponse(step)).not.toBeNull();
      await setCode(page, wrong?.response.code as string);
      await page.getByTestId("check").click();
      await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
      // A nudge from Claude (hint 1 through the tutor), then "Explain my mistake" from the panel.
      await page.getByTestId("ask-nudge").click();
      await tutorDone(page);
      const actions = page.getByTestId("tutor-chat").getByTestId("quick-actions");
      await actions.getByRole("button", { name: "Explain my mistake" }).click();
      await tutorDone(page);
      // Two answers from Claude in the lesson's thread (the hint, then the explanation).
      await expect(page.getByTestId("tutor-chat").getByTestId("tutor-message")).toHaveCount(2);
      await expect(tutorMessage(page)).not.toBeEmpty();
      const st = await api<{ rung: number; attempts: number }>(
        request,
        "GET",
        "/api/lessons/U01.L02/steps/S5",
      );
      expect(st.rung).toBeGreaterThanOrEqual(2);
    },
  });

  // --- the Studio: the day's sketch, with Claude's listening note -----------------------------------------------
  await page.goto("/studio");
  const card = page.getByTestId("sketch-card").filter({ hasText: "Count to four" }).first();
  await card.click();
  await expect(page).toHaveURL(/\/studio\/[^/]+$/);
  await page.getByTestId("ask-listening").click();
  await expect(page.getByTestId("listening-note")).toBeVisible({ timeout: 60_000 });

  // --- the Toolbox shows the tools U01.L02 opened -------------------------------------------------------------
  await page.goto("/toolbox/tb.gain");
  await expect(page.getByTestId("tool-example")).toBeVisible({ timeout: 30_000 });

  // --- the Oak has grown since day 1 ------------------------------------------------------------------------------
  const leavesNow = await grownLeaves(page);
  expect(leavesNow).toBeGreaterThan(leavesBefore);
  await page.goto("/oak");
  await expect(page.getByRole("heading", { name: /The Oak/ }).first()).toBeVisible();

  expectClean(w);
});

test("gate journey 4: the U01 checkpoint day, passed", async ({ page, request }) => {
  await resetClock(request);
  await seed(request, "U01.CP due");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const w = watch(page);

  // --- skip ahead (dev seeder): U01.L03 … U02.L01 done one day each, today's New block is the U01 checkpoint -----
  // The seed replays the course one day per session up to yesterday on the real clock.
  const cpPlan = await startToday(page, request);
  expect(cpPlan).toMatchObject({ kind: "checkpoint", mapItemId: "U01.CP" });
  const tap = (await api<{ tapLatencyMs: number | null }>(request, "GET", "/api/profile")).tapLatencyMs ?? 0;
  expect(await walkCheckpoint(page, tap)).toEqual({ passed: true });
  await page.getByTestId("checkpoint-done").click();
  await coda(page, { unlocks: false });

  expectClean(w);
});

test("gate journey 5: C0 made, released and found on the album", async ({ page, request }) => {
  // U01.CP passed yesterday: C0 is open and today's New block is C0.S1.
  await resetClock(request);
  await seed(request, "C0 ready");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const w = watch(page);

  // --- the next day: C0, checked and released to the album -------------------------------------------------------
  const c0Plan = await startToday(page, request);
  expect(c0Plan).toMatchObject({ kind: "capstone", mapItemId: "C0.S1" });
  const ref = capstones
    .find((c) => c.id === "C0")
    ?.brief?.tests.find((t) => t.name === "four bars, tom fill in bar 4");
  if (!ref || !("code" in ref.response))
    throw new Error("C0's reference piece is not in content/capstones.ts");
  await walkCapstone(page, {
    id: "C0",
    code: ref.response.code,
    rules: 6,
    linerLine: "Straight time, then the toms take bar 4.",
  });
  await shootAll(page, "release-ceremony");
  await page.getByRole("button", { name: "Continue to the coda" }).click();
  await coda(page, { unlocks: false });

  // --- the album: track 1 with its cover, its recording and its liner notes ------------------------------------
  const c0 = await api<{ status: string; trackId: string }>(request, "GET", "/api/capstones/C0");
  expect(c0.status).toBe("released");
  await page.goto("/album");
  const row = page.locator(`[data-track="${c0.trackId}"]`);
  await expect(row.locator("svg[data-cover-rings]")).toHaveAttribute("data-cover-rings", "4", {
    timeout: 30_000,
  });
  await row.getByRole("button", { name: "Liner notes" }).click();
  await expect(row.getByTestId("liner-notes")).toContainText("Straight time, then the toms take bar 4.");
  await row.getByRole("link", { name: "Intro" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Intro" })).toBeVisible();
  await expect(page.getByTestId("track-audio")).toBeVisible();
  // The recording the release made: real audio bytes, served to the page.
  const bytes = await page.evaluate(async (id) => {
    const res = await fetch(`/api/album/tracks/${id}/versions/1/audio`);
    return res.ok ? (await res.arrayBuffer()).byteLength : -res.status;
  }, c0.trackId);
  expect(bytes).toBeGreaterThan(4000);
  // Today's album strip shows the released track's own cover.
  await openToday(page);
  await expect(page.getByTestId("album-strip").getByRole("link", { name: /Intro, released/ })).toBeVisible();

  expectClean(w);
});

test("Quiet mode: onboarding without a microphone, then one session", async ({ page, request }) => {
  await resetClock(request);
  await seed(request, "fresh");
  await noHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  const w = watch(page);
  await openToday(page);
  await page.getByTestId("begin-onboarding").click();
  await throughTheLoop(page, 5);
  await page.getByTestId("react-continue").click();
  await expectStep(page, "prefs");
  await page.getByTestId("prefs-continue").click();
  await expectStep(page, "tutor");
  await page.getByTestId("tutor-continue").click();
  await expectStep(page, "headphones");
  await page.getByTestId("lr-play").click();
  await page.getByTestId("lr-left").click({ timeout: 10_000 });
  await page.getByTestId("part-continue").click();
  await expectStep(page, "mic");
  await page.getByTestId("mic-quiet").click();
  // Quiet mode passes over range and the first note; the latency screen keeps only taps, which can wait.
  await expectStep(page, "latency");
  await expect(page.getByTestId("onboarding")).toHaveAttribute("data-quiet", "1");
  await page.getByTestId("part-skip").click();
  await expectStep(page, "sketch");
  await expect(page.getByTestId("workbench")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("sketch-save").click();
  await expectStep(page, "coda");
  await page.getByTestId("coda-done").click();
  await expect(page).toHaveURL(/\/$/);
  expect((await api<{ quiet: boolean }>(request, "GET", "/api/profile")).quiet).toBe(true);

  // Day 2 in Quiet mode: U00.L02's sung step passes over, the rest of the session runs.
  await advanceDays(request, 1);
  const plan = await startToday(page, request);
  expect(plan).toMatchObject({ kind: "lesson", mapItemId: "U00.L02" });
  await walkLesson(page, u00l02, { answers: { S5: SING_HOME } });
  await coda(page, { unlocks: true });
  expectClean(w);
});

/** The grown-leaves count of Today's Oak thumbnail (its link names it). */
async function grownLeaves(page: Page): Promise<number> {
  await openToday(page);
  const link = page.getByTestId("oak-glance").getByRole("link").first();
  await expect(link).toHaveAttribute("aria-label", /leaves grown/, { timeout: 30_000 });
  const label = (await link.getAttribute("aria-label")) ?? "";
  return Number(/(\d+) of \d+ leaves grown/.exec(label)?.[1] ?? "0");
}

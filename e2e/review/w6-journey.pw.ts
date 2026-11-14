// Wave 6 review (review:journey): the U12–U17 lessons and their ear steps as the learner meets them, each from its
// own dev seed, each a regression test for a defect this review found and fixed:
//  - a push tapped on the beat, five times running: the verdict names it ("pushes landed on the beat"), the per-tap
//    lines it explains are gone, and Skip and "Show the answer" stay (app/src/lesson/grading.ts `rhythmFirst`);
//  - the staff by keyboard: "c d e" on a fresh treble staff lands around middle C (it was C5 D5 E5, and the check
//    said only that every note differed), the dotted quarter by ".", the tie over the bar line by "t"; the issue
//    lines never name the staff's internal voice "main" (app/src/answers/staff/model.ts `letterFrom`), and the notes
//    survive a reload before the check (app/src/lesson/drafts.ts);
//  - a key change on the bar timeline: a digit picks the bar of that number and 0 "No key change" (5 picked bar 6:
//    the learner's answer was marked one bar late), and after the answer the lift can be heard undone
//    ("Without the lift") as a drill offers it (app/src/answers/widgets/Choice.tsx, app/src/lesson/ear-after.tsx);
//  - a dominant seventh taken for a major seventh: the ear step plays the chord against the learner's own wrong
//    pick ("Against a major 7th");
//  - V7 of V on the applied-chord palette by keys alone: 4, / then 5, Shift+5, 1, Enter;
//  - a whole U15.L02 day from the keyboard alone, with reduced motion, at 1280×800 in Bark: Today, the warm-up
//    (reported skipped: the U15 sets are walked by keys in the drill suites), every step of the lesson (a listen, a
//    predict, a run-and-answer, two loops heard for the bar that leans, the applied chord typed into its region,
//    the numerals with V7 of V, the sung step skipped, the Make), the Coda and "Done for today".
import { expect, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../support/ui.ts";
import {
  api,
  openToday,
  playsAndMoves,
  resetClock,
  reviewMic,
  sessionEnd,
  shootAll,
  skipWarmup as skipTheWarmup,
  snap,
  watch,
} from "./support.ts";
import {
  active,
  byId,
  byText,
  checkStep,
  continueStep,
  quietHmr,
  seedPoint,
  step,
  tabTo,
  typeCode,
  typeRegion,
} from "./w4-support.ts";
import { forgetLesson } from "./w5-support.ts";

// The fake microphone holds C4; reduced motion and 1280×800 for every test (the keyboard day needs them, and the
// others lose nothing by them).
test.use({
  launchOptions: { args: reviewMic("hold-c4.wav") },
  permissions: ["microphone"],
  reducedMotion: "reduce",
  viewport: { width: 1280, height: 800 },
});

type Dev = {
  submit(r: unknown): Promise<{ status: string } | null>;
  trial(): Record<string, unknown> | null;
  trials(): ({ qualities?: string[] } | null)[] | null;
};
const lesson = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { __oakLesson: Dev }).__oakLesson);
const feedback = (page: Page) => page.getByTestId("step-feedback");

async function open(page: Page, lessonId: string, stepId: string): Promise<void> {
  await quietHmr(page);
  await page.goto(`/learn/${lessonId}?step=${stepId}`);
  await expect(step(page)).toHaveAttribute("data-step", stepId, { timeout: 60_000 });
  await page.waitForFunction(() => !!(globalThis as { __oakLesson?: unknown }).__oakLesson);
}

test("U13.L01 S2: a push tapped on the beat five times is named for what it is; Skip and the answer stay", async ({
  page,
  request,
}) => {
  await seedPoint(request, "after U13.L03");
  forgetLesson("U13.L01");
  const problems = watch(page);
  await open(page, "U13.L01", "S2");
  await lesson(page);
  // 96 BPM: a bar is 2.5 s; the pushes are on the last eighth of each bar, the beat an eighth later.
  for (let i = 0; i < 5; i++) {
    const nudge = i % 2 === 0 ? 0.02 : -0.015;
    const r = await page.evaluate(
      (taps) => (globalThis as unknown as { __oakLesson: Dev }).__oakLesson.submit({ taps }),
      [2.5, 5, 7.5, 10].map((t) => t + nudge),
    );
    expect(r?.status).toBe("fail");
    await expect(feedback(page)).toHaveAttribute("data-status", "fail");
  }
  const said = ((await feedback(page).textContent()) ?? "").replace(/\s+/g, " ");
  expect(said).toContain("Not in time yet. Listen, then tap along again.");
  expect(said).toContain("All 4 of your pushes landed on the beat. A push comes an eighth early");
  expect(said, "the per-tap lines the push explains are not repeated").not.toContain("without a tap");
  // An honest way forward at every attempt: Skip (a practice step), and the answer after three.
  await expect(page.getByTestId("continue")).toBeEnabled();
  await expect(page.getByTestId("reveal-button")).toBeVisible();
  await snap(page, "w6-rj-push-on-beat");
  expect(problems).toEqual([]);
});

test("U13.L03 S7: the tied and dotted bar written by keyboard from a fresh staff, around middle C; it passes", async ({
  page,
  request,
}) => {
  await seedPoint(request, "after U13.L03");
  forgetLesson("U13.L03");
  const problems = watch(page);
  await open(page, "U13.L03", "S7");
  const surface = page.getByTestId("staff-surface");
  const say = page.getByTestId("staff-say");
  await surface.focus();
  await page.keyboard.press("c");
  await expect(say).toHaveText("C4, quarter, bar 1 beat 1");
  await page.keyboard.press("d");
  // The dot, then E (three eighths); an eighth G on the last eighth; a half chosen, "t" holds the G on into bar 2
  // by that half and says so; then a half E.
  for (const k of [".", "e", "3", "g", "5", "t"]) await page.keyboard.press(k);
  await expect(say).toHaveText(
    "Tied: held on by a half. To hold it longer, pick that length (2–6) before T.",
  );
  await page.keyboard.press("e");
  await page.getByText("Type the notes instead").click();
  await expect(page.locator("details").getByRole("textbox").first()).toHaveValue(
    "C4:4 D4:4 E4:4. G4:8~ | G4:2 E4:2",
  );
  await page.getByTestId("staff-surface").focus();
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(feedback(page)).toHaveAttribute("data-status", "pass", { timeout: 30_000 });
  await snap(page, "w6-rj-staff-tie");

  // A wrong note's line names the bar and beat, never the staff's own voice ("main").
  await page.goto("/learn/U13.L03?step=S7");
  await expect(step(page)).toHaveAttribute("data-step", "S7", { timeout: 60_000 });
  await page.getByTestId("staff-surface").focus();
  for (const k of ["c", "d", ".", "e", "3", "g", "5", "g", "e"]) await page.keyboard.press(k);
  // Reloaded before the check: the notes come back (they were lost while a line of numerals was kept).
  await page.reload();
  await expect(step(page)).toHaveAttribute("data-step", "S7", { timeout: 60_000 });
  await page.getByText("Type the notes instead").click();
  await expect(page.locator("details").getByRole("textbox").first()).toHaveValue(
    "C4:4 D4:4 E4:4. G4:8 | G4:2 E4:2",
  );
  await page.getByTestId("staff-surface").focus();
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(feedback(page)).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  await expect(feedback(page)).toContainText("Bar 2, beat 1");
  await expect(feedback(page)).not.toContainText("main");
  expect(problems).toEqual([]);
});

test("U17.L03 S4: a digit picks the bar of that number, 0 is no key change; the lift can be heard undone", async ({
  page,
  request,
}) => {
  await seedPoint(request, "after U17.L02");
  const problems = watch(page);
  await open(page, "U17.L03", "S4");
  // A trial with a lift (some stay home): draw new ones until one has a bar to mark.
  const trialNow = () =>
    page.evaluate(() =>
      JSON.stringify((globalThis as unknown as { __oakLesson: Dev }).__oakLesson.trial() ?? null),
    );
  let bar = 0;
  for (let i = 0; i < 12 && bar === 0; i++) {
    const was = await trialNow();
    const c = (JSON.parse(was) as { choice?: string[] } | null)?.choice?.[0];
    if (c && c !== "none") bar = Number(c);
    else {
      await page.getByTestId("new-series").click();
      // The new trial is drawn and shown before anything is pressed (a press during the redraw is lost).
      await expect.poll(trialNow, { timeout: 15_000 }).not.toBe(was);
    }
  }
  expect(bar, "a trial that lifts").toBeGreaterThan(1);
  const strip = page.locator("[data-choice-layout='bars']");
  await strip.getByRole("radio").first().focus();
  await page.keyboard.press("0");
  await expect(strip.locator('[data-option="none"]')).toHaveAttribute("aria-checked", "true");
  await expect(strip.locator('[data-option="none"]')).toHaveAccessibleName(/^0\. No key change/);
  await page.keyboard.press(String(bar));
  await expect(strip.locator(`[data-option="${bar}"]`)).toHaveAttribute("aria-checked", "true");
  await expect(strip.locator(`[data-option="${bar}"]`)).toHaveAccessibleName(
    new RegExp(`^${bar}\\. Bar ${bar}`),
  );
  // One bar late, then checked: not right, and the lift can be heard undone.
  if (bar < 8) {
    await page.keyboard.press(String(bar + 1));
    await expect(strip.locator(`[data-option="${bar + 1}"]`)).toHaveAttribute("aria-checked", "true");
  }
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(feedback(page)).toHaveAttribute("data-status", bar < 8 ? "fail" : "pass", { timeout: 30_000 });
  await expect(page.getByTestId("hear-near")).toHaveText("Without the lift");
  await snap(page, "w6-rj-key-change");
  expect(problems).toEqual([]);
});

test("U12.L06 S6: a seventh taken for its near miss can be heard against the pick", async ({
  page,
  request,
}) => {
  await seedPoint(request, "after U12.L06");
  forgetLesson("U12.L06");
  const problems = watch(page);
  await open(page, "U12.L06", "S6");
  const trials = (await page.evaluate(() =>
    (globalThis as unknown as { __oakLesson: Dev }).__oakLesson.trials(),
  )) as { qualities: string[] }[];
  const near: Record<string, [string, string]> = {
    "7": ["maj7", "major 7th"],
    maj7: ["7", "dominant 7th"],
    m7: ["m7b5", "half-diminished 7th"],
    m7b5: ["m7", "minor 7th"],
    dim7: ["m7b5", "half-diminished 7th"],
  };
  const names: Record<string, string> = {
    maj7: "major 7th",
    "7": "dominant 7th",
    m7: "minor 7th",
    m7b5: "half-diminished 7th",
    dim7: "diminished 7th",
  };
  const want = trials[0]?.qualities[0] as string;
  const [, words] = near[want] as [string, string];
  // Part 1 taken for its near miss, the others right.
  for (const [i, t] of trials.entries()) {
    const pick = i === 0 ? words : (names[t.qualities[0] as string] as string);
    await page
      .locator(`[data-part="${i + 1}"]`)
      .getByRole("radio", { name: new RegExp(`^\\d\\. ${pick}$`) })
      .click();
  }
  await page.getByTestId("check").click();
  await expect(feedback(page)).toHaveAttribute("data-status", /fail|partial/, { timeout: 30_000 });
  await expect(page.locator('[data-part="1"]').getByTestId("hear-near")).toHaveText(`Against a ${words}`);
  expect(problems).toEqual([]);
});

test("U15.L02 S6: V7 of V on the applied-chord palette by keys alone", async ({ page, request }) => {
  await seedPoint(request, "CF-T.S2 done");
  forgetLesson("U15.L02");
  const problems = watch(page);
  await open(page, "U15.L02", "S6");
  await page.locator('[data-rn-slot="0"]').focus();
  for (const k of ["4", "/", "5", "Shift+5", "1"]) await page.keyboard.press(k);
  await expect(page.locator('[data-rn-slot="1"]')).toHaveAccessibleName("Bar 2: V 7 of V");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(feedback(page)).toHaveAttribute("data-status", "pass", { timeout: 30_000 });
  expect(problems).toEqual([]);
});

type LessonStep = {
  id: string;
  kind: string;
  exercise?: {
    kind: string;
    answer?: { ui?: string };
    correct?: { rn?: string[] };
    code?: { starter?: string };
    parts?: { answer?: { ui?: string }; correct?: { number?: number } }[];
    questions?: { q: string; options?: { id: string }[] }[];
    tests?: { expect: string; response: { code?: string; answer?: unknown } }[];
  };
};

test.describe("keyboard only", () => {
  test("a whole U15.L02 day from the keyboard, with reduced motion", async ({ page, request }) => {
    test.setTimeout(90_000);
    await resetClock(request);
    await seedPoint(request, "C6 released");
    await quietHmr(page);
    await useUiPrefs(page, { theme: "bark", motion: "system" });
    const problems = watch(page);
    const ended = sessionEnd(page);
    const plan = await api<{ kind: string; mapItemId: string }>(request, "GET", "/api/session/today");
    expect(plan).toMatchObject({ kind: "lesson", mapItemId: "U15.L02" });
    await openToday(page);
    // Today has decided before Tab is pressed (under load the card shows before its Start button).
    await expect(page.getByTestId("start-session")).toBeVisible({ timeout: 30_000 });
    await tabTo(page, byId("start-session"), "Start session");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/session\/?$/);
    await skipTheWarmup(page);

    const def = (await import("../../content/core/U15/L02/lesson.ts")).default as { steps: LessonStep[] };
    let heard = false;
    for (const s of def.steps) {
      await expect(step(page)).toHaveAttribute("data-step", s.id, { timeout: 60_000 });
      const ex = s.exercise;
      if (!ex) {
        await continueStep(page);
        continue;
      }
      if (s.kind === "make") {
        const code = ex.tests?.find((t) => t.expect === "pass")?.response.code as string;
        await typeCode(page, code);
        await tabTo(page, byId("save-sketch"), "Save");
        await page.keyboard.press("Enter");
        continue;
      }
      if (ex.kind === "listen") {
        // One item heard through per file (wave5.md §7.1): it plays and moves, then it is stopped and skipped on.
        await tabTo(page, byId("play-toggle"), "Play");
        await page.keyboard.press("Enter");
        if (!heard) await playsAndMoves(page);
        heard = true;
        await tabTo(page, byId("play-toggle"), "Stop");
        await page.keyboard.press("Enter");
        await continueStep(page);
        continue;
      }
      if (ex.kind === "predict") {
        await tabTo(page, (a) => a.option !== null, "the options");
        await page.keyboard.press("1");
        await tabTo(page, byId("check"), "Check");
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("predict-outcome")).toBeVisible();
        await continueStep(page);
        continue;
      }
      if (ex.kind === "run-investigate") {
        const pass = ex.tests?.find((t) => t.expect === "pass")?.response.answer as {
          choice?: string[];
          number?: number;
        };
        for (const [i, q] of (ex.questions ?? []).entries()) {
          if (q.q === "choice") {
            const ids = (q.options ?? []).map((o) => o.id);
            const want = (pass.choice ?? []).find((c) => ids.includes(c)) as string;
            await tabTo(page, (a) => a.option !== null && ids.includes(a.option), `question ${i + 1}`);
            await page.keyboard.press(String(ids.indexOf(want) + 1));
          } else {
            await tabTo(page, (a) => a.editable && a.tag === "input", `question ${i + 1}'s field`);
            await page.keyboard.type(String(pass.number));
          }
        }
        await checkStep(page, /pass/);
        await continueStep(page);
        continue;
      }
      if (ex.kind === "all") {
        // Two loops heard for the bar that leans: each part's bar by its digit.
        for (const [i, part] of (ex.parts ?? []).entries()) {
          await tabTo(page, byText(/^Bar \d+/), `part ${i + 1}'s bars`, { max: 80 });
          await page.keyboard.press(String(part.correct?.number));
          expect((await active(page)).text).toBe(`Bar ${part.correct?.number}`);
          if (i < (ex.parts?.length ?? 0) - 1) {
            // On to the next part's bars: Tab out of this radio group.
            await page.keyboard.press("Tab");
          }
        }
        await checkStep(page, /pass/);
        await continueStep(page);
        continue;
      }
      if (ex.answer?.ui === "rn-palette") {
        await tabTo(page, (a) => a.slot !== null, "the numeral slots");
        for (const k of ["4", "/", "5", "Shift+5", "1"]) await page.keyboard.press(k);
        await shootAll(page, "w6-rj-kbd-applied");
        await checkStep(page, /pass/);
        await continueStep(page);
        continue;
      }
      if (ex.kind === "sing") {
        // Singing never gates: Skip, from the keyboard.
        await expect(page.getByTestId("continue")).toHaveText(/Skip/);
        await continueStep(page);
        continue;
      }
      if (ex.kind === "code-modify") {
        const code = ex.tests?.find((t) => t.expect === "pass")?.response.code as string;
        const starter = ex.code?.starter ?? "";
        const open = starter.indexOf("⟪");
        const close = starter.indexOf("⟫");
        const before = starter.slice(0, open);
        const after = starter.slice(close + 1);
        await typeRegion(
          page,
          starter.slice(open + 1, close),
          code.slice(before.length, code.length - after.length),
        );
        await checkStep(page, /pass/);
        await continueStep(page);
        continue;
      }
      throw new Error(`no keyboard path for ${s.id} (${ex.kind}, ${ex.answer?.ui})`);
    }
    // The Coda: "Done for today" by keys.
    await page.waitForURL(/\/session\/coda$/, { timeout: 60_000 });
    await ended();
    await tabTo(page, byId("done-for-today"), "Done for today", { max: 80 });
    await page.keyboard.press("Enter");
    await page.waitForURL((u) => u.pathname === "/", { timeout: 30_000 });
    await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done", { timeout: 30_000 });
    expect(problems).toEqual([]);
  });
});

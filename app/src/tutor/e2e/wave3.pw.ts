// Wave 3 in the tutor panel, against the scripted fake backend (OAK_TUTOR_FAKE=1; docs/design/wave2.md §5):
// - hints and "Explain my mistake" on the new step kinds (staff writing, singing, by ear): the turn carries the
//   learner's answer as text the tutor reads (notes placed, cents per sung target, the code written by ear) and
//   never the expected answer; the Key and Labels chips show and travel as one "On screen" line, which the
//   timeline does not echo back;
// - chips for the Wave 3 vocabulary inside the closed token grammar: degrees with alterations and syllables
//   (also written ♭3 or me), intervals, keys and signatures, all sounding in the subject's key; a note reference
//   is published for the staff and the roll;
// - screenshots in both themes at both sizes.
// The lesson, Studio and capstone surfaces are other engineers'; the spec stands in for them through
// `window.__oakTutor` (app/src/tutor/dev-hook.ts, dev server only), as tutor.pw.ts does.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, type Page, type Route, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { PREFS_KEY, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

type Subject = Record<string, unknown>;

const FAILED = {
  exerciseVersion: 1,
  attemptNo: 1,
  firstAttempt: true,
  mode: "lesson",
  status: "fail",
  score: 0.75,
  adjustedScore: 0.75,
  dims: { pitch: { score: 0.75, weight: 1 } },
  constraints: [],
  messages: [],
  assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
};

/** U02.L04 S5 "Write it down": c4 e4 g4 c5 on the staff; the learner wrote F4 for E4. */
const STAFF: Subject = {
  thread: { subjectKind: "lesson", subjectId: "U02.L04" },
  title: "U02.L04 · Staff",
  tutorOpen: true,
  lessonId: "U02.L04",
  stepId: "S5",
  graded: true,
  passed: false,
  code: null,
  rung: 0,
  key: { tonic: "C", mode: "major" },
  answer: { kind: "staff", notes: "C4:4 F4:4 G4:4 C5:4", clef: "treble" },
  lastResult: {
    ...FAILED,
    exerciseId: "U02.L04/write-c-e-g-c",
    diagnostics: [
      { id: "spell.wrong", severity: "error", params: { got: "F4", exp: "E4" }, where: { bar: 1, beat: 2 } },
    ],
  },
};

/** U02.L07 S2, a sung step: the third note came out 61 cents flat. */
const SUNG: Subject = {
  thread: { subjectKind: "lesson", subjectId: "U02.L07" },
  title: "U02.L07 · Sing it",
  tutorOpen: true,
  lessonId: "U02.L07",
  stepId: "S2",
  graded: true,
  passed: false,
  code: null,
  rung: 0,
  answer: {
    kind: "sung",
    notes: [
      { target: "1 (do)", cents: 8 },
      { target: "2 (re)", cents: -22 },
      { target: "3 (mi)", cents: -61 },
    ],
    tolCents: 50,
  },
  lastResult: { ...FAILED, exerciseId: "U02.L07/sing", diagnostics: [] },
};

/** U03.L02 S4: code written by ear at three-quarter speed, in G major. */
const BY_EAR: Subject = {
  thread: { subjectKind: "lesson", subjectId: "U03.L02" },
  title: "U03.L02 · By ear",
  tutorOpen: true,
  lessonId: "U03.L02",
  stepId: "S4",
  graded: true,
  passed: false,
  code: 'melody: n("0 2 4 2").scale("G4:major")',
  rung: 0,
  answer: { kind: "by-ear", code: 'melody: n("0 2 4 2").scale("G4:major")', rate: 0.75 },
  lastResult: { ...FAILED, exerciseId: "U03.L02/S4", diagnostics: [] },
};

function openLesson(id: string, step: string) {
  execFileSync("sqlite3", [
    `${stack.dataDir}/oak.db`,
    `INSERT OR REPLACE INTO lesson_progress (lesson_id, status, current_step, updated_at) VALUES ('${id}', 'in_progress', '${step}', '2026-11-11T09:00:00.000Z')`,
  ]);
}

async function openApp(page: Page, theme: "paper" | "bark" = "paper") {
  await page.routeWebSocket(/.*/, () => {});
  await useUiPrefs(page, { theme, motion: "off" });
  await page.addInitScript((key) => {
    const cur = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...cur, tutorOpen: true }));
  }, PREFS_KEY);
  await page.goto("/settings/about");
  await page.waitForFunction(() => "__oakTutor" in window);
  await expect(page.getByTestId("tutor-status")).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
}

const hook = <T>(page: Page, fn: string, arg?: unknown) =>
  page.evaluate(
    ([f, a]) =>
      (window as unknown as { __oakTutor: Record<string, (x?: unknown) => unknown> }).__oakTutor[
        f as string
      ]?.(a) as T,
    [fn, arg] as const,
  );

const panel = (page: Page) => page.getByTestId("tutor-chat");
const lastMessage = (page: Page) => panel(page).getByTestId("tutor-message").last();
const waitDone = (page: Page) =>
  expect(lastMessage(page)).toHaveAttribute("data-status", /done|error/, { timeout: 30_000 });

/** The next tutor turn request's JSON body. */
const nextTurnBody = (page: Page) =>
  page
    .waitForRequest(
      (r) => /\/api\/tutor\/(hint|explain-mistake|chat)$/.test(r.url()) && r.method() === "POST",
    )
    .then((r) => r.postDataJSON() as { userText: string; learnerCode?: string; stepId?: string });

test.describe.configure({ mode: "serial" });

test("staff writing: the hint carries the placed notes and the key, never the expected notes", async ({
  page,
}) => {
  openLesson("U02.L04", "S5");
  await openApp(page);
  await hook(page, "setSubject", STAFF);
  const chips = panel(page).getByTestId("context-chips");
  await expect(chips.locator('[data-chip="answer"]')).toHaveText(/Your staff · 4 notes/);
  await expect(chips.locator('[data-chip="key"]')).toHaveText("Key · C major");
  // Before U03.L02 no label lens is unlocked: the chip says what the learner sees.
  await expect(chips.locator('[data-chip="labels"]')).toHaveText("Labels · none");
  await panel(page).getByRole("button", { name: "What Claude sees" }).click();
  await expect(panel(page)).toContainText("Never the expected answer or the hidden source.");

  const body = nextTurnBody(page);
  await panel(page).getByTestId("quick-actions").getByRole("button", { name: "Hint 1 of 4" }).click();
  const b = await body;
  expect(b.stepId).toBe("S5");
  expect(b.learnerCode).toContain("Notes I placed on the staff (treble clef)");
  expect(b.learnerCode).toContain("C4:4 F4:4 G4:4 C5:4");
  expect(b.learnerCode).not.toContain("E4");
  expect(b.userText).toBe("Give me a nudge.\n\nOn screen: key C major; labels shown: none.");
  await waitDone(page);
  await expect(lastMessage(page)).toHaveAttribute("data-status", "done");
  await expect(chips).toContainText("Hints 1/4");

  // The answer chip can be left out, like the code chip.
  await chips.locator('[data-chip="answer"]').click();
  await expect(chips.locator('[data-chip="answer"]')).toHaveAttribute("aria-pressed", "false");
  const second = nextTurnBody(page);
  await panel(page).getByTestId("composer").fill("Is my second note right?");
  await panel(page).getByTestId("composer").press("Enter");
  expect((await second).learnerCode).toBeUndefined();
  await waitDone(page);

  // Back from the server, the learner's message reads as they wrote it: no "On screen" line.
  await page.reload();
  await page.waitForFunction(() => "__oakTutor" in window);
  await hook(page, "setSubject", STAFF);
  await expect(panel(page).getByText("Is my second note right?")).toBeVisible({ timeout: 20_000 });
  await expect(panel(page).getByTestId("tutor-timeline")).not.toContainText("On screen:");
});

test("singing: Explain my mistake sends the cents per target; by ear: the hint sends the code", async ({
  page,
}) => {
  openLesson("U02.L07", "S2");
  openLesson("U03.L02", "S4");
  await openApp(page);
  await hook(page, "setSubject", SUNG);
  await expect(panel(page).locator('[data-chip="answer"]')).toHaveText(/Your singing · 3 notes/);
  const sung = nextTurnBody(page);
  await panel(page).getByTestId("quick-actions").getByRole("button", { name: "Explain my mistake" }).click();
  const s = await sung;
  expect(s.learnerCode).toContain("in cents from each target");
  expect(s.learnerCode).toContain("note 3 (target 3 (mi)): −61¢ flat");
  expect(s.learnerCode).toContain("graded within ±50¢");
  await waitDone(page);
  await expect(lastMessage(page)).toHaveAttribute("data-status", "done");

  await hook(page, "setSubject", BY_EAR);
  const chips = panel(page).getByTestId("context-chips");
  await expect(chips.locator('[data-chip="answer"]')).toHaveText(/Your code by ear · 1 lines/);
  await expect(chips.locator('[data-chip="key"]')).toHaveText("Key · G major");
  const ear = nextTurnBody(page);
  await panel(page).getByTestId("quick-actions").getByRole("button", { name: "Hint 1 of 4" }).click();
  const e = await ear;
  expect(e.learnerCode).toBe(
    '// written by ear, listening at 0.75× speed\nmelody: n("0 2 4 2").scale("G4:major")',
  );
  await waitDone(page);
  await expect(lastMessage(page)).toHaveAttribute("data-status", "done");
});

const W3_TEXT =
  " In G major: sing [[deg:me]] against [[deg:♯4]], then [[deg:5]]. The leap is a [[term:m3]], the frame a" +
  " [[term:perfect-fifth]]; the [[term:tritone]] splits the octave. [[term:e-flat-major]] has" +
  " [[term:3-flats]]; [[term:2-sharps]] is D major. Find [[note:F#4]] and [[chord:C]], bars [[bars:3-4]].";

/**
 * Adds a Wave 3 paragraph to the fake tutor's real answer (its meta and done stay the server's), and to the same
 * answer when the timeline brings it back from the server after the turn.
 */
async function injectText(route: Route) {
  const res = await route.fetch();
  const body = await res.text();
  const extra = `event: text\ndata: ${JSON.stringify({ delta: W3_TEXT })}\n\n`;
  await route.fulfill({ response: res, body: body.replace(/event: done/, `${extra}event: done`) });
}

async function injectTimeline(route: Route) {
  const res = await route.fetch();
  const json = (await res.json()) as { entries?: { role: string; text: string }[] };
  const last = [...(json.entries ?? [])].reverse().find((e) => e.role === "assistant");
  if (last && !last.text.includes(W3_TEXT)) last.text += `\n\n${W3_TEXT.trim()}`;
  await route.fulfill({ response: res, json });
}

async function injectW3(page: Page) {
  await page.route(/\/api\/tutor\/chat$/, injectText);
  await page.route(/\/api\/tutor\/timeline/, injectTimeline);
}

test("Wave 3 chips: degrees with syllables, intervals, keys and signatures, sounding in the key", async ({
  page,
}) => {
  await openApp(page);
  await injectW3(page);
  await hook(page, "setSubject", {
    thread: { subjectKind: "sketch", subjectId: "sk_w3" },
    title: "Sketch 031",
    tutorOpen: true,
    sketchId: "sk_w3",
    code: 'melody: n("0 2 4 2").scale("G4:major")',
    // As a lesson step with its own labels would (content wins over the lenses there).
    labels: { degrees: true, solfege: true, noteNames: false },
  });
  await expect(panel(page).locator('[data-chip="key"]')).toHaveText("Key · G major");
  await expect(panel(page).locator('[data-chip="labels"]')).toHaveText("Labels · degrees, solfège");
  await panel(page).getByTestId("composer").fill("What should I sing?");
  await panel(page).getByTestId("composer").press("Enter");
  await waitDone(page);
  const msg = lastMessage(page);
  await expect(msg).not.toContainText("[[");
  const degs = msg.locator('[data-token="deg"]');
  await expect(degs.filter({ hasText: "♭3" })).toContainText("me");
  await expect(degs.filter({ hasText: "♯4" })).toContainText("fi");
  await expect(degs.filter({ hasText: "5" }).last()).toHaveAttribute("aria-label", "degree 5, sol");
  await expect(msg.locator('[data-variant="interval"]').first()).toHaveText("m3");
  await expect(msg.locator('[data-variant="interval"]').nth(1)).toHaveText("P5");
  // The glossary's tritone, not met yet on this fresh learner: it plays and carries the preview badge.
  await expect(msg.locator('[data-variant="interval"]').nth(2)).toHaveText("tritonepreview");
  await expect(msg.locator('[data-variant="key"]')).toHaveText("E♭ major");
  await expect(msg.locator('[data-variant="signature"]').first()).toHaveText("3 flats");
  // Hover: the definition, from @oak/theory.
  await msg.locator('[data-variant="key"]').focus();
  await expect(page.getByRole("tooltip")).toContainText("3 flats (B♭ E♭ A♭)");
  await msg.locator('[data-variant="signature"]').nth(1).focus();
  await expect(page.getByRole("tooltip")).toContainText("D major or B minor");
  // A degree's hover names the key it sounds in.
  await degs.filter({ hasText: "5" }).last().focus();
  await expect(page.getByRole("tooltip")).toContainText("after a cadence in G major (D)");
  // A note names its degree in the key, wears it with the degree lens, and lights the staff and the roll.
  const note = msg.locator('[data-token="note"]');
  await expect(note).toContainText("F♯4");
  await expect(note).toContainText("7");
  await note.click();
  const lit = await page.evaluate(
    () =>
      (
        window as unknown as { __oakTutor: { useTutorHighlight: { getState(): { current: unknown } } } }
      ).__oakTutor.useTutorHighlight.getState().current,
  );
  expect(lit).toMatchObject({ kind: "note", midi: 66 });
  await msg.locator('[data-token="bars"]').click();
  const bars = await page.evaluate(
    () =>
      (
        window as unknown as { __oakTutor: { useTutorHighlight: { getState(): { current: unknown } } } }
      ).__oakTutor.useTutorHighlight.getState().current,
  );
  expect(bars).toMatchObject({ kind: "bars", from: 3, to: 4 });
  const chord = msg.locator('[data-token="chord"]');
  await chord.focus();
  await expect(page.getByRole("tooltip")).toContainText("In G major it is IV");
});

for (const m of SCREENSHOT_MATRIX)
  test(`screenshots: Wave 3 chips and an answer subject in ${m.theme} at ${m.width}x${m.height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: m.width, height: m.height });
    await openApp(page, m.theme);
    await injectW3(page);
    await hook(page, "setSubject", {
      ...STAFF,
      thread: { subjectKind: "lesson", subjectId: "U02.L04" },
      key: { tonic: "G", mode: "major" },
      labels: { degrees: true, solfege: true, noteNames: false },
    });
    await panel(page).getByTestId("composer").fill("Which notes change in G?");
    await panel(page).getByTestId("composer").press("Enter");
    await waitDone(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await panel(page)
      .getByTestId("tutor-timeline")
      .evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
    await page.screenshot({ path: `${SHOTS}/w3-chips-${m.theme}-${m.width}x${m.height}.png` });
    await lastMessage(page).locator('[data-variant="key"]').focus();
    await page.screenshot({ path: `${SHOTS}/w3-chips-focus-${m.theme}-${m.width}x${m.height}.png` });
  });

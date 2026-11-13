// Wave 4 in the tutor panel, against the scripted fake backend (OAK_TUTOR_FAKE=1; docs/design/wave2.md §5):
// - chord and Roman-numeral chips light the bars they sound in on the roll and the staff (by mouse and by
//   keyboard), say where in their hover, and wear the preview badge before the learner has met them;
// - the learner's answer travels with the turn for the new step kinds (numerals placed on the palette, a staff of
//   chords) and for a transcription (their code and Oak's bar-by-bar check, never a source), and a transcription
//   offers its own "Request review";
// - a capstone review renders from its schema as a card whose bar links light the bars;
// - screenshots in both themes at both reference sizes.
// The lesson, capstone and transcribe surfaces are other engineers'; the spec stands in for them through
// `window.__oakTutor` (app/src/tutor/dev-hook.ts, dev server only), as tutor.pw.ts and wave3.pw.ts do.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { PREFS_KEY, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const API = stack.apiURL;
const HEADERS = { "X-Oak": "1", "Content-Type": "application/json", Origin: stack.baseURL };
const C_MAJOR = { tonic: "C", mode: "major" };

/** I V vi IV I V IV–V I in C (checked with @oak/theory in app/src/tutor/wave4.test.ts). */
const SONG = 'setcpm(90/4)\n\nchords: chord("<C G Am F C G [F G] C>").voicing().s("piano")';

const SKETCH = {
  thread: { subjectKind: "sketch", subjectId: "sk_w4" },
  title: "Four chords",
  tutorOpen: true,
  sketchId: "sk_w4",
  code: SONG,
  key: C_MAJOR,
};

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

const setSubject = (page: Page, s: unknown) =>
  page.evaluate(
    (subj) =>
      (window as unknown as { __oakTutor: { setSubject(x: unknown): void } }).__oakTutor.setSubject(subj),
    s,
  );
const highlighted = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __oakTutor: { useTutorHighlight: { getState(): { current: unknown } } } }
      ).__oakTutor.useTutorHighlight.getState().current,
  );

const panel = (page: Page) => page.getByTestId("tutor-chat");
const lastMessage = (page: Page) => panel(page).getByTestId("tutor-message").last();
const waitDone = (page: Page) =>
  expect(lastMessage(page)).toHaveAttribute("data-status", /done|error/, { timeout: 30_000 });
async function send(page: Page, text: string) {
  const box = panel(page).getByTestId("composer");
  await box.fill(text);
  await box.press("Enter");
}
const nextTurnBody = (page: Page) =>
  page
    .waitForRequest(
      (r) => /\/api\/tutor\/(hint|explain-mistake|chat)$/.test(r.url()) && r.method() === "POST",
    )
    .then((r) => r.postDataJSON() as { userText: string; learnerCode?: string; stepId?: string });

test.describe.configure({ mode: "serial" });

test("chord and numeral chips light the bars they sound in; a preview before their lesson", async ({
  page,
}) => {
  await openApp(page);
  await setSubject(page, SKETCH);
  await expect(panel(page).locator('[data-chip="key"]')).toHaveText("Key · C major");
  await send(page, "Walk me through the chords #long");
  await waitDone(page);
  const msg = lastMessage(page);
  await expect(msg).not.toContainText("[[");

  // [[chord:C]] → [[chord:F]] → [[chord:G7]], read as [[rn:I]] → [[rn:IV]] → [[rn:V7]].
  const chords = msg.locator('[data-token="chord"]');
  const numerals = msg.locator('[data-token="rn"]');
  await expect(chords.nth(0)).toHaveAttribute("data-bars", "1 5 8");
  await expect(chords.nth(1)).toHaveAttribute("data-bars", "4 7");
  // G7 is not in the piece: it only plays.
  await expect(chords.nth(2)).not.toHaveAttribute("data-bars", /.+/);
  await expect(numerals.nth(1)).toHaveAttribute("data-bars", "4 7");
  // A fresh learner has met neither chord symbols nor numerals: both are previews.
  await expect(chords.nth(0)).toHaveText("Cpreview");
  await expect(numerals.nth(0)).toHaveText("Ipreview");
  await expect(numerals.nth(0)).toHaveAttribute("aria-label", "Roman numeral I, preview, in bars 1, 5 and 8");

  // Mouse: F lights bar 4 (its first bars) on the roll and the staff, without moving the loop.
  await chords.nth(1).click();
  expect(await highlighted(page)).toMatchObject({ kind: "bars", from: 4, to: 4 });
  // Keyboard: focus shows where it sounds, Enter lights it.
  await numerals.nth(0).focus();
  await expect(page.getByRole("tooltip")).toContainText("Sounds in bars 1, 5 and 8");
  await expect(page.getByRole("tooltip")).toContainText("Preview: not introduced yet");
  await page.keyboard.press("Enter");
  expect(await highlighted(page)).toMatchObject({ kind: "bars", from: 1, to: 1 });
  await page.keyboard.press("Escape");
});

test("the answer travels with the turn: numerals placed, a staff of chords, a transcription", async ({
  page,
}) => {
  await openApp(page);
  await setSubject(page, {
    thread: { subjectKind: "lesson", subjectId: "U06.L02" },
    title: "U06.L02 · Roman Numerals",
    tutorOpen: true,
    lessonId: "U06.L02",
    graded: false,
    key: C_MAJOR,
    answer: {
      kind: "numerals",
      key: C_MAJOR,
      numerals: [
        { bar: 1, rn: "I" },
        { bar: 2, rn: "V" },
        { bar: 3, rn: "VI" },
        { bar: 4, rn: "IV" },
      ],
    },
  });
  const chips = panel(page).getByTestId("context-chips");
  await expect(chips.locator('[data-chip="answer"]')).toHaveText("Your numerals · 4 numerals");
  const body = nextTurnBody(page);
  await send(page, "Is bar 3 right?");
  const b = await body;
  expect(b.learnerCode).toBe("Numerals I placed (in C major):\nbar 1: I\nbar 2: V\nbar 3: VI\nbar 4: IV");
  await waitDone(page);

  await setSubject(page, {
    thread: { subjectKind: "transcription", subjectId: "tr_w4" },
    title: "Ladder L3 · item 4",
    tutorOpen: true,
    code: 'bass: n("<0 4 4 3>").scale("C2:major").s("bass")',
    key: C_MAJOR,
    answer: {
      kind: "transcription",
      code: 'bass: n("<0 4 4 3>").scale("C2:major").s("bass")',
      layer: "bass",
      diff: [
        { bar: 1, status: "match" },
        { bar: 2, status: "match" },
        { bar: 3, status: "differs" },
        { bar: 4, status: "match" },
      ],
    },
  });
  await expect(chips.locator('[data-chip="answer"]')).toHaveText("Your transcription · 4 bars, 1 to recheck");
  await expect(chips).toContainText("Audio never sent");
  await expect(
    panel(page).getByTestId("quick-actions").getByRole("button", { name: "Request review" }),
  ).toBeVisible();
  const t = nextTurnBody(page);
  await send(page, "Where should I listen next?");
  const tb = await t;
  expect(tb.learnerCode).toContain('bass: n("<0 4 4 3>")');
  expect(tb.learnerCode).toContain("// bar 3: differs");
  await waitDone(page);
});

async function c0Draft(page: Page): Promise<string> {
  const sk = await page.request.post(`${API}/api/sketches`, {
    headers: HEADERS,
    data: {
      title: "Four on the floor",
      originKind: "capstone",
      originId: "C0",
      sessionId: null,
      code: 'setcpm(96/4)\n\ndrums: s("bd*4, ~ sd ~ sd, hh*8")',
      bpm: 96,
      meter: "4/4",
      key: null,
      analysis: null,
      note: null,
      tutorAssisted: false,
      band: null,
      flags: { lockedTools: [], previewTools: [] },
      ranOk: true,
    },
  });
  expect(sk.ok(), await sk.text()).toBe(true);
  const sketch = (await sk.json()).sketch as { id: string };
  execFileSync("sqlite3", [
    `${stack.dataDir}/oak.db`,
    `INSERT OR REPLACE INTO capstone_state (capstone_id, status, sketch_id, started_at, updated_at) VALUES ('C0', 'in_progress', '${sketch.id}', '2026-11-11T09:00:00.000Z', '2026-11-11T09:00:00.000Z')`,
  ]);
  return sketch.id;
}

test("a capstone review is a card whose bar links light the bars, by mouse and keyboard", async ({
  page,
}) => {
  await openApp(page);
  await c0Draft(page);
  await setSubject(page, {
    thread: { subjectKind: "capstone", subjectId: "C0" },
    title: "C0 · First groove",
    tutorOpen: true,
    capstoneId: "C0",
    code: 'setcpm(96/4)\n\ndrums: s("bd*4, ~ sd ~ sd, hh*8")',
  });
  await panel(page).getByTestId("quick-actions").getByRole("button", { name: "Request review" }).click();
  await waitDone(page);
  const review = lastMessage(page).getByTestId("review");
  await expect(review).toContainText("Claude's comments never affect pass or fail.");
  const barLinks = review.locator('[data-token="bars"]');
  expect(await barLinks.count()).toBeGreaterThanOrEqual(3);
  await barLinks.first().click();
  expect(await highlighted(page)).toMatchObject({ kind: "bars", from: 1 });
  // Keyboard: Tab reaches the revision's bar link; Enter lights its bars.
  const revisionLink = review.getByTestId("review-revisions").locator('[data-token="bars"]').first();
  await revisionLink.focus();
  await expect(revisionLink).toBeFocused();
  await page.keyboard.press("Enter");
  const lit = (await highlighted(page)) as { kind: string; from: number; to: number };
  expect(lit.kind).toBe("bars");
  await expect(revisionLink).toHaveAccessibleName(new RegExp(`Show bars? ${lit.from}`));
});

for (const m of SCREENSHOT_MATRIX)
  test(`screenshots: Wave 4 chips and a review in ${m.theme} at ${m.width}x${m.height}`, async ({ page }) => {
    await page.setViewportSize({ width: m.width, height: m.height });
    await openApp(page, m.theme);
    await setSubject(page, SKETCH);
    await send(page, "Walk me through the chords #long");
    await waitDone(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await lastMessage(page).locator('[data-token="rn"]').first().scrollIntoViewIfNeeded();
    await lastMessage(page).locator('[data-token="rn"]').first().focus();
    await page.screenshot({ path: `${SHOTS}/w4-chips-${m.theme}-${m.width}x${m.height}.png` });

    await c0Draft(page);
    await setSubject(page, {
      thread: { subjectKind: "capstone", subjectId: "C0" },
      title: "C0 · First groove",
      tutorOpen: true,
      capstoneId: "C0",
      code: 'setcpm(96/4)\n\ndrums: s("bd*4, ~ sd ~ sd, hh*8")',
    });
    await panel(page).getByTestId("quick-actions").getByRole("button", { name: "Request review" }).click();
    await waitDone(page);
    await lastMessage(page).getByTestId("review").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/w4-review-${m.theme}-${m.width}x${m.height}.png` });
  });

// Wave 6 in the tutor panel, against the scripted fake backend (OAK_TUTOR_FAKE=1; docs/design/wave2.md §5):
// - an applied numeral, a key and a mode the tutor names are chips: each lights the bars it is in (a numeral read in
//   the key in force at its bar, after a lift) and switches the matching lens on (Roman numerals, Key, Degrees), by
//   mouse and by keyboard; a lens already on, or one still locked, is left as it is (wave6.test.ts proves that);
// - the CF-A review, the longest the tutor writes, renders as a card: three strengths with the strongest first, two
//   revisions, one listening question, its tokens as chips;
// - screenshots in both themes at both reference sizes, one load per theme.
// What the chips say, their bars and lenses, is proved in app/src/tutor/wave6.test.ts; what a review is given and
// held to in server/src/tutor/wave6.reviews.test.ts. Here: that the panel draws them and the clicks reach the lenses.
// The surfaces that set these subjects are other engineers': the spec stands in for them through `window.__oakTutor`
// (app/src/tutor/dev-hook.ts), and seeds unlocks, a stored note and a stored review straight into this stack's
// database, as the Wave 4 and 5 specs do.
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { toolbox } from "../../../../content/toolbox.ts";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { PREFS_KEY, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { CFA_CODE, CFA_REVIEW } from "../../../../server/src/tutor/testing/wave6-fixtures.ts";
import { stack } from "./playwright.config.ts";

test.describe.configure({ mode: "serial" });

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const API = stack.apiURL;
const HEADERS = { "X-Oak": "1", "Content-Type": "application/json", Origin: stack.baseURL };

/**
 * Eight bars that lift from C to D at bar 5: V7/V is D7 in bar 2 (in C) and E7 in bar 6 (in D). The chips read the
 * key plan from the patterned `.scale()` (app/src/tutor/wave6.test.ts pins the same reading).
 */
const LIFT = [
  "setcpm(100/4)",
  "",
  'chords: chord("<C D7 G7 C D E7 A7 D>").voicing().s("piano")',
  'mel: n("<[0 2 4 2] [1 ~ 3# ~] [4 ~ ~ ~] [0 ~ ~ ~]>").scale("<C4:major!4 D4:major!4>").s("piano")',
].join("\n");
const SKETCH_ID = "sk_w6_lift";
const LIFT_SUBJECT = {
  thread: { subjectKind: "sketch", subjectId: SKETCH_ID },
  title: "Lift",
  tutorOpen: true,
  sketchId: SKETCH_ID,
  code: LIFT,
  key: { tonic: "C", mode: "major" },
};
const NOTE =
  "[[rn:V7/V]] leans into [[rn:V7]] in both keys; the song moves to [[term:d-major]] at [[bars:5]]. Try the verse in [[term:dorian]] next.";

const CFA_SUBJECT = {
  thread: { subjectKind: "capstone", subjectId: "CF-A" },
  title: "CF-A · Album Single",
  tutorOpen: true,
  capstoneId: "CF-A",
  code: CFA_CODE,
  key: { tonic: "C", mode: "major" },
};

async function db<T>(fn: (d: import("node:sqlite").DatabaseSync) => T): Promise<T> {
  const { DatabaseSync } = await import("node:sqlite");
  const d = new DatabaseSync(`${stack.dataDir}/oak.db`);
  try {
    d.exec("PRAGMA busy_timeout = 5000");
    return fn(d);
  } finally {
    d.close();
  }
}

/** Every toolbox row, as a learner at the end of the core has them (numerals, degrees, the key lens). */
async function grantAll(): Promise<void> {
  const at = new Date(Date.now() - 86_400_000).toISOString();
  await db((d) => {
    const ins = d.prepare(
      "INSERT OR IGNORE INTO unlocks (item_id, kind, source_kind, source_id, unlocked_at, seen) VALUES (?, ?, 'session-complete', ?, ?, 1)",
    );
    for (const t of toolbox) {
      const lesson = Array.isArray(t.unlock.at) ? t.unlock.at[0] : t.unlock.at;
      ins.run(t.id, t.kind, String(lesson ?? "U00.L01"), at);
    }
  });
}

/** The note on the lifted sketch and the CF-A review of yesterday, once per stack (both tables are append-only). */
async function seed(): Promise<void> {
  await grantAll();
  const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const at = new Date(Date.now() - 86_400_000).toISOString();
  await db((d) => {
    d.prepare(
      "INSERT OR IGNORE INTO tutor_notes (id, day, subject_kind, subject_id, source, text, skill_id, conversation_id, retracted_at, at) VALUES (?, ?, 'sketch', ?, 'review', ?, NULL, NULL, NULL, ?)",
    ).run(`tn_w6_${SKETCH_ID}`, day, SKETCH_ID, NOTE, at);
    const conv = `capstone:CF-A:${day}:review`;
    const exists = d.prepare("SELECT 1 FROM tutor_conversations WHERE id = ?").get(conv);
    if (exists) return;
    d.prepare(
      "INSERT INTO tutor_conversations (id, subject_kind, subject_id, day, thread_kind, effort, session_id, model, prefix_version, created_at) VALUES (?, 'capstone', 'CF-A', ?, 'review', 'high', NULL, NULL, NULL, ?)",
    ).run(conv, day, at);
    const msg = d.prepare(
      "INSERT INTO tutor_messages (conversation_id, seq, at, role, kind, text, learner_code, card_ids_json, review_json, step_id, rung, summary, backend, excluded, error_kind) VALUES (?, ?, ?, ?, 'review-capstone', ?, NULL, '[]', ?, NULL, NULL, NULL, 'claude-cli', 0, NULL)",
    );
    msg.run(conv, 1, at, "user", "I wanted the bridge to feel like the floor dropping.", null);
    msg.run(conv, 2, at, "assistant", "Here is the review of your single.", JSON.stringify(CFA_REVIEW));
  });
}

/** The lenses this spec switches, off to start with, so a click is seen to turn each on. */
async function lensesOff(page: Page): Promise<void> {
  const boot = await (await page.request.get(`${API}/api/bootstrap`, { headers: HEADERS })).json();
  const value = { ...boot.settings.lenses, degrees: false, romanNumerals: false, keyPlan: false };
  const res = await page.request.put(`${API}/api/settings/lenses`, { headers: HEADERS, data: { value } });
  expect(res.ok(), await res.text()).toBe(true);
}
async function lenses(page: Page): Promise<Record<string, boolean | undefined>> {
  const boot = await (await page.request.get(`${API}/api/bootstrap`, { headers: HEADERS })).json();
  return boot.settings.lenses;
}

async function openApp(page: Page, theme: "paper" | "bark" = "paper") {
  await page.routeWebSocket(/.*/, () => {});
  // prefers-reduced-motion: the panel works without its fades (and a screenshot shows a definition fully drawn).
  await page.emulateMedia({ reducedMotion: "reduce" });
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
const notes = (page: Page) => panel(page).getByRole("region", { name: "Notes Claude keeps" });

test.beforeAll(seed);

test("an applied numeral, a key and a mode light their bars and switch their lens on", async ({ page }) => {
  await lensesOff(page);
  await openApp(page);
  await setSubject(page, LIFT_SUBJECT);
  const note = notes(page);
  await expect(note).toBeVisible({ timeout: 15_000 });
  await expect(note).not.toContainText("[[");

  // V7/V in both keys: D7 in bar 2 (C major) and E7 in bar 6 (D major).
  const applied = note.locator('[data-token="rn"]').first();
  // This learner has completed no lesson (the tools are granted, no term is introduced), so the numeral, like the
  // glossary's Dorian below, is badged a preview; it still lights its bars and switches its lens.
  await expect(applied).toHaveText("V7/Vpreview");
  await expect(applied).toHaveAttribute("data-bars", "2 6");
  await expect(applied).toHaveAttribute("data-lens", "chords.romanNumerals");
  await applied.click();
  expect(await highlighted(page)).toMatchObject({ kind: "bars", from: 2, to: 2 });
  await expect.poll(async () => (await lenses(page)).romanNumerals).toBe(true);
  await expect(applied.getByRole("status")).toHaveText("Roman numerals lens on");

  // The key: D major is in force in bars 5–8; keyboard only.
  const key = note.locator('[data-token="term"][data-variant="key"]');
  await expect(key).toHaveText("D major");
  await expect(key).toHaveAccessibleName("key D major, in bars 5–8");
  await key.focus();
  await expect(page.getByRole("tooltip")).toContainText("In force in bars 5–8.");
  await page.keyboard.press("Enter");
  expect(await highlighted(page)).toMatchObject({ kind: "bars", from: 5, to: 8 });
  await expect.poll(async () => (await lenses(page)).keyPlan).toBe(true);
  await page.keyboard.press("Escape");

  // The mode: its colour note by degree, and the Degrees lens.
  const mode = note.locator('[data-token="term"][data-variant="mode"]');
  // This learner has completed no lesson, so the glossary's Dorian is badged a preview; it still plays and switches.
  await expect(mode).toHaveText("Dorianpreview");
  await mode.hover();
  await expect(page.getByRole("tooltip")).toContainText("In C Dorian its colour note is A, degree 6.");
  await mode.click();
  await expect.poll(async () => (await lenses(page)).degrees).toBe(true);
  // A second click leaves the lens on: a chip only ever switches on.
  await mode.click();
  await expect.poll(async () => (await lenses(page)).degrees).toBe(true);
});

test("the CF-A review renders as a card: three strengths, the strongest first, two revisions, one question", async ({
  page,
}) => {
  await openApp(page);
  await setSubject(page, CFA_SUBJECT);
  const review = panel(page).getByTestId("review").last();
  await expect(review).toBeVisible({ timeout: 15_000 });
  await expect(review).toContainText("Claude's comments never affect pass or fail.");
  const strengths = review.getByTestId("review-strengths").locator(":scope > li");
  await expect(strengths).toHaveCount(3);
  // "bridge" becomes a section chip with its letter ("bridge C") once the subject's form is read, which may land
  // before or after the card: either way the strongest point comes first.
  await expect(strengths.first()).toContainText(/The bridge\s?C?\s?is the strongest thing here/);
  await expect(review.getByTestId("review-revisions").locator(":scope > li")).toHaveCount(2);
  await expect(review.getByTestId("review-question")).toContainText("At bar 33, which do you notice first");
  // Tokens in a review are chips, never raw: the chorus's raised 5.
  await expect(review).not.toContainText("[[");
  await expect(review.locator('[data-token="deg"]').first()).toHaveText(/♯5/);
});

for (const theme of ["paper", "bark"] as const)
  test(`screenshots: the Wave 6 chips and the CF-A review in ${theme} at both sizes`, async ({ page }) => {
    await openApp(page, theme);
    await setSubject(page, LIFT_SUBJECT);
    await expect(notes(page)).toBeVisible({ timeout: 15_000 });
    for (const m of SCREENSHOT_MATRIX.filter((x) => x.theme === theme)) {
      await page.setViewportSize({ width: m.width, height: m.height });
      const key = notes(page).locator('[data-token="term"][data-variant="key"]');
      await key.scrollIntoViewIfNeeded();
      // Focus again at this size, so the definition is placed against this viewport.
      await key.evaluate((el) => (el as HTMLElement).blur());
      await key.focus();
      await expect(page.getByRole("tooltip")).toContainText("In force in bars 5–8.");
      // The definition's 120 ms fade has finished before the picture is taken.
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
      );
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${SHOTS}/w6-chips-${theme}-${m.width}x${m.height}.png` });
    }
    await setSubject(page, CFA_SUBJECT);
    const review = panel(page).getByTestId("review").last();
    await expect(review).toBeVisible({ timeout: 15_000 });
    for (const m of SCREENSHOT_MATRIX.filter((x) => x.theme === theme)) {
      await page.setViewportSize({ width: m.width, height: m.height });
      await review.getByTestId("review-strengths").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/w6-cfa-review-${theme}-${m.width}x${m.height}.png` });
    }
  });

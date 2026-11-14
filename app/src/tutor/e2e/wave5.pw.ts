// Wave 5 in the tutor panel, against the scripted fake backend (OAK_TUTOR_FAKE=1; docs/design/wave2.md §5):
// - in the Studio, a song in sections gives the panel a Form chip, and a section the tutor names ("Chorus 2", "the
//   verse") is a chip that selects that section in the form view: the Workbench loops it and the section ribbon
//   marks it, by mouse and by keyboard;
// - a C5 review has two revisions (contracts §10.6) and renders as a card;
// - "Request review" follows the pending state (c9): "Review requested" and disabled while it is on its way, and a
//   request that fails before reaching the server clears it at once;
// - screenshots in both themes at both reference sizes.
// The Wave 5 dev seeds are not built yet (wave5.md §6), so unlocks, a capstone draft and a stored review note are
// written straight into this stack's database, as the Wave 4 specs do.
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { toolbox } from "../../../../content/toolbox.ts";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { PREFS_KEY, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";

test.describe.configure({ mode: "serial" });

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const API = stack.apiURL;
const HEADERS = { "X-Oak": "1", "Content-Type": "application/json", Origin: stack.baseURL };
const WB = "[data-testid=workbench]";

/** Verse Chorus Verse Chorus 2, four bars each (C3's shape; its facts are pinned in server/src/tutor/wave5.music.test.ts). */
const SONG = [
  "setcpm(100/4)",
  "",
  'const chordsVerse = chord("<C Am F G>").voicing().s("piano")',
  'const chordsChorus = chord("<F G C C>").voicing().s("piano")',
  'const chordsChorus2 = chord("<F G C C>").voicing().s("piano")',
  'const melVerse = n("<[0 2 4 2] [4 ~ 2 ~] [3 2 1 ~] [1 ~ ~ ~]>").scale("C4:major").s("piano")',
  'const melChorus = n("<[5 5 4 5] [7 ~ 6 ~] [4 4 2 4] [7 ~ ~ ~]>").scale("C4:major").s("piano")',
  "chords: arrange([4, chordsVerse], [4, chordsChorus], [4, chordsVerse], [4, chordsChorus2])",
  "mel: arrange([4, melVerse], [4, melChorus], [4, melVerse], [4, melChorus])",
].join("\n");

/** A 12-bar quick-change shuffle in C (C5's shape). */
const SHUFFLE = [
  "setcpm(100/4)",
  "",
  'chords: chord("<C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>").voicing().s("piano")',
  'bass: note("<c2 f2 c2 c2 f2 f2 c2 c2 g2 f2 c2 g2>").s("ebass")',
  'hats: s("hh*8").swingBy(1/3, 4)',
].join("\n");

const NOTE =
  "Revision: give Chorus 2 one new detail, so it lifts above the first chorus; the verse can stay quiet.";

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

/** Every toolbox row, as a learner well into the course has them (the sections lens included). */
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

async function sketch(page: Page, title: string, code: string, origin: { kind: string; id: string | null }) {
  const res = await page.request.post(`${API}/api/sketches`, {
    headers: HEADERS,
    data: {
      title,
      originKind: origin.kind,
      originId: origin.id,
      sessionId: null,
      code,
      bpm: 100,
      meter: "4/4",
      key: { tonic: "C", mode: origin.id === "C5" ? "blues" : "major" },
      analysis: null,
      note: null,
      tutorAssisted: false,
      band: null,
      flags: { lockedTools: [], previewTools: [] },
      ranOk: true,
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()).sketch as { id: string }).id;
}

async function prefs(page: Page, theme: "paper" | "bark" = "paper") {
  await page.routeWebSocket(/.*/, () => {});
  await useUiPrefs(page, { theme, motion: "off" });
  await page.addInitScript((key) => {
    const cur = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...cur, tutorOpen: true }));
  }, PREFS_KEY);
}

const panel = (page: Page) => page.getByTestId("tutor-chat");
const ready = (page: Page) =>
  expect(page.getByTestId("tutor-status")).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
const lastMessage = (page: Page) => panel(page).getByTestId("tutor-message").last();
const waitDone = (page: Page) =>
  expect(lastMessage(page)).toHaveAttribute("data-status", /done|error/, { timeout: 30_000 });
const ribbon = (page: Page, tag: string) =>
  page.locator(`${WB} [data-testid=section-ribbon] [data-tag="${tag}"]`);

/** The Studio on a song in sections, with a stored review note naming its sections. */
async function studioWithNote(page: Page, theme: "paper" | "bark" = "paper"): Promise<string> {
  await grantAll();
  const id = await sketch(page, "Lights On", SONG, { kind: "free", id: null });
  const day = new Date().toISOString().slice(0, 10);
  await db((d) =>
    d
      .prepare(
        "INSERT INTO tutor_notes (id, day, subject_kind, subject_id, source, text, skill_id, conversation_id, retracted_at, at) VALUES (?, ?, 'sketch', ?, 'review', ?, NULL, NULL, NULL, ?)",
      )
      .run(`tn_w5_${id}`, day, id, NOTE, new Date().toISOString()),
  );
  await prefs(page, theme);
  await page.goto(`/studio/${id}`);
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(`${WB} [data-testid=section-ribbon]`)).toBeVisible({ timeout: 30_000 });
  await ready(page);
  return id;
}

test("section names the tutor writes select the section in the form view, by mouse and by keyboard", async ({
  page,
}) => {
  await studioWithNote(page);
  // The panel shows what the next turn carries: the form, from the Workbench's own form view.
  await expect(panel(page).locator('[data-chip="form"]')).toHaveText("Form · ABAB · Verse, Chorus");

  const chorus2 = panel(page).locator('[data-token="section"][data-section="chorus2"]');
  await expect(chorus2).toHaveText(/Chorus 2\s*B/);
  await expect(chorus2).toHaveAccessibleName("Section Chorus 2, bars 13–16: select and loop it");
  await expect(ribbon(page, "chorus2")).toHaveAttribute("aria-pressed", "false");
  await chorus2.click();
  // The Workbench loops exactly that section; the ribbon marks it.
  await expect(ribbon(page, "chorus2")).toHaveAttribute("aria-pressed", "true");
  await expect(ribbon(page, "verse").first()).toHaveAttribute("aria-pressed", "false");

  // Keyboard: Tab reaches "the verse" (the first verse) and Enter selects it.
  const verse = panel(page).locator('[data-token="section"][data-section="verse"]');
  await verse.focus();
  await expect(verse).toBeFocused();
  await expect(page.getByRole("tooltip")).toContainText("Verse: bars 1–4, section A of the form.");
  await page.keyboard.press("Enter");
  await expect(ribbon(page, "verse").first()).toHaveAttribute("aria-pressed", "true");
  await expect(ribbon(page, "chorus2")).toHaveAttribute("aria-pressed", "false");

  // With the sections lens off the ribbon is gone, and a section chip still loops exactly its bars.
  await page.locator(WB).getByRole("button", { name: "Sections", exact: true }).click();
  await expect(page.locator(`${WB} [data-testid=section-ribbon]`)).toHaveCount(0);
  await chorus2.click();
  await expect(page.locator(WB).getByText("Loop bars 13–16")).toBeVisible();
  await page.locator(WB).getByRole("button", { name: "Sections", exact: true }).click();

  // The next turn names the sections with their bars, as the ribbon does.
  const body = page
    .waitForRequest((r) => /\/api\/tutor\/chat$/.test(r.url()) && r.method() === "POST")
    .then((r) => r.postDataJSON() as { userText: string });
  const box = panel(page).getByTestId("composer");
  await box.fill("Does the chorus lift enough?");
  await box.press("Enter");
  expect((await body).userText).toContain(
    "sections Verse bars 1–4, Chorus bars 5–8, Verse bars 9–12, Chorus 2 bars 13–16",
  );
  await waitDone(page);
});

async function c5Draft(page: Page): Promise<void> {
  const id = await sketch(page, "Back Porch Shuffle", SHUFFLE, { kind: "capstone", id: "C5" });
  await db((d) =>
    d
      .prepare(
        "INSERT OR REPLACE INTO capstone_state (capstone_id, status, sketch_id, started_at, updated_at) VALUES ('C5', 'in_progress', ?, ?, ?)",
      )
      .run(id, "2026-11-12T09:00:00.000Z", "2026-11-12T09:00:00.000Z"),
  );
}

const C5_SUBJECT = {
  thread: { subjectKind: "capstone", subjectId: "C5" },
  title: "C5 · 12-Bar Shuffle",
  tutorOpen: true,
  capstoneId: "C5",
  code: SHUFFLE,
  key: { tonic: "C", mode: "blues" },
};

async function openOnSettings(page: Page, theme: "paper" | "bark" = "paper") {
  await prefs(page, theme);
  await page.goto("/settings/about");
  await page.waitForFunction(() => "__oakTutor" in window);
  await ready(page);
}
const setSubject = (page: Page, s: unknown) =>
  page.evaluate(
    (subj) =>
      (window as unknown as { __oakTutor: { setSubject(x: unknown): void } }).__oakTutor.setSubject(subj),
    s,
  );
const reviewPhase = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __oakTutor: { reviewRequestOf(t: unknown): { phase: string } | null };
        }
      ).__oakTutor.reviewRequestOf({ subjectKind: "capstone", subjectId: "C5" })?.phase ?? null,
  );

test("a C5 review has two revisions; Request review waits while it is on its way (c9)", async ({ page }) => {
  await openOnSettings(page);
  await c5Draft(page);
  await setSubject(page, C5_SUBJECT);
  const button = panel(page).getByTestId("quick-actions").locator('[data-action="review"]');
  await expect(button).toHaveText("Request review");
  await button.click();
  // Pending at once: the button says so and cannot send a second request.
  await expect(button).toHaveText("Review requested");
  await expect(button).toBeDisabled();
  await waitDone(page);
  const review = lastMessage(page).getByTestId("review");
  await expect(review).toContainText("Claude's comments never affect pass or fail.");
  await expect(review.getByTestId("review-revisions").locator(":scope > li")).toHaveCount(2);
  expect(await reviewPhase(page)).toBe("answered");
  await expect(button).toHaveText("Request review");
  await expect(button).toBeEnabled();
});

test("a review request that fails before reaching the server clears pending at once (c9)", async ({
  page,
}) => {
  await openOnSettings(page);
  await setSubject(page, C5_SUBJECT);
  await page.route("**/api/tutor/reviews/capstone", (route) => route.abort("connectionrefused"));
  const button = panel(page).getByTestId("quick-actions").locator('[data-action="review"]');
  const started = Date.now();
  await button.click();
  await waitDone(page);
  await expect(lastMessage(page)).toHaveAttribute("data-status", "error");
  expect(await reviewPhase(page)).toBe("failed-early");
  // Not two minutes: the button is back as soon as the request has failed.
  await expect(button).toHaveText("Request review");
  await expect(button).toBeEnabled();
  expect(Date.now() - started).toBeLessThan(20_000);
  await page.unroute("**/api/tutor/reviews/capstone");
});

for (const m of SCREENSHOT_MATRIX)
  test(`screenshots: section chips and a two-revision review in ${m.theme} at ${m.width}x${m.height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: m.width, height: m.height });
    await studioWithNote(page, m.theme);
    const chip = panel(page).locator('[data-token="section"][data-section="chorus2"]');
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    await expect(ribbon(page, "chorus2")).toHaveAttribute("aria-pressed", "true");
    await chip.focus();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/w5-sections-${m.theme}-${m.width}x${m.height}.png` });

    await page.goto("/settings/about");
    await page.waitForFunction(() => "__oakTutor" in window);
    await ready(page);
    await c5Draft(page);
    await setSubject(page, C5_SUBJECT);
    const button = panel(page).getByTestId("quick-actions").locator('[data-action="review"]');
    await button.click();
    // The review message is the last one only once the request is under way, and it renders again when the answer
    // settles: waiting for "done" alone could read an earlier message, and the scroll then met a review that was
    // being replaced (the race of the Wave 6 run). Wait for the settled review: its two revisions, the button back.
    await expect(button).toHaveText("Review requested");
    await waitDone(page);
    const review = lastMessage(page).getByTestId("review");
    await expect(review.getByTestId("review-revisions").locator(":scope > li")).toHaveCount(2);
    await expect(button).toHaveText("Request review");
    await review.getByTestId("review-revisions").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/w5-review-${m.theme}-${m.width}x${m.height}.png` });
  });

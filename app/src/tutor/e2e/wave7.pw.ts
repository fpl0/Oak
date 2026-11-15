// Wave 7 in the tutor panel, against the scripted fake backend (OAK_TUTOR_FAKE=1; docs/design/wave2.md §5):
// - a voicing type, a tension, a clave and a register the tutor names are chips: each lights the bars the Workbench's
//   track lenses found it in and switches the matching lens on (Voicings, Tensions, Registers), by mouse and by
//   keyboard; the Clave lens, still locked for a learner who has not done R3.L02, is left as it is;
// - screenshots in both themes at both reference sizes, one load per theme.
// What the chips say, their bars and lenses, is proved in app/src/tutor/wave7.test.ts; what a review is given and
// held to in server/src/tutor/wave7.reviews.test.ts. Here: that the panel draws them and the clicks reach the lenses.
// The surfaces that set subjects are other engineers': the spec stands in for them through `window.__oakTutor`
// (app/src/tutor/dev-hook.ts), passing the track marks a Workbench would, and seeds unlocks and a stored note straight
// into this stack's database, as the Wave 4–6 specs do.
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

/** A neo-soul sketch in D: rootless rhodes chords, a clash in bar 3, a son 3-2 clave on the rim. */
const SOUL = [
  "setcpm(72/4)",
  "",
  'perc: s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>")',
  'chords: note("<[f#3,a3,c#4,e4] [g3,b3,d4,f#4] [f#2,a2,e3,a3] [a3,c#4,d4,f#4]>").s("rhodes")',
  'bass: note("<d2 e2 f#2 b1>").s("bass")',
  'mel: note("<[a4@3 b4] [d5@2 ~ c#5] [a4@4] [f#4@2 e4 d4]>").s("vibes")',
].join("\n");
const SKETCH_ID = "sk_w7_soul";
/** What the Workbench's track lenses read from SOUL (the marks `useSubjectHarmony` keeps on the subject). */
const SOUL_SUBJECT = {
  thread: { subjectKind: "sketch", subjectId: SKETCH_ID },
  title: "Low Light",
  tutorOpen: true,
  sketchId: SKETCH_ID,
  code: SOUL,
  key: { tonic: "D", mode: "major" },
  track: {
    voicings: { "rootless-a": [1, 2], "rootless-b": [4] },
    voicingNotes: { "rootless-a": [54, 57, 61, 64], "rootless-b": [57, 61, 62, 66] },
    tensions: { "13": [1, 2], "11": [4] },
    clave: { type: "son", direction: "3-2", bars: [1, 2, 3, 4] },
    clashes: [3],
  },
};
const NOTE =
  "Bars 1 and 2 are an [[term:a-voicing]] and bar 4 a B: the [[term:extension]] in the tune sits over them. The rim plays [[term:son-3-2]]; the [[term:register]] of bar 3 is low.";

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

/** Every toolbox row (the voicing, tension and register lenses open with a tool; the clave lens with a lesson). */
async function seed(): Promise<void> {
  const at = new Date(Date.now() - 86_400_000).toISOString();
  const day = at.slice(0, 10);
  await db((d) => {
    const ins = d.prepare(
      "INSERT OR IGNORE INTO unlocks (item_id, kind, source_kind, source_id, unlocked_at, seen) VALUES (?, ?, 'session-complete', ?, ?, 1)",
    );
    for (const t of toolbox) {
      const lesson = Array.isArray(t.unlock.at) ? t.unlock.at[0] : t.unlock.at;
      ins.run(t.id, t.kind, String(lesson ?? "U00.L01"), at);
    }
    d.prepare(
      "INSERT OR IGNORE INTO tutor_notes (id, day, subject_kind, subject_id, source, text, skill_id, conversation_id, retracted_at, at) VALUES (?, ?, 'sketch', ?, 'review', ?, NULL, NULL, NULL, ?)",
    ).run(`tn_w7_${SKETCH_ID}`, day, SKETCH_ID, NOTE, at);
  });
}

async function lenses(page: Page): Promise<Record<string, boolean | undefined>> {
  const boot = await (await page.request.get(`${API}/api/bootstrap`, { headers: HEADERS })).json();
  return boot.settings.lenses;
}
/** The track lenses this spec switches, off to start with, so a click is seen to turn each on. */
async function trackLensesOff(page: Page): Promise<void> {
  const value = { ...(await lenses(page)), voicings: false, tensions: false, registers: false, clave: false };
  const res = await page.request.put(`${API}/api/settings/lenses`, { headers: HEADERS, data: { value } });
  expect(res.ok(), await res.text()).toBe(true);
}

async function openApp(page: Page, theme: "paper" | "bark" = "paper") {
  await page.routeWebSocket(/.*/, () => {});
  await page.emulateMedia({ reducedMotion: "reduce" });
  await useUiPrefs(page, { theme, motion: "off" });
  await page.addInitScript((key) => {
    const cur = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...cur, tutorOpen: true }));
  }, PREFS_KEY);
  await page.goto("/settings/about");
  await page.waitForFunction(() => "__oakTutor" in window);
  await expect(page.getByTestId("tutor-status")).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
  await page.evaluate(
    (subj) =>
      (window as unknown as { __oakTutor: { setSubject(x: unknown): void } }).__oakTutor.setSubject(subj),
    SOUL_SUBJECT,
  );
}
const highlighted = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __oakTutor: { useTutorHighlight: { getState(): { current: unknown } } } }
      ).__oakTutor.useTutorHighlight.getState().current,
  );
const notes = (page: Page) =>
  page.getByTestId("tutor-chat").getByRole("region", { name: "Notes Claude keeps" });

test.beforeAll(seed);

test("voicing, tension, clave and register chips light their bars and switch their lens on", async ({
  page,
}) => {
  await trackLensesOff(page);
  await openApp(page);
  const note = notes(page);
  await expect(note).toBeVisible({ timeout: 15_000 });
  await expect(note).not.toContainText("[[");

  // A voicing type, by mouse: the rootless A voicings of bars 1–2, the Voicings lens.
  const voicing = note.locator('[data-token="term"][data-variant="voicing"]');
  await expect(voicing).toHaveAttribute("data-bars", "1 2");
  await expect(voicing).toHaveAttribute("data-lens", "track.voicings");
  await voicing.click();
  expect(await highlighted(page)).toMatchObject({ kind: "bars", from: 1, to: 2 });
  await expect.poll(async () => (await lenses(page)).voicings).toBe(true);
  await expect(voicing.getByRole("status")).toHaveText("Voicings lens on");

  // A register, by keyboard only: the clash of bar 3, the Registers lens.
  const register = note.locator('[data-token="term"][data-variant="register"]');
  await expect(register).toHaveAccessibleName(/^term register(, preview)?, in bar 3$/);
  await register.focus();
  await expect(page.getByRole("tooltip")).toContainText("Here: low notes too close together in bar 3.");
  await page.keyboard.press("Enter");
  expect(await highlighted(page)).toMatchObject({ kind: "bars", from: 3, to: 3 });
  await expect.poll(async () => (await lenses(page)).registers).toBe(true);
  await page.keyboard.press("Escape");

  // A tension: the bars of the melody's tensions, the Tensions lens.
  const tension = note.locator('[data-token="term"][data-variant="tension"]');
  await expect(tension).toHaveAttribute("data-bars", "1 2 4");
  await tension.click();
  await expect.poll(async () => (await lenses(page)).tensions).toBe(true);

  // The clave by type and direction lights the windows that hold it; its lens stays locked (R3.L02 not done).
  const clave = note.locator('[data-token="term"][data-variant="clave"]');
  await expect(clave).toHaveText("son 3-2");
  await clave.click();
  expect(await highlighted(page)).toMatchObject({ kind: "bars", from: 1, to: 4 });
  expect((await lenses(page)).clave).toBe(false);
});

for (const theme of ["paper", "bark"] as const)
  test(`screenshots: the Wave 7 chips in ${theme} at both sizes`, async ({ page }) => {
    await openApp(page, theme);
    await expect(notes(page)).toBeVisible({ timeout: 15_000 });
    for (const m of SCREENSHOT_MATRIX.filter((x) => x.theme === theme)) {
      await page.setViewportSize({ width: m.width, height: m.height });
      const chip = notes(page).locator('[data-token="term"][data-variant="voicing"]');
      await chip.scrollIntoViewIfNeeded();
      await chip.evaluate((el) => (el as HTMLElement).blur());
      await chip.focus();
      await expect(page.getByRole("tooltip")).toContainText("Here: rootless A voicings in bars 1–2.");
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
      );
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${SHOTS}/w7-chips-${theme}-${m.width}x${m.height}.png` });
      // The note itself, its chips in a row, with no definition over it.
      await chip.evaluate((el) => (el as HTMLElement).blur());
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await notes(page).screenshot({ path: `${SHOTS}/w7-note-${theme}-${m.width}x${m.height}.png` });
    }
  });

// The Wave 5 carry-overs the lesson player owns, in the real app from one dev seed:
//  d16  after a lesson ear step is answered it offers what a drill offers: the note alone and the note in context
//       (a drawn trial, U03.L02 S7), or the tune alone (an authored stimulus, U14.L01 S6); never before the answer.
//       A step of several answers names the part that is off ("Part 1 is not right yet.") and marks it.
//  d4   an unchecked line of numerals survives a reload (U15.L02 S6), the disabled Check says which bars are still
//       empty, and the kept answer is forgotten when the step is left or checked.
//  d15  a Make that builds on an earlier lesson's sketch (U10.L06 on U10.L05's) opens with the learner's own sketch
//       when the server has one, offers "Start from Oak's copy" and back again without losing an edit, and opens
//       with Oak's copy when there is none; and once against the real server, from the day U10.L06 is the lesson.
// Later lessons are played as previews from the same seed (every step in the real app, nothing saved).
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";
import { expect, setCode, snapshot, stepIs, test, trialAnswer } from "./support.ts";
import { api, noOverflow, onScreen, reseedFresh, seed } from "./w3support.ts";
import { lessonDefW5 } from "./w5walk.ts";
import { answerWidget, enterNumerals, type PartLike, wrongFor } from "./walk.ts";

const H = { "X-Oak": "1", "Content-Type": "application/json", Origin: stack.baseURL };

test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ request }) => {
  // U03.L02 is today's lesson; nothing in this file changes what a later test needs.
  const r = await request.post(`${stack.apiURL}/api/dev/seed`, {
    headers: H,
    data: { point: "after C1.S1" },
    timeout: 120_000,
  });
  expect(r.ok(), `seed: ${r.status()}`).toBe(true);
});
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

const step$ = (page: Page) => page.getByTestId("lesson-step");

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

/**
 * The state on screen in Paper and Bark at 1440×900 and 1280×800, in place (the theme follows `<html data-theme>`;
 * a reload would lose the state): no horizontal overflow, the named control on screen.
 */
async function shootBoth(page: Page, name: string, control: string) {
  const size = page.viewportSize();
  for (const theme of ["paper", "bark"] as const) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const m of SCREENSHOT_MATRIX.filter((x) => x.theme === theme)) {
      await page.setViewportSize({ width: m.width, height: m.height });
      await noOverflow(page);
      await onScreen(page, control);
      await shoot(page, SHOTS, name, theme);
    }
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "paper";
  });
  if (size) await page.setViewportSize(size);
}

async function open(page: Page, lesson: string, step: string, preview: boolean) {
  await page.goto(`/learn/${lesson}?${preview ? "preview=true&" : ""}step=${step}`);
  await stepIs(page, step);
}

/** A button of the after-answer pair plays (pressed, "Stop") and can be stopped. */
async function playsAndStops(page: Page, testId: string, scope = step$(page)) {
  const b = scope.getByTestId(testId).first();
  const label = ((await b.textContent()) ?? "").trim();
  await b.click();
  await expect(b, `${testId} plays`).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
  await expect(b).toHaveText("Stop");
  await b.click();
  await expect(b, `${testId} stops`).toHaveAttribute("aria-pressed", "false");
  await expect(b).toHaveText(label);
}

test("d16: a drawn ear step offers the note alone and in context once it is answered", async ({ page }) => {
  await open(page, "U03.L02", "S7", false);
  const def = await lessonDefW5("U03.L02");
  const ex = def.steps.find((s) => s.id === "S7")?.exercise as PartLike;
  await expect(page.getByTestId("play-stimulus")).toBeVisible({ timeout: 30_000 });
  // Before an answer there is nothing to give away.
  await expect(page.getByTestId("ear-after")).toHaveCount(0);
  const expected = (await trialAnswer(page)) as Record<string, unknown>;
  expect(expected, "a drawn trial").not.toBeNull();
  expect(await answerWidget(page, ex, await wrongFor(page, ex, expected))).toBe(true);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  const after = page.getByTestId("ear-after");
  await expect(after).toBeVisible();
  // The drill's own two listens, in the drill's own words.
  await expect(after.getByTestId("hear-alone")).toHaveText("The note alone");
  await expect(after.getByTestId("hear-in-context")).toHaveText("The note in context");
  await playsAndStops(page, "hear-alone");
  await playsAndStops(page, "hear-in-context");
  await shootBoth(page, "w6-ear-after", "check");
  // Keyboard: both are ordinary buttons in the tab order, Space plays.
  await after.getByTestId("hear-alone").focus();
  await page.keyboard.press("Space");
  await expect(after.getByTestId("hear-alone")).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
  await page.keyboard.press("Space");
  await expect(after.getByTestId("hear-alone")).toHaveAttribute("aria-pressed", "false");
  // Right at the second try: the pair stays for another listen.
  expect(await answerWidget(page, ex, { answer: expected })).toBe(true);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass", { timeout: 30_000 });
  await expect(after).toBeVisible();
});

test("d16: several answers by ear name the part that is off, and each part offers the tune alone", async ({
  page,
}) => {
  await open(page, "U14.L01", "S6", true);
  const def = await lessonDefW5("U14.L01");
  const s6 = def.steps.find((s) => s.id === "S6")?.exercise as { parts?: PartLike[] } | undefined;
  const parts = s6?.parts ?? [];
  expect(parts.length, "U14.L01 S6 is in parts").toBeGreaterThan(1);
  const box = (i: number) => step$(page).locator(`li[data-part="${i + 1}"]`);
  await expect(box(0).getByTestId("play-stimulus")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ear-after")).toHaveCount(0);
  const responseOf = (p: PartLike, want: "pass" | "fail") =>
    (p.tests.find((t) => t.expect === want) as { response: Record<string, unknown> }).response;
  for (const [i, p] of parts.entries())
    expect(await answerWidget(page, p, responseOf(p, i === 0 ? "fail" : "pass"), box(i))).toBe(true);
  await page.getByTestId("check").click();
  const fb = page.getByTestId("step-feedback");
  await expect(fb).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  await expect(fb).toContainText("Part 1 is not right yet.");
  await expect(fb).not.toContainText(/notes? differ/);
  // One pair per part, each for its own phrase: a tune over a bass note, so "the tune alone".
  await expect(page.getByTestId("ear-after")).toHaveCount(parts.length, { timeout: 20_000 });
  await expect(box(0).getByTestId("hear-alone")).toHaveText("The tune alone");
  await expect(box(0).getByTestId("hear-in-context")).toHaveText("In context");
  await shootBoth(page, "w6-ear-parts-wrong", "check");
  await playsAndStops(page, "hear-alone", box(0));
  await playsAndStops(page, "hear-in-context", box(1));
  // Part 1 put right: the step passes.
  expect(
    await answerWidget(page, parts[0] as PartLike, responseOf(parts[0] as PartLike, "pass"), box(0)),
  ).toBe(true);
  await page.getByTestId("check").click();
  await expect(fb).toHaveAttribute("data-status", "pass", { timeout: 30_000 });
});

test("d4: unchecked numerals survive a reload; Check says which bars are empty; leaving or checking forgets them", async ({
  page,
}) => {
  await open(page, "U15.L02", "S6", true);
  const slot = (i: number) => step$(page).locator(`[data-rn-slot="${i}"]`).first();
  await expect(slot(0)).toBeVisible({ timeout: 30_000 });
  // Nothing entered: Check is shut and says nothing yet.
  await expect(page.getByTestId("check")).toBeDisabled();
  await expect(page.getByTestId("check-reason")).toHaveCount(0);
  expect(await enterNumerals(page, step$(page), ["IV", "V7/V"])).toBe(true);
  await expect(page.getByTestId("check-reason")).toHaveText("Bar 3 and bar 4 are still empty.");
  await expect(page.getByTestId("check")).toBeDisabled();
  await expect(page.getByTestId("check")).toHaveAttribute("aria-describedby", /check-why$/);
  const before = [await slot(0).textContent(), await slot(1).textContent()];
  expect(before[0]).toContain("IV");
  expect(before[1]).toContain("V7/V");

  await page.reload();
  await stepIs(page, "S6");
  await expect(slot(0)).toContainText("IV", { timeout: 30_000 });
  await expect(slot(1)).toContainText("V7/V");
  await expect(page.getByTestId("check-reason")).toHaveText("Bar 3 and bar 4 are still empty.");
  await shootBoth(page, "w6-check-reason", "check");

  // Leaving the step forgets it: back one step and forward again.
  await page.keyboard.press("Alt+ArrowLeft");
  await stepIs(page, "S5");
  await page.goto("/learn/U15.L02?preview=true&step=S6");
  await stepIs(page, "S6");
  await expect(slot(0)).toBeVisible({ timeout: 30_000 });
  await expect(slot(0)).not.toContainText("IV");
  await expect(page.getByTestId("check-reason")).toHaveCount(0);

  // The whole line, checked: the server (here the preview) has it now, and a reload starts clean.
  expect(await enterNumerals(page, step$(page), ["IV", "V7/V", "V7", "I"])).toBe(true);
  await expect(page.getByTestId("check-reason")).toHaveCount(0);
  await expect(page.getByTestId("check")).toBeEnabled();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass", { timeout: 30_000 });
  await page.reload();
  await stepIs(page, "S6");
  await expect(slot(0)).toBeVisible({ timeout: 30_000 });
  await expect(slot(0)).not.toContainText("IV");
});

const OWN =
  'setcpm(96/4)\n\nchords: chord("<Am F C G>").voicing().s("piano")\nmel: n("0 2 4 2").scale("A4:minor").s("piano")';

/** `GET /lessons/U10.L05/sketch` answered as the server will once it holds (or does not hold) a sketch. */
async function sketchRoute(page: Page, sketch: "own" | "none") {
  const now = new Date().toISOString();
  await page.route("**/api/lessons/U10.L05/sketch", (route) =>
    route.fulfill({
      json: {
        lessonId: "U10.L05",
        sketch:
          sketch === "none"
            ? null
            : {
                id: "sk_own",
                title: "My Aeolian loop",
                originKind: "lesson-make",
                originId: "U10.L05",
                currentVersion: 2,
                tags: [],
                archived: false,
                listeningNote: null,
                createdAt: now,
                updatedAt: now,
                versions: [1, 2].map((version) => ({
                  sketchId: "sk_own",
                  version,
                  code: version === 2 ? OWN : "setcpm(96/4)",
                  bpm: 96,
                  meter: "4/4",
                  key: { tonic: "A", mode: "minor" },
                  analysis: null,
                  note: null,
                  tutorAssisted: false,
                  band: null,
                  flags: { lockedTools: [], previewTools: [] },
                  createdAt: now,
                })),
              },
      },
    }),
  );
}

const codeNow = async (page: Page) =>
  ((await snapshot(page)) as { code: string | null } | null)?.code ?? null;

test("d15: a Make that builds on an earlier sketch opens with the learner's own, with Oak's copy one press away", async ({
  page,
}) => {
  const def = await lessonDefW5("U10.L06");
  const make = def.steps.find((s) => s.kind === "make") as { id: string; exercise: PartLike };
  const starter = (make.exercise.code?.starter ?? "").replace(/[⟪⟫]/g, "");
  await sketchRoute(page, "own");
  await open(page, "U10.L06", make.id, true);
  const note = page.getByTestId("make-start-note");
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note).toHaveAttribute("data-source", "sketch");
  await expect(note).toContainText("your own sketch");
  await expect(note).toContainText("My Aeolian loop");
  // The lesson it came from is named by its title, never by its ID.
  await expect(note).not.toContainText(/U\d\d\.L\d\d/);
  await expect.poll(() => codeNow(page), { message: "the editor holds the sketch" }).toBe(OWN);
  await expect(step$(page).locator(".cm-content").first()).toContainText('chord("<Am F C G>")');
  await shootBoth(page, "w6-make-own-sketch", "save-sketch");

  // An edit of the sketch, then Oak's copy, then back: the edit is still there.
  const edited = `${OWN}\nbass: n("0 ~ 0 ~").scale("A2:minor").s("ebass")`;
  await setCode(page, edited);
  await page.getByTestId("make-oak-copy").click();
  await expect(note).toHaveAttribute("data-source", "oak");
  await expect(note).toContainText("Oak's copy");
  await expect.poll(() => codeNow(page), { message: "Oak's copy in the editor" }).toBe(starter);
  await page.getByTestId("make-own-sketch").focus();
  await page.keyboard.press("Enter");
  await expect(note).toHaveAttribute("data-source", "sketch");
  await expect.poll(() => codeNow(page), { message: "the edited sketch is back" }).toBe(edited);
  // The checklist grades what is in the editor, and the sketch saves (a preview: nothing is stored).
  await expect(page.getByTestId("make-checklist")).toBeVisible();
  await expect(page.getByTestId("save-sketch")).toBeEnabled();
});

test("d15: with no sketch of that lesson the Make opens with Oak's copy, as before", async ({ page }) => {
  const def = await lessonDefW5("U10.L06");
  const make = def.steps.find((s) => s.kind === "make") as { id: string; exercise: PartLike };
  const starter = (make.exercise.code?.starter ?? "").replace(/[⟪⟫]/g, "");
  await sketchRoute(page, "none");
  await open(page, "U10.L06", make.id, true);
  await expect(page.getByTestId("make-checklist")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("make-start-note")).toHaveCount(0);
  await expect(page.getByTestId("make-oak-copy")).toHaveCount(0);
  await expect(step$(page).locator(".cm-content").first()).toContainText(
    (starter.split("\n").find((l) => l.includes("(")) ?? "").trim().slice(0, 24),
  );
});

test("d15 against the real server: U10.L06's Make opens with the sketch the learner saved in U10.L05", async ({
  page,
}) => {
  // The day U10.L06 is the lesson: U10.L05's Make was saved by the seeded learner two sessions ago.
  await seed(page, "after GYM.07");
  const def = await lessonDefW5("U10.L06");
  const make = def.steps.find((s) => s.kind === "make") as { id: string; exercise: PartLike };
  const starter = (make.exercise.code?.starter ?? "").replace(/[⟪⟫]/g, "");
  const kept = await api<{ sketch: { title: string; versions: { version: number; code: string }[] } | null }>(
    page,
    "GET",
    "/lessons/U10.L05/sketch",
  );
  expect(kept.status, "lessons.sketch").toBe(200);
  const sketch = kept.body?.sketch;
  expect(sketch, "the seeded learner saved U10.L05's Make").not.toBeNull();
  const newest = [...(sketch?.versions ?? [])].sort((a, b) => b.version - a.version)[0];
  await open(page, "U10.L06", make.id, false);
  const note = page.getByTestId("make-start-note");
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note).toHaveAttribute("data-source", "sketch");
  await expect(note).toContainText(sketch?.title ?? "");
  await expect.poll(() => codeNow(page), { message: "the saved sketch in the editor" }).toBe(newest?.code);
  await page.getByTestId("make-oak-copy").click();
  await expect.poll(() => codeNow(page), { message: "Oak's copy in the editor" }).toBe(starter);
  await expect(note).toHaveAttribute("data-source", "oak");
  // The learner's sketch itself is untouched on the server.
  const again = await api<{ sketch: { versions: unknown[] } | null }>(page, "GET", "/lessons/U10.L05/sketch");
  expect(again.body?.sketch?.versions.length).toBe(sketch?.versions.length);
});

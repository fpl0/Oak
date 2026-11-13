// The Wave 5 step shapes in the real lesson player, on the dev fixture U11.L99 (a preview, nothing saved): the form
// map open over a verse–chorus song in A minor, the form strip, the 12-bar grid and the scale builder (each through
// its widget once the answers registry draws it; until then the step says the answer is not available yet and
// Skip is open, never a dead end), a do-based minor scale sung, the shuffle tapped, the harmonics on Oak's scope
// with the probe beside the sound, "match this sound" heard A against B with the filter probe, and a bass-line
// Make. Every graded step gets its pinned mistake first (walk.ts). Then the same fixture in Quiet mode: the sung
// step is its fallback, nothing is recorded, nothing waits for a voice.
import type { Page } from "@playwright/test";
import fixture, { MATCH_REFERENCE } from "../dev/wave5-fixture.ts";
import { expect, setCode, stepIs, test } from "./support.ts";
import { reseedFresh, seed, setQuiet } from "./w3support.ts";
import { expectHonestFeedback, type LessonLike, walkLesson } from "./walk.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

const DEF = fixture as unknown as LessonLike;

/** The form map (Workbench) shows the song's four sections over sixteen bars. */
async function formMapShown(page: Page) {
  const map = page.getByTestId("form-map").first();
  await expect(map, "S1 opens the form map").toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("form-sections").first()).toContainText(/Verse/i, { timeout: 30_000 });
  await expect(page.getByTestId("form-sections").first()).toContainText(/Chorus/i);
}

/** S8: A against B with the probe; the pinned mistake fails and says which way to move; then the match passes. */
async function matchSound(page: Page) {
  await stepIs(page, "S8");
  const step = page.getByTestId("lesson-step");
  await setCode(page, MATCH_REFERENCE.replace(".lpf(400)", ".lpf(1600)"));
  await page.getByTestId("check").click();
  await expectHonestFeedback(page, ["400"], "U11.L99 S8 wrong (two octaves too bright)");
  // The sound to match is heard from the start (rung 0), A against B: the ear is the point.
  await expect(step.getByTestId("ab-b").first(), "B, the sound to match, before any hint").toBeVisible();
  await expect(step.getByTestId("ab-a").first()).toBeVisible();
  // The filter probe draws the learner's cutoff beside the sound.
  await expect(step.getByTestId("probe").first()).toHaveAttribute("data-kind", "filter", { timeout: 30_000 });
  // The grader's `controls` matcher: a cutoff within half an octave of the sound to match passes.
  await setCode(page, MATCH_REFERENCE.replace(".lpf(400)", ".lpf(500)"));
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass", { timeout: 30_000 });
  const c = page.getByTestId("continue");
  await expect(c).toBeEnabled({ timeout: 30_000 });
  await c.click();
}

test("U11.L99: every Wave 5 step shape, a pinned mistake first on each graded one", async ({ page }) => {
  test.setTimeout(150_000);
  await seed(page, "after U03.L02");
  await setQuiet(page, false);
  await page.goto("/learn/U11.L99?preview=true");
  await stepIs(page, "S1");
  await formMapShown(page);
  // The three Wave 5 answers: through the widget, or calmly unavailable with Skip open.
  for (const id of ["S2", "S3", "S4"]) {
    await page.goto(`/learn/U11.L99?preview=true&step=${id}`);
    await stepIs(page, id);
    const missing = page.getByTestId("answer-unavailable");
    if ((await missing.count()) > 0) {
      await expect(missing).toContainText("isn't available yet");
      await expect(page.getByTestId("continue"), `${id}: never a dead end`).toBeEnabled();
      await expect(page.getByTestId("continue")).toHaveText(/Skip/);
      console.log(`[w5] ${id}: the answers registry has no widget yet; Skip is open`);
    }
  }
  await page.goto("/learn/U11.L99?preview=true");
  const seen = await walkLesson(page, DEF, {
    lessonId: DEF.id,
    mic: false,
    quiet: false,
    preview: true,
    until: "S7",
  });
  expect(seen).toEqual(["S1", "S2", "S3", "S4", "S5", "S6"]);
  // S7: the scope opens with the harmonics probe beside the sound.
  const step = page.getByTestId("lesson-step");
  await expect(step.getByTestId("scope-panel").first(), "S7 opens the scope").toBeVisible({
    timeout: 30_000,
  });
  await expect(step.getByTestId("probe").first()).toHaveAttribute("data-kind", "harmonics");
  await walkLesson(page, DEF, {
    lessonId: DEF.id,
    mic: false,
    quiet: false,
    preview: true,
    from: "S7",
    until: "S8",
  });
  await matchSound(page);
  await walkLesson(page, DEF, { lessonId: DEF.id, mic: false, quiet: false, preview: true, from: "S9" });
});

test("U11.L99 in Quiet mode: the sung step is its fallback and the rest plays on", async ({ page }) => {
  test.setTimeout(90_000);
  await seed(page, "after U03.L02");
  await setQuiet(page, true);
  await page.goto("/learn/U11.L99?preview=true&step=S5");
  await stepIs(page, "S5");
  await expect(page.getByRole("button", { name: "Sing", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("quiet-chip")).toBeVisible();
  await expect(page.getByTestId("continue"), "singing never gates").toBeEnabled();
  // The fallback: name the degrees heard (do-based minor: ♭3 is me), never a failure.
  const identify = page.getByTestId("sing-quiet-identify");
  if ((await identify.count()) > 0) {
    for (const d of ["1", "2", "b3", "1"]) await identify.locator(`[data-degree="${d}"]`).click();
    await page.getByTestId("quiet-check").click();
    await expect(page.getByTestId("quiet-verdict")).toContainText("That's the pattern");
  } else {
    await page.getByTestId("heard-it").click();
  }
  await page.getByTestId("continue").click();
  await stepIs(page, "S6");
});

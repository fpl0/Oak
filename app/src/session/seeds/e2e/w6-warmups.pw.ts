// Wave 6 sets inside real session days (contracts §7.3–§7.4, §9.1), each from a wave6.md §6 seed on the real planner
// (nothing filled or patched): a U12 day whose warm-up opens the seventh-chord qualities; a U13 day whose warm-up
// opens the push (marked on the rhythm grid); the day after U15.L06, whose warm-up opens the secondary dominants;
// and the day after U15.L01, whose warm-up opens the chromatic degrees, the lean sung on Chromium's fake microphone,
// then the same day in Quiet mode (the mic never opens, the lean is heard and imagined). Each set is the family's
// first (its blocked intro: the listening first, then the trials), answered through the real widget, read back from
// the wire with the warm-up item it belongs to; then the session goes on. What each trial teaches (the fact lines,
// the near misses, the second question for the ear, every draw on purpose) is the drills suite's
// (app/src/drills/e2e/wave6.pw.ts, free practice); here the subject is the set inside the day.
import type { Trial } from "@oak/api";
import { expect, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { api, blockHmr, seed } from "./support.ts";
import { watch } from "./w5-helpers.ts";
import {
  countMic,
  finishSet,
  frameMatrix,
  nextTrial,
  startDay,
  toFamily,
  totalOf,
  trialNo,
  warmState,
  wire,
} from "./warmup-helpers.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await blockHmr(page);
});

type Spec =
  | { ui: "choice"; options: { id: string; label: string }[] }
  | { ui: "degree-pad" | "quality-pad"; set: string[] }
  | { ui: "grid"; stepsPerBar: number };
const hook = <T>(page: Page, name: string): Promise<T> =>
  page.evaluate((n) => (globalThis as Record<string, unknown>)[n], name) as Promise<T>;
const answerArea = (page: Page) => page.getByRole("region", { name: "Your answer" });

/** Answers the trial in view through its widget: a quality by its digit, a degree or a choice by its key. */
async function answer(page: Page, id: string): Promise<void> {
  const spec = await hook<Spec>(page, "__oakDrillSpec");
  if (spec.ui === "quality-pad") {
    const i = spec.set.indexOf(id);
    expect(i, `${id} on the pad ${spec.set.join(" ")}`).toBeGreaterThanOrEqual(0);
    await page.keyboard.press(String(i + 1));
  } else if (spec.ui === "degree-pad") {
    const i = spec.set.indexOf(id);
    expect(i, `${id} on the pad ${spec.set.join(" ")}`).toBeGreaterThanOrEqual(0);
    await answerArea(page).getByRole("radio").nth(i).click();
  } else if (spec.ui === "choice") {
    const at = spec.options.findIndex((o) => o.id === id);
    expect(at, `${id} among ${spec.options.map((o) => o.id).join(" ")}`).toBeGreaterThanOrEqual(0);
    // By its own radio: on a bar timeline a digit is the bar's number, not the option's place (review:journey).
    await answerArea(page).getByRole("radio").nth(at).click();
  }
  const check = page.getByTestId("check-answer");
  if (await check.isVisible()) await check.click();
}

test("a U12 day: the seventh-chord qualities open in the warm-up, answered by digit, then the lesson", async ({
  page,
  request,
}) => {
  const problems = watch(page);
  const sent = wire(page);
  const s = await seed(request, "after U12.L02");
  expect(s.next).toBe("U12.L03");
  await useUiPrefs(page, { theme: "paper" });
  await startDay(page, "U12.L03");
  const item = await toFamily(page, "fam.chd.quality-7th", {
    hear: true,
    shot: "w6-warmup-intro-quality-7th",
  });
  const before = (await warmState(page)).warmupIndex;
  const total = await totalOf(page);
  expect(total).toBe(item.trials);
  const feedback = page.getByTestId("trial-feedback");
  for (let i = 0; i < total; i++) {
    const t = await trialNo(page, i + 1, total);
    const want = t.expected.qualities?.[0] as string;
    // U12.L02's level: the dominant seventh against the major seventh (the minor seventh opens with U12.L03).
    expect(["7", "maj7"]).toContain(want);
    if (i === 0) {
      await expect(page.getByRole("group", { name: "Your answer: which chord quality?" })).toBeVisible();
      const spec = await hook<Spec>(page, "__oakDrillSpec");
      expect(spec.ui === "quality-pad" && [...spec.set].sort()).toEqual(["7", "maj7"]);
    }
    const wrong = i === 1;
    await answer(page, wrong ? (want === "7" ? "maj7" : "7") : want);
    await expect(feedback).toHaveAttribute("data-correct", wrong ? "false" : "true");
    if (i === 0) {
      // The pair that makes the quality, and the 3rd and 7th alone (the fact itself is the drills suite's).
      await expect(page.getByTestId("trial-fact")).toHaveText(/that pair makes it an? .*seventh\.$/);
      await expect(page.getByTestId("hear-alone")).toHaveText(/The 3rd and 7th alone/);
      await frameMatrix(page, "w6-warmup-quality-7th");
    }
    await nextTrial(page);
  }
  await finishSet(page, before, "w6-warmup-quality-7th-summary");
  expect(sent.starts.find((b) => b.warmupItemId === item.id)).toMatchObject({
    sessionId: (await warmState(page)).session?.id,
  });
  expect(sent.trials.size).toBe(total);
  expect(sent.trials.get(1)?.correct).toBe(false);
  for (const r of sent.trials.values()) expect(r.familyId).toBe("fam.chd.quality-7th");
  expect(problems).toEqual([]);
});

test("a U13 day: the push opens in the warm-up, each pushed kick marked on one bar of the grid", async ({
  page,
  request,
}) => {
  const problems = watch(page);
  const sent = wire(page);
  const s = await seed(request, "after U13.L01");
  expect(s.next).toBe("U13.L02");
  await useUiPrefs(page, { theme: "paper" });
  await startDay(page, "U13.L02");
  const item = await toFamily(page, "fam.rhy.syncopation", { shot: "w6-warmup-intro-syncopation" });
  const before = (await warmState(page)).warmupIndex;
  const total = await totalOf(page);
  expect(total).toBe(item.trials);
  const feedback = page.getByTestId("trial-feedback");
  for (let i = 0; i < total; i++) {
    const t: Trial = await trialNo(page, i + 1, total);
    expect(t.family).toBe("fam.rhy.syncopation");
    const cells = await hook<string[] | null>(page, "__oakDrillCells");
    if (cells) {
      // Find the push: one bar of sixteen cells, the learner clicks the kick that lands off the beat.
      if (i === 0)
        await expect(page.getByTestId("trial-prompt")).toHaveText("Mark the kick that lands off the beat.");
      const grid = answerArea(page).getByRole("table");
      await expect(grid.getByRole("button")).toHaveCount(16);
      for (const c of cells) await grid.getByRole("button").nth(Number(c)).click();
      await page.getByTestId("check-answer").click();
    } else await answer(page, t.expected.choice?.[0] as string);
    await expect(feedback).toHaveAttribute("data-correct", "true");
    // The answer in counts, never the grid's own cell id.
    if (cells)
      await expect(feedback).toContainText(/^That's it: (bar \d+, )?(the [e&a] of [1-4]|beat [1-4])/);
    if (i === 0) {
      await expect(page.getByTestId("hear-alone")).toHaveText(/Kick alone/);
      await frameMatrix(page, "w6-warmup-syncopation");
    }
    await nextTrial(page);
  }
  await finishSet(page, before, "w6-warmup-syncopation-summary");
  expect(sent.trials.size).toBe(total);
  for (const r of sent.trials.values())
    expect(r).toMatchObject({ familyId: "fam.rhy.syncopation", correct: true });
  expect(problems).toEqual([]);
});

test("the day after U15.L06: the secondary dominants open in the warm-up; V7/V named where it leans", async ({
  page,
  request,
}) => {
  const problems = watch(page);
  const sent = wire(page);
  const s = await seed(request, "after U15.L06");
  expect(s.next).toBe("U16.L01");
  await useUiPrefs(page, { theme: "bark" });
  await startDay(page, "U16.L01");
  const item = await toFamily(page, "fam.har.chromatic", { shot: "w6-warmup-intro-chromatic-chord" });
  const before = (await warmState(page)).warmupIndex;
  const total = await totalOf(page);
  expect(total).toBe(item.trials);
  const feedback = page.getByTestId("trial-feedback");
  for (let i = 0; i < total; i++) {
    const t = await trialNo(page, i + 1, total);
    // U15.L06's level: V/V only (the borrowed chords open with U16.L05).
    expect(t.category).toBe("V/V");
    await answer(page, t.expected.choice?.[0] as string);
    await expect(feedback).toHaveAttribute("data-correct", "true");
    // Named as the course names it from U15.L02 on: V7/V, the dominant of V, and where it leans.
    await expect(page.getByTestId("trial-fact")).toContainText("V7/V");
    await expect(page.getByTestId("trial-fact")).toContainText("it leans to V");
    if (i === 0) {
      await expect(page.getByTestId("hear-alone")).toHaveText(/The chord, then where it goes/);
      await frameMatrix(page, "w6-warmup-secondary");
    }
    await nextTrial(page);
  }
  await finishSet(page, before, "w6-warmup-secondary-summary");
  expect(sent.trials.size).toBe(total);
  for (const r of sent.trials.values())
    expect(r).toMatchObject({ familyId: "fam.har.chromatic", correct: true });
  expect(problems).toEqual([]);
});

/** Plays the chromatic-degree set; returns how many trials sang (or heard) the lean. */
async function chromaticSet(page: Page, quiet: boolean): Promise<{ leaned: number; total: number }> {
  const total = await totalOf(page);
  let leaned = 0;
  const feedback = page.getByTestId("trial-feedback");
  for (let i = 0; i < total; i++) {
    const t = await trialNo(page, i + 1, total);
    const want = (t.expected.degrees ?? [])[0] as string;
    if (i === 0)
      await expect(page.getByTestId("trial-prompt")).toHaveText(
        "After the cadence: which degree was the last note? Some come from outside the key.",
      );
    await answer(page, want);
    await expect(feedback).toHaveAttribute("data-correct", "true");
    const next = page.getByTestId("next-trial");
    const label = (await next.textContent()) ?? "";
    // A chromatic degree leans to its neighbour in the key (two notes); a note of the key walks home as before.
    if (/[#b]/.test(want))
      await expect(next).toHaveText(quiet ? /Hear it lean|Next|Finish/ : /Sing the lean|Next|Finish/);
    if (!quiet && /Sing (the lean|it home)/.test(label)) {
      leaned++;
      // Real time on purpose: the sung notes through the fake microphone.
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("pitch-lane")).toBeVisible({ timeout: 20_000 });
      await expect(feedback).toContainText(/Sung|Singing skipped/, { timeout: 30_000 });
      if (leaned === 1) await frameMatrix(page, "w6-warmup-chromatic-sung");
    } else if (quiet && /Hear it (lean|home)/.test(label)) {
      leaned++;
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("quiet-resolution")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("pitch-lane")).toHaveCount(0);
      await page.keyboard.press("Space");
      await expect(feedback).toContainText(/Heard (the lean|home), in your head\./);
    }
    await nextTrial(page);
  }
  return { leaned, total };
}

for (const quiet of [false, true])
  test(`the day after U15.L01: the chromatic degrees open in the warm-up, ${
    quiet ? "in Quiet mode: the lean heard and imagined, the mic never opens" : "the lean sung on the mic"
  }`, async ({ page, request }) => {
    const problems = watch(page);
    const sent = wire(page);
    const micAsked = await countMic(page);
    const s = await seed(request, "U14.CP due");
    expect(s.done).toContain("U15.L01");
    if (quiet) await api(request, "PUT", "/api/voice/quiet", { quiet: true, scope: "today" });
    await useUiPrefs(page, { theme: quiet ? "bark" : "paper" });
    await startDay(page, "U14.CP");
    const item = await toFamily(page, "fam.deg.fet-chromatic", {
      ...(quiet ? {} : { shot: "w6-warmup-intro-fet-chromatic" }),
    });
    const before = (await warmState(page)).warmupIndex;
    const { leaned, total } = await chromaticSet(page, quiet);
    expect(total).toBe(item.trials);
    expect(leaned).toBeGreaterThan(0);
    await finishSet(page, before, `w6-warmup-fet-chromatic-${quiet ? "quiet" : "sung"}-summary`);
    expect(sent.trials.size).toBe(total);
    const leans = [...sent.trials.values()].filter((r) => r.sungResolution);
    expect(leans).toHaveLength(leaned);
    for (const r of leans) {
      // A chromatic degree's way is its lean: two notes, the degree and its neighbour in the key.
      if (/[#b]/.test(String(r.sungResolution?.path[0] ?? "")))
        expect(r.sungResolution?.path).toHaveLength(2);
      expect(r.sungResolution?.quiet).toBe(quiet);
      if (quiet) expect(r.sungResolution).toMatchObject({ notes: [], credit: 0 });
    }
    for (const r of sent.trials.values()) expect(r.familyId).toBe("fam.deg.fet-chromatic");
    if (quiet) {
      expect(micAsked()).toBe(0);
      await expect(page.locator("main")).not.toContainText(/failed|missed the sing/i);
    } else expect(micAsked()).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

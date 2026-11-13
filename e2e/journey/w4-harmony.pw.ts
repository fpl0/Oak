// Wave 4 journeys (b) and (c), U06 Diatonic Harmony on the real stack, each from a dev seed:
//   1. "after U06.L05": today is U06.L06 (The Four-Chord Schema). The warm-up holds the bass-degree set (stage D):
//      the first trial's roots are sung on Chrome's fake microphone, then every trial is picked on the degree pad;
//      the other warm-up sets are skipped, as a learner may. The lesson is walked, the Coda follows, and in Studio
//      the Make's sketch shows its chord band: the Roman-numeral lens is switched off and on again from the
//      keyboard (Shift+R), and the numerals of I V vi IV come and go with it.
//   2. "U06.CP due": a checkpoint day. After the warm-up the U06 checkpoint is taken item by item through the
//      player's own grading path and handed in; it passes, the Coda follows, and the unit is passed on the server.
import { expect, type Page, test } from "@playwright/test";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
import u06l06 from "../../content/core/U06/L06/lesson.ts";
import { useUiPrefs as setUiPrefs } from "../support/ui.ts";
import { walkCheckpoint } from "./checkpoint-walk.ts";
import { coda, startToday } from "./day.ts";
import { walkLesson } from "./lesson-walk.ts";
import { api, expectClean, noHmr, openToday, resetClock, seed, shootAll, watch } from "./support.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") }, permissions: ["microphone"] });
test.describe.configure({ mode: "serial" });

interface WarmItem {
  id: string;
  kind: string;
  familyId: string | null;
}
type SessionHandle = {
  report(r: unknown): void;
  state(): {
    plan: { kind: string; mapItemId: string | null; warmup: { items: WarmItem[] } } | null;
    warmupIndex: number;
  };
};
const sessionState = (page: Page) =>
  page.evaluate(() => (window as never as { __oakSession: SessionHandle }).__oakSession.state());

/** Reports warm-up items skipped, as the learner's "skip" would. */
async function skipItems(page: Page, items: readonly WarmItem[]): Promise<void> {
  if (items.length === 0) return;
  await page.evaluate((skip) => {
    const o = (window as never as { __oakSession: SessionHandle }).__oakSession;
    for (const item of skip)
      o.report({
        block: "warmup",
        source: "drills",
        warmupItemId: item.id,
        drillSessionId: null,
        meanCredit: null,
        skipped: true,
      });
  }, items);
}

interface Trial {
  seed?: number;
  expected: { degrees?: string[] };
}
const currentTrial = (page: Page) =>
  page.evaluate(() => (globalThis as { __oakDrillTrial?: unknown }).__oakDrillTrial) as Promise<Trial>;

async function trialNo(page: Page, n: number, of: number): Promise<Trial> {
  await expect(page.getByTestId("trial-counter")).toHaveText(`Trial ${n} of ${of}`, { timeout: 30_000 });
  await expect.poll(async () => (await currentTrial(page))?.seed !== undefined).toBe(true);
  return currentTrial(page);
}

test("a U06 day: the bass-degree set sung and picked, the Four-Chord Schema, the numeral lens switched on", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await resetClock(request);
  await seed(request, "after U06.L05");
  await noHmr(page);
  await setUiPrefs(page, { theme: "paper" });
  const w = watch(page);
  // Every drill trial the runner posts, as the server receives it (by set and index: a batch may be resent).
  type Posted = { idx: number; familyId: string; correct: boolean; response: { sung?: unknown[] | null } };
  const sent = new Map<string, Posted>();
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/drills\/sessions\/[^/]+\/trials$/.test(r.url()))
      for (const t of (r.postDataJSON() as { trials: Posted[] }).trials ?? [])
        sent.set(`${r.url()}#${t.idx}`, t);
  });
  const posted = () => [...sent.values()];

  await openToday(page);
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", /.+/, { timeout: 30_000 });
  await page.getByTestId("start-session").click();
  await expect(page).toHaveURL(/\/session\/?$/);
  await expect(page.getByTestId("warmup")).toBeVisible({ timeout: 60_000 });
  const st = await sessionState(page);
  expect(st.plan).toMatchObject({ kind: "lesson", mapItemId: "U06.L06" });
  const items = st.plan?.warmup.items ?? [];
  const at = items.findIndex((i) => i.familyId === "fam.har.bass");
  expect(
    at,
    `the bass-degree set in today's warm-up: ${items.map((i) => i.familyId)}`,
  ).toBeGreaterThanOrEqual(0);
  await skipItems(page, items.slice(0, at));

  // The bass-degree set: a blocked intro is heard first, then each trial.
  if (items[at]?.kind === "blocked-intro") {
    await expect(page.getByTestId("listen-block")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Start the set/ })).toBeFocused({ timeout: 60_000 });
    await page.keyboard.press("Enter");
  }
  await expect(page.getByTestId("trial-counter")).toHaveText(/Trial 1 of \d+/, { timeout: 60_000 });
  const total = Number((await page.getByTestId("trial-counter").textContent())?.match(/of (\d+)/)?.[1]);
  await expect(page.getByTestId("trial-prompt")).toHaveText(
    "Hear the bass first: which degree is each root?",
  );
  const pad = page.getByRole("group", { name: "Your answer: the degrees, in order" });
  for (let i = 0; i < total; i++) {
    const t = await trialNo(page, i + 1, total);
    await expect(page.getByTestId("stage-text")).toHaveText(/Your turn/, { timeout: 40_000 });
    if (i === 0) {
      // The roots sung first (V), on the fake microphone; singing helps and never gates.
      await expect(page.getByTestId("sing-part")).toBeVisible();
      await page.keyboard.press("v");
      await expect(page.getByTestId("pitch-lane")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("sung-part-line")).toBeVisible({ timeout: 40_000 });
      await shootAll(page, "w4-journey-bass-sung");
    }
    await pad.locator("button").first().focus();
    for (let k = 0; k < 4; k++) await page.keyboard.press("Backspace");
    for (const d of t.expected.degrees ?? []) await page.keyboard.press(d.replace(/^[b#]/, ""));
    await expect(page.getByTestId("trial-feedback")).toHaveAttribute("data-correct", "true");
    await page.getByTestId("next-trial").focus();
    await page.keyboard.press("Enter");
  }
  const summary = page.getByTestId("set-summary");
  await expect(summary).toBeVisible({ timeout: 30_000 });
  const before = (await sessionState(page)).warmupIndex;
  await summary.getByRole("button", { name: /Next set|On to the lesson|Continue/ }).click();
  await expect.poll(async () => (await sessionState(page)).warmupIndex).toBeGreaterThan(before);
  const left = (await sessionState(page)).plan?.warmup.items.slice(at + 1) ?? [];
  await skipItems(page, left);
  // The set reached the server: every trial, the first with one sung note per root.
  await expect.poll(() => posted().filter((t) => t.familyId === "fam.har.bass").length).toBe(total);
  const bass = posted()
    .filter((t) => t.familyId === "fam.har.bass")
    .sort((a, b) => a.idx - b.idx);
  expect(bass.every((t) => t.correct)).toBe(true);
  expect((bass[0]?.response.sung ?? []).length).toBeGreaterThan(0);

  // The lesson, then the Coda (no tool arrives with U06.L06).
  await walkLesson(page, u06l06, { makeTitle: "U06.L06 four chords" });
  await coda(page, { unlocks: "auto" });

  // In Studio, the Make's sketch: the chord band names the loop; the numeral lens goes off and on with Shift+R.
  await page.goto("/studio");
  await page.getByTestId("sketch-card").filter({ hasText: "U06.L06 four chords" }).first().click();
  await expect(page).toHaveURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-testid="workbench"][data-analysis=ready]')).toBeVisible({
    timeout: 60_000,
  });
  const band = page.getByTestId("chord-band");
  await expect(band).toBeVisible({ timeout: 30_000 });
  const lens = page.getByTestId("lens-romanNumerals");
  await expect(lens).toBeVisible();
  if ((await lens.getAttribute("aria-pressed")) === "true") {
    await lens.click();
    await expect(lens).toHaveAttribute("aria-pressed", "false");
  }
  await expect(band.locator(".oak-chord-rn")).toHaveCount(0);
  // The Workbench's own key (ux §7.10), pressed with focus in the Workbench (on its lens bar).
  await lens.focus();
  await page.keyboard.press("Shift+R");
  await expect(lens).toHaveAttribute("aria-pressed", "true");
  await expect(band.locator(".oak-chord-rn").first()).toBeVisible();
  const numerals = await band.locator(".oak-chord-rn").allTextContents();
  for (const rn of ["I", "V", "vi", "IV"]) expect(numerals).toContain(rn);
  await shootAll(page, "w4-journey-studio-numerals");
  expectClean(w);
});

test("the U06 checkpoint as a daily session, to a pass", async ({ page, request }) => {
  test.setTimeout(240_000);
  await resetClock(request);
  await seed(request, "U06.CP due");
  await noHmr(page);
  await setUiPrefs(page, { theme: "bark" });
  const w = watch(page);
  // The warm-up is left for another day (the stage D sets have their own journey above and the drill suites).
  const plan = await startToday(page, request, { warmupSets: 0 });
  expect(plan).toMatchObject({ kind: "checkpoint", mapItemId: "U06.CP" });
  const { passed } = await walkCheckpoint(page);
  expect(passed).toBe(true);
  await shootAll(page, "w4-journey-u06cp-result");
  await page.getByTestId("checkpoint-result").getByRole("button").first().click();
  await coda(page, { unlocks: "auto" });
  const progress = await api<{ checkpoints: { cpId: string; status: string }[] }>(
    request,
    "GET",
    "/api/lessons/progress",
  );
  expect(progress.checkpoints.find((c) => c.cpId === "U06.CP")?.status).toBe("passed");
  expectClean(w);
});

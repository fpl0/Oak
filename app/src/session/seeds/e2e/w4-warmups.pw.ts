// Wave 4 stage D sets inside real session days (contracts §7.3–§7.4, §9.1), each from a dev seed on the real
// planner: a U05 day whose warm-up holds the chord-quality set; a U06 day whose warm-up holds the bass-degree set,
// its roots sung on Chromium's fake microphone, and the same day in Quiet mode (the mic never opens); a U06 day with
// the staged chord dictation (bass → quality → numerals). Each set is run in the session's warm-up with the keyboard,
// its trials read back from the wire with the warm-up item they belong to, and the session moves on after it.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { DrillTrialRecord, Trial } from "@oak/api";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { REPO_ROOT, SCREENSHOT_MATRIX } from "../../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { fakeMic } from "../../../onboarding/e2e/helpers.ts";
import { api, blockHmr, expectNoOverflow, matrix, SHOTS, seed, settle } from "./support.ts";

// A voice sings in this file: Chromium's fake microphone plays the onboarding suite's voice.wav (quiet, five short
// notes, then C4 held for 9 s; it starts again each time the microphone opens), as it does in the journeys. The
// area's default fake device only beeps, and no steady note reaches the mic from it: the sung part of the
// bass-degree set would then show its fallback line and an empty pad, not the roots that were sung. Only that test
// opens the microphone.
test.use({ launchOptions: { args: fakeMic("voice.wav") } });
test.describe.configure({ mode: "serial" });
test.beforeAll(() => {
  // `bun run e2e` writes every fake-microphone fixture before any suite starts; a run of this file alone may be
  // the first to need this one.
  const wav = fakeMic("voice.wav")
    .find((a) => a.startsWith("--use-file-for-fake-audio-capture="))
    ?.split("=")[1];
  if (wav && !existsSync(wav))
    execFileSync("bun", ["app/src/onboarding/e2e/make-fixtures.bun.ts"], { cwd: REPO_ROOT });
});
test.beforeEach(async ({ page }) => {
  await blockHmr(page);
});

interface WarmItem {
  id: string;
  kind: string;
  familyId: string | null;
  level: number | null;
  trials: number;
}
type OakSessionHandle = {
  report(r: unknown): void;
  state(): {
    plan: { kind: string; mapItemId: string | null; warmup: { items: WarmItem[] } } | null;
    session: { id: string } | null;
    block: string | null;
    warmupIndex: number;
  };
};
const sessionState = (page: Page) =>
  page.evaluate(() => (window as never as { __oakSession: OakSessionHandle }).__oakSession.state());

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

/** The drill sets the runner opens (`drills.start`) and every trial record it posts. */
function wire(page: Page): { starts: Record<string, unknown>[]; trials: Map<number, DrillTrialRecord> } {
  const starts: Record<string, unknown>[] = [];
  const trials = new Map<number, DrillTrialRecord>();
  page.on("request", (r) => {
    if (r.method() !== "POST") return;
    if (/\/api\/drills\/sessions$/.test(r.url())) starts.push(r.postDataJSON() as Record<string, unknown>);
    if (/\/api\/drills\/sessions\/[^/]+\/trials$/.test(r.url()))
      for (const t of (r.postDataJSON() as { trials: DrillTrialRecord[] }).trials) trials.set(t.idx, t);
  });
  return { starts, trials };
}

/** Counts microphone requests (getUserMedia) from the page. */
async function countMic(page: Page): Promise<() => number> {
  let asked = 0;
  await page.exposeFunction("__w4wMicAsked", () => {
    asked++;
  });
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => {
      (window as unknown as { __w4wMicAsked(): void }).__w4wMicAsked();
      return orig(c);
    };
  });
  return () => asked;
}

/** Today → Start (keyboard) → the session's warm-up. */
async function startDay(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", /.+/, { timeout: 30_000 });
  await expect(page.getByTestId("setlist").locator('[data-row="warmup"]')).toBeVisible();
  await page.locator("main").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/session\/?$/);
  // The first open of the session route compiles it in the dev server; a module fetch that loses a race with a
  // dependency re-optimisation shows the route's error boundary: load it again (the session itself is kept).
  const block = page.getByTestId("session-block");
  const failed = page.getByRole("heading", { name: "Something went wrong" });
  await expect(block.or(failed)).toBeVisible({ timeout: 60_000 });
  if (await failed.isVisible()) await page.reload();
  await expect(block).toContainText("Warm-up", { timeout: 60_000 });
}

/**
 * Moves the warm-up to the first item of `familyId` (the ones before it are reported skipped, as the learner's
 * "skip" would) and returns it; a blocked intro's listening comes first and is ended with Enter. With `hear`, the
 * listening is heard through: focus moves to "Start the set" only once every example has played (asserted once in
 * this file, by the first test). Otherwise the learner starts the set while it plays (the button is there from the
 * start, and listening never gates).
 */
async function toFamily(page: Page, familyId: string, opts: { hear?: boolean } = {}): Promise<WarmItem> {
  const st = await sessionState(page);
  const items = st.plan?.warmup.items ?? [];
  const at = items.findIndex((i) => i.familyId === familyId);
  expect(
    at,
    `${familyId} in today's warm-up: ${items.map((i) => i.familyId).join(", ")}`,
  ).toBeGreaterThanOrEqual(0);
  await page.evaluate(
    (skip) => {
      const o = (window as never as { __oakSession: OakSessionHandle }).__oakSession;
      for (const item of skip)
        o.report({
          block: "warmup",
          source: "drills",
          warmupItemId: item.id,
          drillSessionId: null,
          meanCredit: null,
          skipped: true,
        });
    },
    items.slice(0, at),
  );
  const item = items[at] as WarmItem;
  if (item.kind === "blocked-intro") {
    await expect(page.getByTestId("listen-block")).toBeVisible({ timeout: 30_000 });
    await startTheSet(page, opts.hear === true);
  }
  await expect(page.getByTestId("trial-counter")).toHaveText(/Trial 1 of \d+/, { timeout: 60_000 });
  return item;
}

/** Ends a blocked intro's listening with Enter on "Start the set": heard through first, or at once. */
async function startTheSet(page: Page, hear: boolean): Promise<void> {
  const start = page.getByRole("button", { name: /Start the set/ });
  if (hear) await expect(start).toBeFocused({ timeout: 60_000 });
  else {
    await expect(start).toBeEnabled();
    await start.focus();
  }
  await page.keyboard.press("Enter");
}

async function currentTrial(page: Page): Promise<Trial> {
  return (await page.evaluate(() => (globalThis as { __oakDrillTrial?: unknown }).__oakDrillTrial)) as Trial;
}
async function trialNo(page: Page, n: number, of: number): Promise<Trial> {
  await expect(page.getByTestId("trial-counter")).toHaveText(`Trial ${n} of ${of}`, { timeout: 30_000 });
  await expect.poll(async () => (await currentTrial(page))?.seed !== undefined).toBe(true);
  return currentTrial(page);
}
async function totalOf(page: Page): Promise<number> {
  return Number((await page.getByTestId("trial-counter").textContent())?.match(/of (\d+)/)?.[1]);
}
async function nextTrial(page: Page): Promise<void> {
  await page.getByTestId("next-trial").focus();
  await page.keyboard.press("Enter");
}

/** The set's summary, then on with the session (the next set or the New block). */
async function finishSet(page: Page, warmupIndexBefore: number): Promise<void> {
  const summary = page.getByTestId("set-summary");
  await expect(summary).toBeVisible({ timeout: 30_000 });
  await summary.getByRole("button", { name: /Next set|On to the lesson|Continue/ }).click();
  await expect.poll(async () => (await sessionState(page)).warmupIndex).toBeGreaterThan(warmupIndexBefore);
}

const QUALITY_KEYS: Record<string, string> = { maj: "1", min: "2", dim: "3", aug: "4" };

/**
 * A bass-degree set is four trials: the family's own set size (`fam.har.bass`, `n: 4` in
 * packages/drills/src/catalog/families.ts). A warm-up item of one family is planned with it
 * (server/src/services/srs.ts `toWarmupItem`: the family's `trialsPerSet`, and an anchor set is four as well), and
 * the set the session opens for the item holds as many (server/src/srs-wiring.ts `#startDrill`).
 */
const BASS_TRIALS = 4;

test("a U05 day: the chord-quality set in the warm-up, answered by key, then the day goes on", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const problems = watch(page);
  const sent = wire(page);
  const s = await seed(request, "after U05.L02");
  expect(s.next).toBe("U05.L03");
  await useUiPrefs(page, { theme: "paper" });
  await startDay(page);
  expect((await sessionState(page)).plan).toMatchObject({ kind: "lesson", mapItemId: "U05.L03" });
  const item = await toFamily(page, "fam.chd.quality-triad", { hear: true });
  const before = (await sessionState(page)).warmupIndex;
  await expect(page.getByTestId("trial-prompt")).toHaveText("After the key, one chord: what quality is it?");
  const total = await totalOf(page);
  expect(total).toBe(item.trials);
  for (let i = 0; i < total; i++) {
    const t = await trialNo(page, i + 1, total);
    const want = t.expected.qualities?.[0] as string;
    // Level 1: major and minor only (contracts §7.3), the bass in its register.
    expect(["maj", "min"]).toContain(want);
    const wrong = i === 2;
    await expect(page.getByRole("group", { name: "Your answer: which chord quality?" })).toBeVisible();
    await page.keyboard.press(QUALITY_KEYS[wrong ? (want === "maj" ? "min" : "maj") : want] as string);
    await expect(page.getByTestId("trial-feedback")).toHaveAttribute(
      "data-correct",
      wrong ? "false" : "true",
    );
    if (i === 0) {
      await settle(page);
      await expectNoOverflow(page);
      await shoot(page, SHOTS, "w4-warmup-quality", "paper");
    }
    await nextTrial(page);
  }
  await expect(page.getByTestId("set-summary")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "bark"));
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, "w4-warmup-quality-summary", "bark");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "paper"));
  await finishSet(page, before);
  // The set counted for this session and this warm-up item; every trial reached the server.
  const start = sent.starts.find((b) => b.warmupItemId === item.id);
  expect(start).toMatchObject({ sessionId: (await sessionState(page)).session?.id });
  expect(sent.trials.size).toBe(total);
  expect(sent.trials.get(2)?.correct).toBe(false);
  for (const r of sent.trials.values()) expect(r.familyId).toBe("fam.chd.quality-triad");
  expect(problems).toEqual([]);
});

/**
 * Both themes at both sizes on the trial in view, reached once (the size and the theme are switched in place: a
 * reload would start the trial again and drop what was just sung or answered): `inView` on screen, no horizontal
 * overflow of the document (none at all) or of <main>; back to Paper 1440×900.
 */
async function frameMatrix(page: Page, name: string, inView: Locator): Promise<void> {
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((theme) => document.documentElement.setAttribute("data-theme", theme), m.theme);
    await expect(inView).toBeInViewport();
    await settle(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expectNoOverflow(page);
    await shoot(page, SHOTS, name, m.theme);
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "paper"));
  await page.setViewportSize({ width: 1440, height: 900 });
}

// The bass-degree set's sung roots are walked once in the whole suite, here, inside a real session's warm-up: this
// test and its Quiet twin also hold what the drills suite's practice-page copies asserted (moved from
// app/src/drills/e2e/wave4.pw.ts: the Mic-live indicator, the answer in context by bar, a wrong last pick, a trial
// with nothing sung, the frame in both themes and sizes, the indicator off in Quiet mode).
test("a U06 day: the bass-degree set, its roots sung on the mic before they are picked", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const problems = watch(page);
  const sent = wire(page);
  const micAsked = await countMic(page);
  const s = await seed(request, "after U06.L05");
  expect(s.next).toBe("U06.L06");
  await useUiPrefs(page, { theme: "paper" });
  await startDay(page);
  const item = await toFamily(page, "fam.har.bass");
  const before = (await sessionState(page)).warmupIndex;
  // Four trials, by the plan and on the screen (the practice-page copies asserted "Trial n of 4").
  expect(item.trials).toBe(BASS_TRIALS);
  const total = await totalOf(page);
  expect(total).toBe(BASS_TRIALS);
  const t0 = await trialNo(page, 1, total);
  await expect(page.getByTestId("trial-prompt")).toHaveText(
    "Hear the bass first: which degree is each root?",
  );
  await expect(page.getByTestId("stage-text")).toHaveText("Your turn.", { timeout: 40_000 });
  await expect(page.getByTestId("sing-part")).toBeVisible();
  await page.keyboard.press("v");
  await expect(page.getByTestId("pitch-lane")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Microphone is live. Close it" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("stage-text")).toHaveText("Your turn: sing now.", { timeout: 20_000 });
  await shoot(page, SHOTS, "w4-bass-singing", "paper");
  await expect(page.getByTestId("sung-part-line")).toBeVisible({ timeout: 40_000 });
  expect(micAsked()).toBeGreaterThan(0);
  // The voice was heard: the line names the roots as sung (the held C4 gives the last bars a steady note), and
  // they are on the pad. This screen, before any pick, in both themes at both sizes (the journey's U06 day took
  // these four, e2e/journey/w4-harmony.pw.ts "w4-journey-bass-sung").
  await expect(page.getByTestId("sung-part-line")).toHaveText(/^You sang .+\. Check them on the pad/);
  await frameMatrix(page, "w4-warmup-bass-sung", page.getByTestId("sung-part-line"));
  // The pick is the learner's: clear what was prefilled and enter the roots.
  const pad = page.getByRole("group", { name: "Your answer: the degrees, in order" });
  await expect(pad).toBeVisible();
  await pad.locator("button").first().focus();
  for (let k = 0; k < 4; k++) await page.keyboard.press("Backspace");
  for (const d of t0.expected.degrees ?? []) await page.keyboard.press(d.replace(/^[b#]/, ""));
  await expect(page.getByTestId("trial-feedback")).toHaveAttribute("data-correct", "true");
  await expect(page.getByTestId("answer-in-context")).toContainText("Bar 1");
  await nextTrial(page);
  // The last pick is wrong on purpose (its first root off by one); the others are right, nothing sung.
  for (let i = 1; i < total; i++) {
    const t = await trialNo(page, i + 1, total);
    await expect(pad).toBeVisible();
    const last = i === total - 1;
    for (const [k, d] of (t.expected.degrees ?? []).entries())
      await page.keyboard.press(last && k === 0 ? (d === "1" ? "2" : "1") : d.replace(/^[b#]/, ""));
    await expect(page.getByTestId("trial-feedback")).toHaveAttribute("data-correct", last ? "false" : "true");
    await nextTrial(page);
  }
  await finishSet(page, before);
  // One sung note per root on the first trial (never audio); the picks are what is graded.
  expect(sent.trials.get(0)?.response.sung).toHaveLength(t0.expected.degrees?.length ?? 0);
  expect(sent.trials.get(0)?.correct).toBe(true);
  expect(sent.trials.get(1)?.response.sung).toBeNull();
  expect(sent.trials.get(total - 1)?.correct).toBe(false);
  expect(sent.trials.size).toBe(total);
  // Every trial on the wire is this set's (moved from the journey's U06 day, e2e/journey/w4-harmony.pw.ts).
  for (const r of sent.trials.values()) expect(r.familyId).toBe("fam.har.bass");
  expect(problems).toEqual([]);
});

test("the same U06 day in Quiet mode: no sung part, the mic never opens, the set is whole", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const problems = watch(page);
  const sent = wire(page);
  const micAsked = await countMic(page);
  await seed(request, "after U06.L05");
  // Quiet mode for today (the mic chip's choice): the same learner and plan, nothing waits for a voice.
  await api(request, "PUT", "/api/voice/quiet", { quiet: true, scope: "today" });
  await useUiPrefs(page, { theme: "bark" });
  await startDay(page);
  expect(await api<{ quiet: boolean }>(request, "GET", "/api/voice")).toMatchObject({ quiet: true });
  const item = await toFamily(page, "fam.har.bass");
  const before = (await sessionState(page)).warmupIndex;
  // The set is whole in Quiet mode: the same four trials, by the plan and on the screen.
  expect(item.trials).toBe(BASS_TRIALS);
  const total = await totalOf(page);
  expect(total).toBe(BASS_TRIALS);
  const pad = page.getByRole("group", { name: "Your answer: the degrees, in order" });
  for (let i = 0; i < total; i++) {
    const t = await trialNo(page, i + 1, total);
    await expect(pad).toBeVisible();
    if (i === 0) {
      await expect(page.getByTestId("stage-text")).toHaveText("Your turn.", { timeout: 40_000 });
      await expect(page.getByTestId("sing-part")).toHaveCount(0);
      await page.keyboard.press("v");
      await expect(page.getByTestId("pitch-lane")).toHaveCount(0);
      await pad.locator("button").first().focus();
    }
    for (const d of t.expected.degrees ?? []) await page.keyboard.press(d.replace(/^[b#]/, ""));
    await expect(page.getByTestId("trial-feedback")).toHaveAttribute("data-correct", "true");
    if (i === 0) {
      await settle(page);
      await expectNoOverflow(page);
      await shoot(page, SHOTS, "w4-warmup-bass-quiet", "bark");
      await frameMatrix(page, "w4-bass-feedback", page.getByTestId("next-trial"));
    }
    await nextTrial(page);
  }
  await finishSet(page, before);
  expect(micAsked()).toBe(0);
  await expect(page.getByRole("button", { name: "Microphone is live. Close it" })).toHaveCount(0);
  expect(sent.trials.size).toBe(total);
  for (const r of sent.trials.values()) expect(r.response.sung).toBeNull();
  // Every trial on the wire is this set's and graded right (the journey's U06 day asserted this of its set).
  for (const r of sent.trials.values()) expect(r).toMatchObject({ familyId: "fam.har.bass", correct: true });
  expect(problems).toEqual([]);
});

/** Picks a quality for each chord of the quality step (one pad per chord; a pick moves to the next). */
async function pickQualities(page: Page, qualities: readonly string[]): Promise<void> {
  const row = page.getByTestId("quality-row");
  await expect(row).toBeVisible();
  await row.locator("[data-quality-slot='0'] button").first().focus();
  for (const q of qualities) {
    await page.keyboard.press(QUALITY_KEYS[q] as string);
    await page.waitForTimeout(60);
  }
}
/** The diatonic triad key of the RN palette for a plain numeral ("vi" → 6). */
function romanDigit(rn: string): number {
  const base = rn.replace(/[^ivIV]/g, "").toUpperCase();
  return ["I", "II", "III", "IV", "V", "VI", "VII"].indexOf(base) + 1;
}
type Steps = { bass: string[]; quality: string[]; rn: string[] };
const stepsOf = (page: Page) =>
  page.evaluate(() => (globalThis as { __oakDrillSteps?: unknown }).__oakDrillSteps) as Promise<Steps>;

test("a U06 day: the staged chord dictation in the warm-up — bass, then qualities, then numerals", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const problems = watch(page);
  const sent = wire(page);
  const s = await seed(request, "after U06.L10");
  expect(s.next).toBe("U06.L11");
  await useUiPrefs(page, { theme: "paper" });
  await startDay(page);
  await toFamily(page, "fam.har.progression");
  const before = (await sessionState(page)).warmupIndex;
  const total = await totalOf(page);
  const track = page.getByTestId("step-track");
  const pad = page.getByRole("group", { name: "Your answer: the degrees, in order" });
  const rnPad = page.getByRole("group", { name: "Your answer: Roman numerals" });
  for (let i = 0; i < total; i++) {
    const t = await trialNo(page, i + 1, total);
    const a = await stepsOf(page);
    expect(a.rn).toEqual(t.expected.rn);
    await expect(page.getByTestId("step-prompt")).toHaveText(
      "Step 1 · The bass: the degree under each chord.",
    );
    await expect(pad).toBeVisible();
    await pad.locator("button").first().focus();
    for (const d of a.bass) await page.keyboard.press(d.replace(/^[b#]/, ""));
    await page.keyboard.press("Enter");
    await expect(track.locator('[data-step="bass"]')).toHaveAttribute("data-state", "found");
    await pickQualities(page, a.quality);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("step-prompt")).toHaveText("Step 3 · The Roman numerals.");
    await expect(rnPad).toBeVisible();
    await rnPad.locator("button").first().focus();
    // The last trial's numerals are wrong on purpose: the bass and qualities stand, the numerals are missed.
    const last = i === total - 1;
    for (const rn of a.rn)
      await page.keyboard.press(String(last ? (romanDigit(rn) === 1 ? 4 : 1) : romanDigit(rn)));
    if (i === 0) {
      await settle(page);
      await expectNoOverflow(page);
      await shoot(page, SHOTS, "w4-warmup-staged-numerals", "paper");
    }
    await page.getByTestId("check-answer").click();
    await expect(page.getByTestId("trial-feedback")).toHaveAttribute("data-correct", last ? "false" : "true");
    if (last) await expect(track.locator('[data-step="rn"]')).toHaveAttribute("data-state", "missed");
    await nextTrial(page);
  }
  await finishSet(page, before);
  expect(sent.trials.size).toBe(total);
  const first = sent.trials.get(0);
  expect(first).toMatchObject({ correct: true, credit: 1 });
  expect(Object.keys(first?.response.answer?.stages ?? {})).toEqual(["bass", "quality", "rn"]);
  expect(sent.trials.get(total - 1)?.correct).toBe(false);
  expect(problems).toEqual([]);
});

test("the stage D warm-up set at both sizes in both themes", async ({ page, request }) => {
  test.setTimeout(180_000);
  await seed(request, "after U05.L02");
  await useUiPrefs(page, { theme: "paper" });
  await startDay(page);
  await toFamily(page, "fam.chd.quality-triad");
  // This browser keeps the open session's place at most every 2 s (session/runner.ts persist): before the reload,
  // the kept place is this set's (the skips before it included).
  const at = (await sessionState(page)).warmupIndex;
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              JSON.parse(localStorage.getItem("oak.session.active.v1") ?? "null") as {
                state?: { warmupIndex?: number };
              } | null
            )?.state?.warmupIndex,
        ),
      { timeout: 10_000 },
    )
    .toBe(at);
  // A reload resumes the session at this set (its listening first, as a blocked intro always starts).
  await matrix(page, "w4-warmup-quality-trial", async (p) => {
    await p.reload();
    const listen = p.getByRole("button", { name: /Start the set/ });
    await expect(listen.or(p.getByTestId("trial-counter"))).toBeVisible({ timeout: 60_000 });
    // Its listening is heard through once in this file (the U05 day); here the set starts while it plays.
    if (await listen.isVisible()) await startTheSet(p, false);
    await expect(p.getByTestId("trial-counter")).toBeVisible({ timeout: 30_000 });
    await expect(p.getByRole("group", { name: "Your answer: which chord quality?" })).toBeVisible();
  });
});

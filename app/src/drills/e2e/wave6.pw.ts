// Wave 6 ear training on the real Oak server (own stack, throwaway data): a seventh-quality set, a chromatic degree
// whose lean is sung on Chromium's fake microphone and the same trial in Quiet mode (the mic never opens), a
// secondary-dominant trial, a mode set, a key-change trial, a push marked on the grid and a tapped triplet bar,
// then the hub. Every trial is drawn on purpose (`__oakDrillForce`, free practice), so each test proves its case on
// every run; every record is read back from the wire. The learner comes from the dev seed "U17.CP due" (every
// family of stages E, F and H open; a missing point is a failure, never a fallback).
import { fileURLToPath } from "node:url";
import type { DrillTrialRecord, Trial } from "@oak/api";
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const HEADERS = { "X-Oak": "1", Origin: stack.baseURL, "Content-Type": "application/json" };
const POINT = "U17.CP due";

interface Force {
  category?: string;
  level?: number;
  seed?: number;
  sung?: boolean;
}
type Spec =
  | { ui: "choice"; options: { id: string; label: string }[] }
  | { ui: "degree-pad" | "quality-pad"; set: string[] }
  | { ui: "grid"; stepsPerBar: number };

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|501|Not Implemented/i.test(m.text()))
      problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

function trialPosts(page: Page): Map<number, DrillTrialRecord> {
  const out = new Map<number, DrillTrialRecord>();
  page.on("request", (r) => {
    if (r.method() !== "POST" || !/\/api\/drills\/sessions\/[^/]+\/trials$/.test(r.url())) return;
    for (const t of (r.postDataJSON() as { trials: DrillTrialRecord[] }).trials) out.set(t.idx, t);
  });
  return out;
}

async function countMic(page: Page): Promise<() => number> {
  let asked = 0;
  await page.exposeFunction("__w6MicAsked", () => {
    asked++;
  });
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => {
      (window as unknown as { __w6MicAsked(): void }).__w6MicAsked();
      return orig(c);
    };
  });
  return () => asked;
}

/** The Wave 6 learner, from its dev seed. */
async function seed(page: Page): Promise<void> {
  await page.request.put(`${stack.apiURL}/api/dev/clock`, { headers: HEADERS, data: { reset: true } });
  const res = await page.request.post(`${stack.apiURL}/api/dev/seed`, {
    headers: HEADERS,
    data: { point: POINT },
  });
  expect(res.ok(), await res.text()).toBe(true);
}

async function prepare(
  page: Page,
  force: Record<number, Force>,
  opts: { quiet?: boolean } = {},
): Promise<void> {
  // Other engineers' edits must not reload the page mid-test.
  await page.routeWebSocket(/.*/, () => {});
  await useUiPrefs(page, { theme: "paper" });
  await page.addInitScript((f) => {
    (globalThis as { __oakDrillForce?: unknown }).__oakDrillForce = f;
  }, force);
  if (opts.quiet !== undefined) {
    const res = await page.request.put(`${stack.apiURL}/api/voice/quiet`, {
      headers: HEADERS,
      data: { quiet: opts.quiet, scope: "today" },
    });
    expect(res.ok(), await res.text()).toBe(true);
  }
}

async function startPractice(page: Page, familyId: string): Promise<void> {
  await page.goto(`/practice/${familyId}`);
  await expect(page.getByTestId("start-set")).toBeFocused({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("trial-counter")).toHaveText(/Trial 1 of \d+/, { timeout: 60_000 });
}

const hook = <T>(page: Page, name: string): Promise<T> =>
  page.evaluate((n) => (globalThis as Record<string, unknown>)[n], name) as Promise<T>;

async function trialNo(page: Page, n: number, of: number): Promise<Trial> {
  await expect(page.getByTestId("trial-counter")).toHaveText(`Trial ${n} of ${of}`, { timeout: 30_000 });
  await expect
    .poll(async () => (await hook<Trial | undefined>(page, "__oakDrillTrial"))?.category)
    .toBeTruthy();
  return hook<Trial>(page, "__oakDrillTrial");
}

const answerArea = (page: Page) => page.getByRole("region", { name: "Your answer" });

/** Picks a pad key or a choice by its place in the widget (the order of `__oakDrillSpec`). */
async function pick(page: Page, id: string): Promise<void> {
  const spec = await hook<Spec>(page, "__oakDrillSpec");
  if (spec.ui === "choice") {
    const label = spec.options.find((o) => o.id === id)?.label as string;
    // The choice widget numbers its options ("2. Bar 3").
    const esc = label.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    await answerArea(page)
      .getByRole("radio", { name: new RegExp(`(^|\\. )${esc}$`) })
      .click();
  } else if (spec.ui === "degree-pad" || spec.ui === "quality-pad") {
    const i = spec.set.indexOf(id);
    expect(i, `${id} is on the pad ${spec.set.join(" ")}`).toBeGreaterThanOrEqual(0);
    // The quality pad's digits follow its keys; a degree pad's digits are degree numbers, so ♯4 is clicked.
    if (spec.ui === "quality-pad") await page.keyboard.press(String(i + 1));
    else await answerArea(page).getByRole("radio").nth(i).click();
  }
  const check = page.getByTestId("check-answer");
  if (await check.isVisible()) await check.click();
}

async function listen(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await expect(page.getByTestId("stage-text")).toHaveText("Playing…");
  await expect(page.getByTestId("stage-text")).toHaveText("Listen back, try again, or move on.", {
    timeout: 30_000,
  });
}

/** Both themes at both sizes: the primary action in view, no horizontal overflow; back to Paper 1440×900. */
async function frameMatrix(page: Page, name: string, primary = "next-trial"): Promise<void> {
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((theme) => document.documentElement.setAttribute("data-theme", theme), m.theme);
    await expect(page.getByTestId(primary)).toBeInViewport();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shoot(page, SHOTS, name, m.theme);
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "paper"));
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe.configure({ mode: "serial" });

test("a seventh-quality set: the pair that makes the quality, the 3rd and 7th alone, the near miss", async ({
  page,
}) => {
  const problems = watch(page);
  const posts = trialPosts(page);
  await seed(page);
  const cats = ["7", "maj7", "m7", "7", "m7", "maj7", "7", "maj7"];
  await prepare(page, Object.fromEntries(cats.map((category, i) => [i, { category, level: 2 }])));
  await startPractice(page, "fam.chd.quality-7th");
  const total = cats.length;
  const feedback = page.getByTestId("trial-feedback");
  for (let i = 0; i < total; i++) {
    const t = await trialNo(page, i + 1, total);
    const want = t.expected.qualities?.[0] as string;
    expect(want).toBe(cats[i] as string);
    const wrong = i === 1;
    await expect(page.getByRole("group", { name: "Your answer: which chord quality?" })).toBeVisible();
    await pick(page, wrong ? "7" : want);
    await expect(feedback).toHaveAttribute("data-correct", wrong ? "false" : "true");
    if (i === 0) {
      await expect(feedback).toHaveText(/That's it: dominant 7th\./);
      await expect(page.getByTestId("trial-fact")).toHaveText(
        /^A major 3rd( \([A-G][♭♯]?\))? under a minor 7th( \([A-G][♭♯]?\))?: that pair makes it a dominant seventh\.$/,
      );
      // Alone, in context, against the near miss: each by its key.
      await expect(page.getByTestId("hear-alone")).toHaveText(/The 3rd and 7th alone/);
      await expect(page.getByTestId("hear-near")).toHaveText(/Against a major 7th/);
      await expect(page.getByTestId("hear-context")).toBeVisible();
      await expect(page.getByTestId("hear-bass")).toHaveCount(0);
      await listen(page, "l");
      await listen(page, "n");
      await frameMatrix(page, "w6-seventh-feedback");
    }
    if (wrong) {
      // The near miss is the learner's own pick: a dominant 7th against the major 7th it was.
      await expect(feedback).toHaveText(/It was major 7th\./);
      await expect(page.getByTestId("hear-near")).toHaveText(/Against a dominant 7th/);
    }
    await page.keyboard.press("Enter");
  }
  await expect(page.getByTestId("set-summary")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => posts.size).toBe(total);
  expect([...posts.values()].filter((p) => p.correct).length).toBe(total - 1);
  expect(posts.get(1)?.confusion).toEqual(["maj7", "7"]);
  expect(problems).toEqual([]);
});

for (const quiet of [false, true])
  test(`a chromatic degree${quiet ? " in Quiet mode: the lean is heard, the mic never opens" : ": ♯4 leans up to 5, sung on the fake mic"}`, async ({
    page,
  }) => {
    const problems = watch(page);
    const posts = trialPosts(page);
    const micAsked = await countMic(page);
    await seed(page);
    await prepare(page, { 0: { category: "deg.s4", level: 1, sung: true } }, { quiet });
    await startPractice(page, "fam.deg.fet-chromatic");
    const t = await trialNo(page, 1, 8);
    expect(t.expected.degrees).toEqual(["#4"]);
    // The way home is the lean: two notes.
    expect((t.params.resolutionTargets as unknown[]).length).toBe(2);
    await expect(page.getByTestId("trial-prompt")).toHaveText(
      "After the cadence: which degree was the last note? Some come from outside the key.",
    );
    const pad = page.getByRole("group", { name: "Your answer: which degree?" });
    await expect(pad).toBeVisible();
    // One key per pitch: ♯4 is there, and no second spelling of it.
    await expect(pad.getByRole("radio")).toHaveCount(7);
    await expect(pad.getByRole("radio", { name: /^sharp 4/ })).toHaveCount(1);
    await pick(page, "#4");
    const feedback = page.getByTestId("trial-feedback");
    await expect(feedback).toHaveAttribute("data-correct", "true");
    await expect(page.getByTestId("way-home")).toHaveText(/^♯4 leans up to 5( · fi sol)?\.$/);
    await expect(page.getByTestId("hear-alone")).toHaveText(/The note alone/);
    await expect(page.getByTestId("hear-near")).toHaveText(/Against 4/);
    await expect(page.getByTestId("hear-in-context")).toBeVisible();
    const next = page.getByTestId("next-trial");
    await expect(next).toHaveText(quiet ? /Hear it lean/ : /Sing the lean/);
    if (!quiet) await frameMatrix(page, "w6-chromatic-feedback");
    await page.keyboard.press("Enter");
    if (quiet) {
      const card = page.getByTestId("quiet-resolution");
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(card).toContainText("Quiet mode: hear the lean again in your head.");
      await expect(page.getByTestId("pitch-lane")).toHaveCount(0);
      await page.keyboard.press("Space");
      await expect(feedback).toContainText("Heard the lean, in your head.");
    } else {
      // Real time on purpose: the lean is sung through the fake microphone, once.
      await expect(page.getByTestId("pitch-lane")).toBeVisible({ timeout: 20_000 });
      await expect(feedback).toContainText("Now sing the lean: the note, then the note it leans to.");
      await expect(feedback).toContainText(/Sung/, { timeout: 30_000 });
    }
    await expect(next).toHaveText(/Next/);
    await expect.poll(() => posts.get(0)?.sungResolution ?? null).not.toBeNull();
    const sr = posts.get(0)?.sungResolution;
    expect(sr?.path).toEqual(["#4", "5"]);
    expect(sr?.quiet).toBe(quiet);
    expect(sr?.notes.length).toBe(quiet ? 0 : 2);
    expect(posts.get(0)?.correct).toBe(true);
    expect(posts.get(0)?.credit).toBe(1);
    if (quiet) {
      expect(micAsked()).toBe(0);
      await expect(page.getByRole("button", { name: /Microphone is live/ })).toHaveCount(0);
    } else expect(micAsked()).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

test("a secondary dominant: which bar, what it is, where it leans, and the key's own chord in its place", async ({
  page,
}) => {
  const problems = watch(page);
  const posts = trialPosts(page);
  await seed(page);
  await prepare(page, { 0: { category: "V/vi", level: 2 }, 1: { category: "V/vi", level: 2, seed: 1 } });
  await startPractice(page, "fam.har.chromatic");
  const feedback = page.getByTestId("trial-feedback");
  let followed = false;
  for (const n of [1, 2]) {
    const t = await trialNo(page, n, 5);
    expect(t.category).toBe("V/vi");
    const want = t.expected.choice?.[0] as string;
    await expect(page.getByTestId("trial-prompt")).toHaveText(
      t.params.ui === "bar-buttons"
        ? "In which bar does a chord step outside the key?"
        : /Which chord is it\?$/,
    );
    await pick(page, want);
    await expect(feedback).toHaveAttribute("data-correct", "true");
    await expect(page.getByTestId("trial-fact")).toHaveText(
      new RegExp(`^Bar ${t.params.chromaticBar} is V7/vi.*: the dominant of vi, and it leans to vi.*♯5`),
    );
    await expect(page.getByTestId("hear-alone")).toHaveText(/The chord, then where it goes/);
    await expect(page.getByTestId("hear-near")).toHaveText(/With iii7, the key's own chord/);
    await expect(page.getByTestId("answer-in-context")).toBeVisible();
    const follow = page.getByTestId("follow-up");
    if (t.params.ui === "bar-buttons" && !followed) {
      // One more for the ear, never recorded: which chord it was.
      followed = true;
      const f = await hook<{ options: { id: string }[]; correct: string }>(page, "__oakDrillFollow");
      expect(f.correct).toBe("V/vi");
      await expect(follow).toContainText("Which chord was it in bar");
      await page.keyboard.press(String(f.options.findIndex((o) => o.id === f.correct) + 1));
      await expect(page.getByTestId("follow-up-answer")).toHaveText("Yes. V7/vi: it leans to vi.");
      await listen(page, "n");
      await frameMatrix(page, "w6-secondary-feedback");
    } else if (t.params.ui !== "bar-buttons") await expect(follow).toHaveCount(0);
    await page.keyboard.press("Enter");
  }
  await trialNo(page, 3, 5);
  expect(posts.size).toBe(2);
  // The second question never reaches the wire.
  for (const p of posts.values()) expect(JSON.stringify(p)).not.toContain("follow");
  expect(problems).toEqual([]);
});

test("a mode set: the one changed note, the scale, and the tune in the scale it is compared with", async ({
  page,
}) => {
  const problems = watch(page);
  const posts = trialPosts(page);
  await seed(page);
  const cats = ["dorian", "minor", "mixolydian", "lydian", "phrygian", "major"];
  await prepare(page, Object.fromEntries(cats.map((category, i) => [i, { category, level: 5 }])));
  await startPractice(page, "fam.key.mode");
  const feedback = page.getByTestId("trial-feedback");
  for (let i = 0; i < cats.length; i++) {
    const t = await trialNo(page, i + 1, cats.length);
    expect(t.expected.choice).toEqual([cats[i] as string]);
    await expect(page.getByTestId("trial-prompt")).toHaveText(/^Which (mode|colour|scale)\b.*[?.]$/);
    await pick(page, cats[i] as string);
    await expect(feedback).toHaveAttribute("data-correct", "true");
    if (i === 0) {
      await expect(page.getByTestId("trial-fact")).toHaveText(
        "Dorian: natural minor with a raised 6 (1 2 ♭3 4 5 6 ♭7).",
      );
      await expect(page.getByTestId("hear-alone")).toHaveText(/The tune alone/);
      await expect(page.getByTestId("hear-scale")).toBeVisible();
      await expect(page.getByTestId("hear-near")).toHaveText(/The tune in natural minor/);
      await listen(page, "n");
      await frameMatrix(page, "w6-mode-feedback");
    }
    if (cats[i] === "minor" || cats[i] === "major")
      await expect(page.getByTestId("trial-fact")).toHaveCount(0);
    await page.keyboard.press("Enter");
  }
  await expect(page.getByTestId("set-summary")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => posts.size).toBe(cats.length);
  expect([...posts.values()].every((p) => p.correct)).toBe(true);
  expect(problems).toEqual([]);
});

test("a key change: the bar where home moves, the key ribbon, which way and how far, the lift undone", async ({
  page,
}) => {
  const problems = watch(page);
  const posts = trialPosts(page);
  await seed(page);
  await prepare(page, { 0: { category: "truck-driver", level: 1 }, 1: { category: "none", level: 1 } });
  await startPractice(page, "fam.har.modulation");
  const t = await trialNo(page, 1, 4);
  const bar = t.expected.choice?.[0] as string;
  await expect(page.getByTestId("trial-prompt")).toHaveText(
    "Does the key change? If it does, in which bar does the new key begin?",
  );
  await expect(page.getByTestId("key-ribbon")).toHaveCount(0);
  await pick(page, bar);
  const feedback = page.getByTestId("trial-feedback");
  await expect(feedback).toHaveAttribute("data-correct", "true");
  const fact = page.getByTestId("trial-fact");
  await expect(fact).toHaveText(
    new RegExp(`^Home moves at bar ${bar}: [A-G][♭♯]? major to [A-G][♭♯]? major, up a (half|whole) step\\.$`),
  );
  const ribbon = page.getByTestId("key-ribbon");
  await expect(ribbon.getByRole("button")).toHaveCount(8);
  await expect(ribbon.getByTestId("key-span-1")).toContainText(`from bar ${bar}`);
  await expect(
    ribbon.getByRole("button", { name: new RegExp(`^Bar ${bar}, the new key begins here`) }),
  ).toBeVisible();
  await expect(page.getByTestId("hear-alone")).toHaveText(/The two homes/);
  await expect(page.getByTestId("hear-near")).toHaveText(/Without the lift/);
  // One more for the ear: which way, and how far.
  const f = await hook<{ options: { id: string }[]; correct: string }>(page, "__oakDrillFollow");
  await expect(page.getByTestId("follow-up")).toContainText("Which way did home move, and how far?");
  const wrongAt = f.options.findIndex((o) => o.id !== f.correct);
  await page.keyboard.press(String(wrongAt + 1));
  await expect(page.getByTestId("follow-up-answer")).toHaveText(
    /^Not that one\. .* major to .* major: up a (half|whole) step\.$/,
  );
  await listen(page, "l");
  await frameMatrix(page, "w6-key-change-feedback");
  await page.keyboard.press("Enter");
  // No key change: one span, nothing to undo, nothing more to ask.
  const none = await trialNo(page, 2, 4);
  expect(none.expected.choice).toEqual(["none"]);
  await pick(page, "none");
  await expect(feedback).toHaveAttribute("data-correct", "true");
  await expect(fact).toHaveText(/^Home never moved: [A-G][♭♯]? major all the way\.$/);
  await expect(page.getByTestId("key-span-1")).toHaveCount(0);
  await expect(page.getByTestId("hear-near")).toHaveCount(0);
  await expect(page.getByTestId("follow-up")).toHaveCount(0);
  await expect.poll(() => posts.size).toBe(2);
  expect(posts.get(0)?.correct).toBe(true);
  expect(problems).toEqual([]);
});

test("rhythm II: a push marked on the grid, then a triplet bar tapped back over its count", async ({
  page,
}) => {
  const problems = watch(page);
  const posts = trialPosts(page);
  await seed(page);
  await prepare(page, { 0: { category: "anticipation", level: 1 } });
  await startPractice(page, "fam.rhy.syncopation");
  await trialNo(page, 1, 6);
  await expect(page.getByTestId("trial-prompt")).toHaveText("Mark the kick that lands off the beat.");
  const cells = await hook<string[]>(page, "__oakDrillCells");
  expect(cells.length).toBe(1);
  // One bar of sixteen cells, not thirty-two buttons.
  const grid = answerArea(page).getByRole("table");
  await expect(grid.getByRole("button")).toHaveCount(16);
  await grid.getByRole("button").nth(Number(cells[0])).click();
  await page.getByTestId("check-answer").click();
  const feedback = page.getByTestId("trial-feedback");
  await expect(feedback).toHaveAttribute("data-correct", "true");
  await expect(page.getByTestId("trial-fact")).toHaveText(/^The pushed kick is on the [e&a] of [1-4], /);
  await expect(page.getByTestId("hear-alone")).toHaveText(/Kick alone/);
  await expect(page.getByTestId("hear-near")).toHaveText(/With the kick on the beat/);
  await frameMatrix(page, "w6-push-feedback");
  await expect.poll(() => posts.get(0)?.correct).toBe(true);

  // The triplet bar: tapped in real time, once.
  await page.evaluate(() => {
    (globalThis as { __oakDrillForce?: unknown }).__oakDrillForce = { 0: { category: "triplets", level: 6 } };
  });
  await page.addInitScript(() => {
    (globalThis as { __oakDrillForce?: unknown }).__oakDrillForce = { 0: { category: "triplets", level: 6 } };
  });
  posts.clear();
  await startPractice(page, "fam.rhy.echo");
  const t = await trialNo(page, 1, 5);
  expect(t.category).toBe("triplets");
  const counts = page.getByTestId("tap-counts");
  await expect(counts).toHaveAttribute(
    "aria-label",
    "The count: 1 trip let 2 trip let 3 trip let 4 trip let",
  );
  await expect(page.getByTestId("stage-text")).toHaveText("Your turn: tap with Space.", { timeout: 30_000 });
  const targets = t.params.tapTargets as number[];
  const started = Date.now();
  for (const at of targets) {
    const wait = at * 1000 - (Date.now() - started);
    // A real-time measurement: each tap at its target time.
    if (wait > 0) await page.waitForTimeout(wait);
    await page.keyboard.press("Space");
  }
  await expect(feedback).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("tap-timeline")).toHaveAttribute("aria-label", /hits matched/);
  await expect(counts).toBeVisible();
  await frameMatrix(page, "w6-triplet-tap-feedback");
  await expect.poll(() => posts.get(0)?.response.taps?.length ?? 0).toBe(targets.length);
  expect(problems).toEqual([]);
});

test("the hub: stages F and H name the new families with honest levels", async ({ page }) => {
  const problems = watch(page);
  await seed(page);
  await prepare(page, {});
  await page.goto("/practice");
  const f = page.getByTestId("stage-F");
  await expect(f).toBeVisible({ timeout: 60_000 });
  await expect(f.getByRole("heading", { name: "Stage F · Chromatic colour" })).toBeVisible();
  await expect(f).toContainText("Notes and chords from outside the key, and the moment home itself moves.");
  for (const id of ["fam.deg.fet-chromatic", "fam.har.chromatic", "fam.har.modulation"])
    await expect(f.locator(`[data-family="${id}"]`)).toHaveCount(1);
  const h = page.getByTestId("stage-H");
  for (const id of ["fam.rhy.syncopation", "fam.rhy.subdivision"])
    await expect(h.locator(`[data-family="${id}"]`)).toHaveCount(1);
  const seventh = page.getByTestId("stage-E").locator('[data-family="fam.chd.quality-7th"]');
  await expect(seventh).toHaveCount(1);
  // The seeded learner has every family of the core open: each card shows its level, of how many.
  for (const card of [seventh, f.locator('[data-family="fam.har.modulation"]')])
    await expect(card).toContainText(/Level \d of \d/);
  // Every Wave 6 family is open to this learner and says where it stands: practising, mastered, or resting in mixed
  // practice (and then says so); never "locked".
  for (const id of [
    "fam.chd.quality-7th",
    "fam.deg.fet-chromatic",
    "fam.har.chromatic",
    "fam.har.modulation",
    "fam.rhy.syncopation",
    "fam.rhy.subdivision",
  ]) {
    const card = page.locator(`[data-family="${id}"]`);
    await expect(card, id).toHaveAttribute("data-status", /^(unlocked|resting|mastered)$/);
    if ((await card.getAttribute("data-status")) === "resting")
      await expect(card.getByTestId("family-resting"), id).toContainText("Resting in mixed practice");
  }
  // Mixed practice reads as what it has gathered.
  const mixed = page.getByTestId("mixed-practice");
  await expect(mixed).toBeVisible();
  await expect(mixed.locator('[data-testid^="composite-"]').first()).toContainText(/live(s)? here now: /);
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((theme) => document.documentElement.setAttribute("data-theme", theme), m.theme);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await f.scrollIntoViewIfNeeded();
    await shoot(page, SHOTS, "w6-hub-stage-f", m.theme);
  }
  expect(problems).toEqual([]);
});

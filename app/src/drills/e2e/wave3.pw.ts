// Wave 3 ear training on the real Oak server (own stack, throwaway data), each test from a dev seed: a degree set
// whose resolution is sung on Chromium's fake microphone, the same set in Quiet mode (heard, never sung, the
// mic never opens), an interval set opened by a passive-listen block, and melodic dictation answered right and
// wrong with Play mine and A/B. Every trial record the runner posts is read back from the wire.
//
// The seed is the real "after U02.CP" learner. U03/U04 content is still being authored this wave, so the lessons
// that open these families are marked completed in `/api/lessons/progress` (the response is otherwise the
// server's own); dictation's level 2 is opened in `/api/drills/families` the same way. `voice.get` is used as
// the server answers it; while it is not built (501) a VoiceState stands in, as the runner's seam allows.
import { fileURLToPath } from "node:url";
import type { DrillTrialRecord, Trial, VoiceState } from "@oak/api";
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const HEADERS = { "X-Oak": "1", Origin: stack.baseURL, "Content-Type": "application/json" };
const UNITS = ["U03.L01", "U03.L02", "U03.L03", "U03.L04", "U03.L10", "U04.L01"];

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|501|Not Implemented/i.test(m.text()))
      problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

/** Every trial record the runner posts (upserts: the last one per index wins). */
function trialPosts(page: Page): Map<number, DrillTrialRecord> {
  const out = new Map<number, DrillTrialRecord>();
  page.on("request", (r) => {
    if (r.method() !== "POST" || !/\/api\/drills\/sessions\/[^/]+\/trials$/.test(r.url())) return;
    const body = r.postDataJSON() as { trials: DrillTrialRecord[] };
    for (const t of body.trials) out.set(t.idx, t);
  });
  return out;
}

async function seed(page: Page, point = "after U02.CP"): Promise<void> {
  const res = await page.request.post(`${stack.apiURL}/api/dev/seed`, { headers: HEADERS, data: { point } });
  expect(res.ok(), await res.text()).toBe(true);
}

async function prepare(
  page: Page,
  opts: { quiet?: boolean; theme?: "paper" | "bark"; families?: Record<string, number> } = {},
): Promise<void> {
  // Other engineers' edits must not reload the page mid-test (wave3.md §8).
  await page.routeWebSocket(/.*/, () => {});
  await useUiPrefs(page, { theme: opts.theme ?? "paper" });
  await page.route("**/api/lessons/progress", async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { lessons: { lessonId: string; status: string }[] };
    for (const l of body.lessons) if (UNITS.includes(l.lessonId)) l.status = "completed";
    await route.fulfill({ response: res, json: body });
  });
  await page.route("**/api/voice", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    const real = res.ok() ? ((await res.json()) as VoiceState) : null;
    const base: VoiceState = real ?? {
      day: new Date().toISOString().slice(0, 10),
      quiet: false,
      quietReason: null,
      range: null,
      labels: "numbers",
      ladder: {
        cents: 70,
        mode: "auto",
        next: { cents: 50, medianAtMost: 35 },
        days: [],
        qualifyingDays: 0,
        daysNeeded: 3,
        held: null,
        offerLoosen: false,
        lastChange: null,
      },
    };
    const json: VoiceState =
      opts.quiet === undefined
        ? base
        : { ...base, quiet: opts.quiet, quietReason: opts.quiet ? "today" : null };
    await route.fulfill({ json });
  });
  if (opts.families) {
    const levels = opts.families;
    await page.route("**/api/drills/families", async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as { families: Record<string, unknown>[]; cards: unknown[] };
      for (const [familyId, maxOpenLevel] of Object.entries(levels)) {
        const st = body.families.find((f) => f.familyId === familyId);
        if (st) st.maxOpenLevel = maxOpenLevel;
        else
          body.families.push({
            familyId,
            level: 1,
            promoDay: null,
            categoryStats: {},
            confusion: {},
            blockedRemaining: 0,
            compositeId: null,
            graduatedAt: null,
            openCategories: [],
            maxOpenLevel,
          });
      }
      await route.fulfill({ response: res, json: body });
    });
  }
}

async function startPractice(page: Page, familyId: string): Promise<void> {
  await page.goto(`/practice/${familyId}`);
  await expect(page.getByTestId("start-set")).toBeFocused({ timeout: 60_000 });
}

/** The trial on screen (the runner's dev hook `__oakDrillTrial`; absent from production builds). */
async function currentTrial(page: Page): Promise<Trial> {
  return (await page.evaluate(() => (globalThis as { __oakDrillTrial?: unknown }).__oakDrillTrial)) as Trial;
}

test.describe.configure({ mode: "serial" });

test("a degree set: cadence, the degree pad, hear it resolve, and the way home sung on 2 trials", async ({
  page,
}) => {
  const problems = watch(page);
  const posts = trialPosts(page);
  await seed(page);
  await prepare(page, { quiet: false });
  await startPractice(page, "fam.deg.fet-major");
  await shoot(page, SHOTS, "fet-setup", "paper");
  await page.keyboard.press("Enter");
  const counter = page.getByTestId("trial-counter");
  await expect(counter).toHaveText("Trial 1 of 8", { timeout: 60_000 });
  let sung = 0;
  for (let i = 0; i < 8; i++) {
    await expect(counter).toHaveText(`Trial ${i + 1} of 8`);
    if (i === 0) {
      // The key is set first, then the target.
      await expect(page.getByTestId("stage-text")).toHaveText(/Setting the key|Listening|Your turn/);
      await expect(page.getByRole("group", { name: "Your answer: which degree?" })).toBeVisible();
      await shoot(page, SHOTS, "fet-answering", "paper");
    }
    await expect(page.getByRole("group", { name: /Your answer/ })).toBeVisible();
    await page.keyboard.press("1");
    const feedback = page.getByTestId("trial-feedback");
    await expect(feedback).toHaveCount(1);
    await expect(feedback).toBeVisible();
    const next = page.getByTestId("next-trial");
    if ((await next.textContent())?.includes("Sing it home")) {
      sung++;
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("pitch-lane")).toBeVisible();
      // Ribbons are labelled by degree; the text alternative names the targets.
      await expect(page.getByTestId("sing-needle")).toHaveText(/Target [♭♯]?\d/);
      if (sung === 1) {
        await expect(page.getByRole("button", { name: "Microphone is live. Close it" })).toBeVisible({
          timeout: 15_000,
        });
        await shoot(page, SHOTS, "fet-sing-home", "paper");
      }
      await expect(feedback).toContainText(/Sung home|Sung\. The trace|Singing skipped/, { timeout: 30_000 });
    } else {
      // Every answered degree walks home (or yours vs it); "Hear it resolve" is there to hear it again.
      await expect(page.getByRole("button", { name: /Hear it resolve/ })).toBeVisible();
      if (i === 0) await shoot(page, SHOTS, "fet-feedback", "paper");
    }
    await page.keyboard.press("Enter");
  }
  await expect(page.getByTestId("set-summary")).toHaveCount(1);
  await expect(page.getByTestId("set-summary")).toBeVisible({ timeout: 30_000 });
  await shoot(page, SHOTS, "fet-summary", "paper");
  expect(sung).toBe(2);
  expect(posts.size).toBe(8);
  const withRes = [...posts.values()].filter((r) => r.sungResolution);
  expect(withRes).toHaveLength(2);
  for (const r of withRes) {
    expect(r.modality).toBe("normal");
    expect(r.sungResolution?.quiet).toBe(false);
    expect(r.sungResolution?.path.at(-1)).toBe("1");
    expect(r.sungResolution?.order).toBe("play-first");
    expect(r.sungResolution?.notes.length).toBe(r.sungResolution?.path.length);
  }
  for (const r of posts.values()) expect(r.revealed).toBe(false);
  expect(problems).toEqual([]);
});

test("the same set in Quiet mode: the way home is heard, imagined with Space, and the mic never opens", async ({
  page,
}) => {
  const problems = watch(page);
  const posts = trialPosts(page);
  let micAsked = false;
  await page.exposeFunction("__micAsked", () => {
    micAsked = true;
  });
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => {
      (window as unknown as { __micAsked(): void }).__micAsked();
      return orig(c);
    };
  });
  await seed(page);
  await prepare(page, { quiet: true, theme: "bark" });
  await startPractice(page, "fam.deg.fet-major");
  await page.keyboard.press("Enter");
  const counter = page.getByTestId("trial-counter");
  await expect(counter).toHaveText("Trial 1 of 8", { timeout: 60_000 });
  let heard = 0;
  for (let i = 0; i < 8; i++) {
    await expect(counter).toHaveText(`Trial ${i + 1} of 8`);
    await expect(page.getByRole("group", { name: /Your answer/ })).toBeVisible();
    // Show me on the first trial: recorded as revealed, no credit.
    if (i === 0) await page.getByRole("button", { name: "Show me" }).click();
    else await page.keyboard.press("3");
    await expect(page.getByTestId("trial-feedback")).toBeVisible();
    const next = page.getByTestId("next-trial");
    if ((await next.textContent())?.includes("Hear it home")) {
      heard++;
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("quiet-resolution")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("stage-text")).toHaveText("Hear it in your head, then press Space.");
      if (heard === 1) await shoot(page, SHOTS, "fet-quiet-imagine", "bark");
      await page.keyboard.press("Space");
      await expect(page.getByTestId("trial-feedback")).toContainText("Heard home, in your head.");
    }
    await page.keyboard.press("Enter");
  }
  await expect(page.getByTestId("set-summary")).toBeVisible({ timeout: 30_000 });
  expect(heard).toBe(2);
  expect(micAsked).toBe(false);
  await expect(page.getByRole("button", { name: "Microphone is live. Close it" })).toHaveCount(0);
  const recs = [...posts.values()];
  expect(recs).toHaveLength(8);
  expect(recs.find((r) => r.idx === 0)).toMatchObject({ revealed: true, credit: 0 });
  const quiet = recs.filter((r) => r.sungResolution);
  expect(quiet).toHaveLength(2);
  for (const r of quiet) {
    expect(r.modality).toBe("quiet");
    expect(r.sungResolution).toMatchObject({ quiet: true, skipped: false, notes: [], credit: 0 });
  }
  // Sung families wait in Quiet mode, with no penalty: the hub says so instead of offering them.
  await page.goto("/practice");
  await expect(page.locator('[data-family="fam.deg.sing"]')).toContainText("waits for the microphone");
  expect(problems).toEqual([]);
});

test("an interval set opens with a passive-listen block: named pairs, nothing to answer, skippable", async ({
  page,
}) => {
  const problems = watch(page);
  const posts = trialPosts(page);
  await seed(page);
  await prepare(page);
  await startPractice(page, "fam.int.in-key");
  await expect(page.getByTestId("listen-first")).toBeVisible();
  await page.keyboard.press("l");
  const block = page.getByTestId("passive-listen");
  await expect(block).toBeVisible();
  await expect(block).toContainText("Just listen · nothing to answer");
  await expect(page.getByTestId("passive-counter")).toHaveText(/of 8/);
  // Named as it plays: "1 → 5", with its generic size.
  const caption = page.getByTestId("passive-caption");
  await expect(caption).toHaveText(/^[♭♯]?\d → [♭♯]?\d$/, { timeout: 30_000 });
  await expect(block).toContainText(/an? (2nd|3rd|4th|5th|6th|7th|octave)/);
  await shoot(page, SHOTS, "passive-listen", "paper");
  await expect(page.getByTestId("passive-counter")).toHaveText(/^2 of 8$/, { timeout: 30_000 });
  // Nothing is posted while listening, and Enter skips the rest into the set.
  expect(posts.size).toBe(0);
  await page.keyboard.press("Enter");
  const counter = page.getByTestId("trial-counter");
  await expect(counter).toHaveText("Trial 1 of 8", { timeout: 60_000 });
  for (let i = 0; i < 3; i++) {
    await expect(counter).toHaveText(`Trial ${i + 1} of 8`);
    await expect(page.getByRole("group", { name: "Your answer: the degrees, in order" })).toBeVisible();
    await page.keyboard.press("1");
    await page.keyboard.press("5");
    await expect(page.getByTestId("trial-feedback")).toBeVisible();
    if (i === 0) await shoot(page, SHOTS, "interval-feedback", "paper");
    await page.keyboard.press("Enter");
  }
  expect(posts.size).toBe(3);
  for (const r of posts.values()) expect(r.response.answer?.degrees).toHaveLength(2);
  expect(problems).toEqual([]);
});

test("melodic dictation: degrees by ear with Play mine and A/B by bar, one trial right and one wrong", async ({
  page,
}) => {
  const problems = watch(page);
  const posts = trialPosts(page);
  await seed(page);
  await prepare(page, { families: { "fam.mel.dictation": 2 } });
  await startPractice(page, "fam.mel.dictation");
  // Level 2: the degrees, in order.
  await page
    .getByRole("button", { name: /Increase|\+/ })
    .first()
    .click();
  await expect(page.getByText(/^Level 2: /)).toBeVisible();
  await page.getByTestId("start-set").click();
  const counter = page.getByTestId("trial-counter");
  await expect(counter).toHaveText("Trial 1 of 4", { timeout: 60_000 });
  await expect(page.getByTestId("trial-prompt")).toHaveText("Write the tune as degrees, in order.");
  const pad = page.getByRole("group", { name: "Your answer: the degrees, in order" });
  await expect(pad).toBeVisible();
  // Right: the trial regenerated exactly as the runner made it.
  const t0 = await currentTrial(page);
  const want = t0.expected.degrees ?? [];
  expect(want.length).toBeGreaterThan(1);
  const tools = page.getByTestId("dictation-tools");
  await expect(page.getByTestId("play-mine")).toBeDisabled();
  for (const d of want) await page.keyboard.press(d.replace(/^[b#]/, ""));
  await expect(page.getByTestId("play-mine")).toBeEnabled();
  await page.getByTestId("play-mine").click();
  await tools.getByRole("button", { name: /A\/B bar 1/ }).click();
  await shoot(page, SHOTS, "dictation-answering", "paper");
  await page.getByRole("button", { name: /^Check/ }).click();
  const feedback = page.getByTestId("trial-feedback");
  await expect(feedback).toHaveAttribute("data-correct", "true");
  await expect(feedback).toContainText("That's it");
  await page.keyboard.press("Enter");
  // Wrong: all 1s (a tune is never one repeated note here).
  await expect(counter).toHaveText("Trial 2 of 4");
  const t1 = await currentTrial(page);
  await expect(pad).toBeVisible();
  for (let k = 0; k < (t1.expected.degrees?.length ?? 0); k++) await page.keyboard.press("1");
  await page.getByRole("button", { name: /^Check/ }).click();
  await expect(feedback).toHaveAttribute("data-correct", "false");
  await expect(feedback).toContainText("It was");
  await shoot(page, SHOTS, "dictation-wrong", "paper");
  expect(posts.get(0)).toMatchObject({ correct: true, credit: 1 });
  expect(posts.get(0)?.replays).toBeGreaterThanOrEqual(1);
  expect(posts.get(1)?.correct).toBe(false);
  expect(problems).toEqual([]);
});

test("the trial frame with lenses, both themes, both sizes; keyboard reaches the label switches", async ({
  page,
}) => {
  await seed(page);
  await prepare(page);
  await startPractice(page, "fam.deg.fet-major");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("trial-counter")).toHaveText("Trial 1 of 8", { timeout: 60_000 });
  await page.keyboard.press("1");
  await expect(page.getByTestId("trial-feedback")).toBeVisible();
  // The note-name lens is always available; turning it on names the asked note in the details line.
  const names = page.getByTestId("lens-noteNames");
  await expect(names).toBeVisible();
  if ((await names.getAttribute("aria-pressed")) !== "true") await names.click();
  await expect(page.getByTestId("trial-details")).toContainText(/[A-G][♭♯]?\d/);
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((theme) => document.documentElement.setAttribute("data-theme", theme), m.theme);
    await expect(page.getByTestId("next-trial")).toBeInViewport();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shoot(page, SHOTS, "fet-frame", m.theme);
  }
  await names.click();
  await expect(page.getByTestId("trial-details")).not.toContainText(/[A-G][♭♯]?\d/);
});

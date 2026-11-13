// Wave 3 journey (d): the U03 checkpoint end to end on the real stack, twice.
//   1. "U03.CP due": Today is a checkpoint day; after the warm-up the checkpoint opens with the tutor closed. Every
//      item is answered through the player's own grading path, except the sung item, which is left unanswered on
//      purpose: it only sets a practice level (contracts §7.6, §8), so the checkpoint still passes. The Make over
//      the unit's Band is saved, the result is read by skill, and the Coda follows.
//   2. "U03.CP failed": one failed attempt yesterday, so today is the retake. Enough gating items are left out to
//      land between the soft-pass line (0.75) and the pass line (0.85); the review offers "Continue anyway", which
//      soft-passes the unit: everything a pass opens, with the weak skills back in the warm-ups.
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
import { useUiPrefs as setUiPrefs } from "../support/ui.ts";
import { coda, startToday } from "./day.ts";
import { api, expectClean, noHmr, resetClock, seed, shootAll, watch } from "./support.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") }, permissions: ["microphone"] });
test.describe.configure({ mode: "serial" });

type Dev = {
  kind(): "family" | "authored" | "make" | null;
  expected(): Record<string, unknown> | null;
  params(): Record<string, unknown> | null;
  trialCode(): string | null;
  exercise(): { id: string; kind: string; reference?: { solutions: string[] } } | null;
  answer(r: unknown): Promise<void>;
};

interface StartItem {
  idx: number;
  skillId: string;
  role: "gating" | "level-setting";
  source: { kind: string };
}

/** Answers the item on screen from what it knows (its reference, its drawn trial); returns what it was. */
async function answerItem(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const d = (globalThis as unknown as { __oakCheckpoint: Dev }).__oakCheckpoint;
    const kind = d.kind();
    const ex = d.exercise();
    const exp = d.expected() ?? {};
    if (kind === "make") {
      const starter = (ex as unknown as { code: { starter: string } }).code.starter;
      await d.answer({ code: starter.replace(/⟪|⟫/g, "").replace("[1 ~ ~ ~]>", "[0 ~ ~ ~]>") });
      return "make";
    }
    if (ex?.id === "keysig-eb") {
      await d.answer({ answer: { text: ["Bb", "Eb", "Ab"] } });
      return "keysig";
    }
    if (kind === "authored" && ex?.reference) {
      await d.answer({ code: ex.reference.solutions[0] });
      return "code";
    }
    if (kind === "authored") {
      await d.answer({ answer: (ex as unknown as { correct: unknown }).correct });
      return "fact";
    }
    // A family item answered in code (dictation written in n(), a staff read into code): the trial's own code.
    const code = d.trialCode();
    if ((exp as { code?: unknown }).code !== undefined || (code && Object.keys(exp).length === 0)) {
      await d.answer({ code });
      return "family-code";
    }
    await d.answer({ answer: exp });
    return "family";
  });
}

const onScreen = (page: Page) =>
  page.evaluate(() => {
    const d = (globalThis as unknown as { __oakCheckpoint?: Dev }).__oakCheckpoint;
    return { kind: d?.kind() ?? null, exercise: d?.exercise()?.kind ?? null };
  });

/**
 * Takes every item: `leaveOut(idx)` says which to skip (the learner's "Skip this one"); sung items are always left
 * out. Returns the indices left out, by reason.
 */
async function takeCheckpoint(
  page: Page,
  leaveOut: (idx: number) => boolean,
): Promise<{ sung: number[]; skipped: number[]; kinds: string[] }> {
  await expect(page.getByTestId("checkpoint-intro")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("start-checkpoint").click();
  // No hints and no tutor until the result (contracts §7.6).
  await expect(page.getByTestId("hint")).toHaveCount(0);
  const review = page.getByTestId("checkpoint-review");
  const out = { sung: [] as number[], skipped: [] as number[], kinds: [] as string[] };
  for (let n = 0; n < 40; n++) {
    await expect(page.getByTestId("lesson-step").or(review).first()).toBeVisible({ timeout: 60_000 });
    if (await review.isVisible().catch(() => false)) break;
    await page.waitForFunction(() => !!(globalThis as { __oakCheckpoint?: unknown }).__oakCheckpoint);
    const step = (await page.getByTestId("lesson-step").getAttribute("data-step")) ?? "";
    const idx = /^I(\d+)$/.exec(step) ? Number(step.slice(1)) - 1 : -1;
    const what = await onScreen(page);
    if (what.exercise === "sing" || (idx >= 0 && what.kind !== "make" && leaveOut(idx))) {
      if (what.exercise === "sing") out.sung.push(idx);
      else out.skipped.push(idx);
      await page.getByTestId("skip-item").click();
    } else out.kinds.push(await answerItem(page));
    await expect(page.getByTestId("lesson-step").or(review).first()).not.toHaveAttribute("data-step", step, {
      timeout: 60_000,
    });
  }
  await expect(review).toBeVisible();
  return out;
}

async function cpStatus(request: APIRequestContext): Promise<string | undefined> {
  const p = await api<{ checkpoints: { cpId: string; status: string }[] }>(
    request,
    "GET",
    "/api/lessons/progress",
  );
  return p.checkpoints.find((c) => c.cpId === "U03.CP")?.status;
}

async function begin(page: Page, request: APIRequestContext, point: string) {
  await resetClock(request);
  await seed(request, point);
  await noHmr(page);
  await setUiPrefs(page, { theme: "paper" });
  const w = watch(page);
  const started = page.waitForResponse(
    (r) => r.request().method() === "POST" && /\/api\/checkpoints\/U03\.CP\/start$/.test(r.url()),
    { timeout: 180_000 },
  );
  return { w, started };
}

test("U03.CP due: the checkpoint end to end to a pass; the sung item is left out and does not gate", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const { w, started } = await begin(page, request, "U03.CP due");
  const plan = await startToday(page, request, { warmupSets: 0 });
  expect(plan).toMatchObject({ kind: "checkpoint", mapItemId: "U03.CP" });
  const taken = takeCheckpoint(page, () => false);
  const attempt = (await (await started).json()) as { attemptNo: number; items: StartItem[] };
  expect(attempt.attemptNo).toBe(1);
  const run = await taken;
  expect(run.kinds).toContain("keysig");
  expect(run.kinds).toContain("make");
  // The sung item was offered and left unanswered: it sets a practice level, it never gates.
  expect(run.sung.length).toBeGreaterThan(0);
  for (const idx of run.sung) expect(attempt.items.find((i) => i.idx === idx)?.role).toBe("level-setting");
  await page.getByTestId("hand-in").click();
  const result = page.getByTestId("checkpoint-result");
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(result).toHaveAttribute("data-passed", "1");
  await expect(result).toContainText("sets your practice level");
  await shootAll(page, "w3-u03cp-passed");
  expect(await cpStatus(request)).toBe("passed");
  await page.getByTestId("checkpoint-done").click();
  await coda(page, { unlocks: "auto" });
  expectClean(w);
});

test("U03.CP retake: between the lines, 'Continue anyway' soft-passes the unit", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const { w, started } = await begin(page, request, "U03.CP failed");
  const plan = await startToday(page, request, { warmupSets: 0 });
  expect(plan).toMatchObject({ kind: "checkpoint", mapItemId: "U03.CP" });
  // The attempt's items are known once it starts; the walker then leaves out just enough gating items.
  let gatingOut = new Set<number>();
  const taken = (async () => {
    const attempt = (await (await started).json()) as { attemptNo: number; items: StartItem[] };
    expect(attempt.attemptNo).toBe(2);
    const gating = attempt.items.filter((i) => i.role === "gating");
    const n = gating.length;
    let k = 1;
    while ((n - k) / n >= 0.85) k++;
    expect((n - k) / n).toBeGreaterThanOrEqual(0.75);
    // The Make is a gating item too, and is always handed in; the others can be left out.
    gatingOut = new Set(
      gating
        .filter((i) => i.source.kind !== "make")
        .slice(-k)
        .map((i) => i.idx),
    );
    return attempt;
  })();
  const run = await takeCheckpoint(page, (idx) => gatingOut.has(idx));
  await taken;
  expect(run.skipped.length).toBe(gatingOut.size);
  const anyway = page.getByTestId("continue-anyway");
  await expect(anyway).toBeVisible();
  await shootAll(page, "w3-u03cp-continue-anyway");
  await anyway.click();
  const result = page.getByTestId("checkpoint-result");
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(result).toContainText(/worth another look|come back|warm-up/i);
  await shootAll(page, "w3-u03cp-soft-pass");
  expect(await cpStatus(request)).toBe("soft-passed");
  await page.getByTestId("checkpoint-done").click();
  await coda(page, { unlocks: "auto" });
  expectClean(w);
});

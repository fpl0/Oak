// Walks a lesson in the real player as a learner who knows the answers: each graded step is answered from the
// lesson's own authored passing test (its reference). Code goes into the step's editor and is checked with the
// Check button; the answers that need a body (taps, a sung note, a generated ear trial) go through the player's
// dev hook, which grades them on the same path as the widgets (app/src/lesson/LessonPlayer.tsx `__oakLesson`).
import type { LessonDef, StepDef, TestResponse } from "@oak/content-kit";
import { expect, type Page } from "@playwright/test";

type Dev = {
  setCode(c: string): void;
  submit(r: unknown): Promise<{ status: string } | null>;
  trial(): Record<string, unknown> | null;
};

export async function stepIs(page: Page, id: string): Promise<void> {
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", id, { timeout: 60_000 });
}

export async function setCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => (globalThis as unknown as { __oakLesson: Dev }).__oakLesson.setCode(c), code);
}

export async function submit(page: Page, response: unknown): Promise<{ status: string } | null> {
  return page.evaluate(
    (r) => (globalThis as unknown as { __oakLesson: Dev }).__oakLesson.submit(r),
    response,
  );
}

async function trialAnswer(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => (globalThis as unknown as { __oakLesson: Dev }).__oakLesson.trial());
}

/** The first authored passing response of a step (`tests[].expect === "pass"`), if it is one a page can give. */
export function passingResponse(step: StepDef): TestResponse | null {
  const ex = step.exercise as { tests?: { response: TestResponse; expect: string }[] } | undefined;
  const t = ex?.tests?.find((x) => x.expect === "pass" && !("pitchFixture" in x.response));
  return t?.response ?? null;
}

export async function continueOn(page: Page): Promise<void> {
  const c = page.getByTestId("continue");
  // A listen step opens Continue once it has been heard.
  if (!(await c.isEnabled().catch(() => false))) {
    const play = page.getByTestId("play-toggle").first();
    if (await play.isVisible().catch(() => false)) {
      await play.click();
      await expect(c).toBeEnabled({ timeout: 30_000 });
      if ((await play.getAttribute("aria-pressed")) === "true") await play.click();
    }
  }
  await expect(c).toBeEnabled({ timeout: 30_000 });
  await c.click();
}

export interface WalkOptions {
  /** Responses that replace the authored ones (a sung note, a taken answer), by step ID. */
  answers?: Record<string, unknown>;
  /** Called on a step before it is answered (to ask the tutor, take a hint, look around). */
  before?(step: StepDef): Promise<void>;
  /** The code the Make saves (default: its authored passing test, else the step's starter). */
  makeCode?: string;
  /** The Make's sketch title. */
  makeTitle?: string;
  /** Stop at this step (it is on screen, not answered). */
  stopAt?: string;
}

/** Answers every step from its reference and saves the Make. Ends on the lesson's completion screen. */
export async function walkLesson(page: Page, def: LessonDef, o: WalkOptions = {}): Promise<void> {
  const start = await page.getByTestId("lesson-step").getAttribute("data-step", { timeout: 60_000 });
  const from = Math.max(
    0,
    def.steps.findIndex((s) => s.id === start),
  );
  for (const step of def.steps.slice(from)) {
    await stepIs(page, step.id);
    if (o.stopAt === step.id) return;
    await o.before?.(step);
    const ex = step.exercise;
    if (step.kind === "make") {
      const code = o.makeCode ?? codeOf(passingResponse(step)) ?? null;
      if (code) await setCode(page, code);
      // The Make is heard: it plays and the transport moves past where it started, then it stops.
      const run = page.getByTestId("play-toggle").first();
      const counter = page.getByTestId("bar-counter").first();
      const at = await counter.textContent();
      await run.click();
      await expect(run).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
      await expect(counter).not.toHaveText(at ?? "", { timeout: 30_000 });
      await run.click();
      if (o.makeTitle) await page.getByTestId("sketch-title").fill(o.makeTitle);
      await page.getByTestId("save-sketch").click();
      return;
    }
    // Concept steps may hold a set-up part done in onboarding: keep its result.
    const keep = page.getByTestId("setup-keep");
    if (await keep.isVisible().catch(() => false)) await keep.click();
    if (ex && step.graded !== false) {
      let response: unknown = o.answers?.[step.id] ?? passingResponse(step);
      if (response === null || response === undefined) {
        const expected = await trialAnswer(page);
        if (expected) response = { answer: expected };
      }
      if (response !== null && response !== undefined) {
        const code = codeOf(response as TestResponse);
        if (code !== null) {
          await setCode(page, code);
          await page.getByTestId("check").click();
          await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass", {
            timeout: 30_000,
          });
        } else {
          const r = await submit(page, response);
          // A predict or practice step comes back "ungraded"; anything but a fail or an error moves on.
          expect(["pass", "ungraded"], `${def.id} ${step.id}: ${r?.status}`).toContain(r?.status);
        }
      }
    }
    // A passive listening block (AUTHORING §16.5): heard until the first example is named, then stopped.
    const passive = page.getByTestId("passive");
    if (await passive.isVisible().catch(() => false)) {
      const play = page.getByTestId("passive-play");
      await play.click();
      await expect(page.getByTestId("passive-names").locator("li").first()).toBeVisible({ timeout: 30_000 });
      if (/Stop/.test((await play.textContent()) ?? "")) await play.click();
    }
    await continueOn(page);
  }
}

function codeOf(r: TestResponse | null): string | null {
  return r && "code" in r ? r.code : null;
}

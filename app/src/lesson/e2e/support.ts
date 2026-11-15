// Helpers for the lesson e2e: seeding progress in the stack's SQLite (the server is the only writer of
// learner state, so a spec opens a lesson the way a learner who finished the earlier ones would), and small
// page helpers for steps.
import { DatabaseSync } from "node:sqlite";
import { test as base, expect, type Page } from "@playwright/test";
import { stack } from "./playwright.config.ts";

/**
 * Every spec's `test`: Vite's HMR socket is answered locally and never reaches the server. Other engineers edit
 * shared files while this suite runs, and a hot update would remount components (and lose their state) mid-step.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:\d+\/(\?.*)?$/, (ws) => {
      ws.send(JSON.stringify({ type: "connected" }));
    });
    await use(page);
  },
});
export { expect };

/** Marks lessons completed (and nothing else), so the gates open the next ones. */
export function completeLessons(ids: readonly string[]): void {
  const db = new DatabaseSync(`${stack.dataDir}/oak.db`);
  try {
    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO lesson_progress (lesson_id, status, current_step, split_part, started_at, completed_at, best_score, completed_version, content_hash, updated_at)
       VALUES (?, 'completed', NULL, NULL, ?, ?, 1, 1, 'seed', ?)
       ON CONFLICT(lesson_id) DO UPDATE SET status = 'completed', completed_at = excluded.completed_at, updated_at = excluded.updated_at`,
    );
    for (const id of ids) stmt.run(id, now, now, now);
  } finally {
    db.close();
  }
}

/** Forgets lessons entirely (progress, step states, attempts), so each spec starts from its own state. */
export function resetLessons(ids: readonly string[]): void {
  const db = new DatabaseSync(`${stack.dataDir}/oak.db`);
  try {
    for (const id of ids) {
      db.prepare("DELETE FROM lesson_progress WHERE lesson_id = ?").run(id);
      db.prepare("DELETE FROM step_state WHERE lesson_id = ?").run(id);
    }
  } finally {
    db.close();
  }
}

/** Forgets a step's state (rung, attempts, pass) and reopens its lesson, as if it had not been checked yet. */
export function resetStep(lessonId: string, stepId: string): void {
  const db = new DatabaseSync(`${stack.dataDir}/oak.db`);
  try {
    db.prepare("DELETE FROM step_state WHERE lesson_id = ? AND step_id = ?").run(lessonId, stepId);
    db.prepare("UPDATE lesson_progress SET status = 'in_progress' WHERE lesson_id = ?").run(lessonId);
  } finally {
    db.close();
  }
}

export async function stepIs(page: Page, id: string): Promise<void> {
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", id, { timeout: 30_000 });
}

/**
 * A verdict locks the answer until "Try again" (docs/design/retry.md §2.5): a helper that answers a step again
 * presses it first, as a learner would. Nothing when no verdict is on screen.
 */
export async function tryAgainIfShown(page: Page): Promise<void> {
  const retry = page.getByTestId("lesson-step").getByTestId("result-retry");
  if (!(await retry.isVisible().catch(() => false))) return;
  if (!(await retry.isEnabled().catch(() => false))) await expect(retry).toBeEnabled();
  await retry.click();
  await expect(retry).toHaveCount(0);
  // Try again moves the focus to the answer on the next frame: let it land before the helper types anywhere.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
}

/** Replaces the code of the step's editor (the dev hook drives the same CODE event as typing). */
export async function setCode(page: Page, code: string): Promise<void> {
  await tryAgainIfShown(page);
  await page.evaluate((c) => {
    (globalThis as unknown as { __oakLesson: { setCode(c: string): void } }).__oakLesson.setCode(c);
  }, code);
}

export async function check(page: Page): Promise<void> {
  await page.getByTestId("check").click();
}

export async function next(page: Page): Promise<void> {
  const c = page.getByTestId("continue");
  await expect(c).toBeEnabled();
  await c.click();
}

type Dev = {
  submit(r: unknown): Promise<{ status: string } | null>;
  trial(): { degrees?: string[]; choice?: string[] } | null;
  snapshot(): { stepId: string; status: string; rung: number; code: string | null } | null;
};

/** Grades and submits a response through the player's own path (tap and sing need real timing otherwise). */
export function submit(page: Page, response: unknown): Promise<{ status: string } | null> {
  return page.evaluate(
    (r) => (globalThis as unknown as { __oakLesson: Dev }).__oakLesson.submit(r),
    response,
  );
}

/** The expected answer of the step's generated trial (a generator stimulus). */
export function trialAnswer(page: Page): Promise<{ degrees?: string[]; choice?: string[] } | null> {
  return page.evaluate(() => (globalThis as unknown as { __oakLesson: Dev }).__oakLesson.trial());
}

export function snapshot(page: Page) {
  return page.evaluate(() => (globalThis as unknown as { __oakLesson: Dev }).__oakLesson.snapshot());
}

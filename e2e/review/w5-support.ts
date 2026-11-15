// Helpers of the Wave 5 journey review (review:journey): the learner's U08–U11 lessons, side lessons, ear
// training, gym and capstone days on this suite's real stack (Vite 5221, API 8821, the scripted fake tutor). Every
// spec starts from a dev seed (wave5.md §6) and answers Vite's HMR socket locally (w4-support.ts `quietHmr`).
import { DatabaseSync } from "node:sqlite";
import { expect, type Page } from "@playwright/test";
import { stack } from "./playwright.config.ts";
import { step, tryAgainIfShown } from "./w4-support.ts";

/**
 * The server's data dir: this suite's stack, or `OAK_REVIEW_DATA_DIR` when the specs run against a stack started
 * by hand (attached.config.ts).
 */
const dataDir = () => process.env.OAK_REVIEW_DATA_DIR ?? stack.dataDir;

/**
 * Forgets a lesson the seed completed (its progress and step states), so a step can be met fresh: a seeded
 * lesson opens "Looking back" with every answer shown. The gates stay open (the lessons before it stay done).
 */
export function forgetLesson(lessonId: string): void {
  const db = new DatabaseSync(`${dataDir()}/oak.db`);
  try {
    db.prepare("DELETE FROM lesson_progress WHERE lesson_id = ?").run(lessonId);
    db.prepare("DELETE FROM step_state WHERE lesson_id = ?").run(lessonId);
  } finally {
    db.close();
  }
}

/** The step's verdict box, after Check. */
export const feedback = (page: Page) => page.getByTestId("step-feedback");

/** The verdict's words, one line. */
export async function verdict(page: Page): Promise<string> {
  return ((await feedback(page).textContent()) ?? "").replace(/\s+/g, " ").trim();
}

/** Check (the step's own button) and wait for a verdict of this status. */
export async function checkFor(page: Page, status: RegExp): Promise<string> {
  // After a verdict, Check comes back through Try again (docs/design/retry.md §2.5).
  await tryAgainIfShown(page);
  await step(page).page().getByTestId("check").click();
  await expect(feedback(page)).toHaveAttribute("data-status", status, { timeout: 30_000 });
  return verdict(page);
}

/** No raw IDs, template slots or code-like leftovers in learner-facing words. */
export const RAW = /\btb\.|\bfam\.|\bcd\.|\bterm\.|[{}]|undefined|NaN|\[object/;

/** The page never scrolls sideways. */
export async function noSideScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    "no sideways scroll",
  ).toBeLessThanOrEqual(0);
}

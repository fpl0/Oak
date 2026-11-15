// Takes a unit checkpoint in the real checkpoint player as a learner who has learnt the unit: each item is
// answered from its drawn trial's expected answer or, for an authored item, its own passing test, through the
// player's dev hook (`__oakCheckpoint.answer`, graded and saved on the same path as the widgets). Then the
// hand-in, and the result.
import { expect, type Page } from "@playwright/test";

type Cp = {
  expected(): Record<string, unknown> | null;
  params(): Record<string, unknown> | null;
  kind(): string | null;
  exercise(): { tests?: { response: Record<string, unknown>; expect: string }[] } | null;
  answer(r: unknown): Promise<void>;
};

/**
 * `tapLatencyMs`: the learner's measured tap latency (taps land that much after the beat, and the grader takes it
 * off again).
 */
export async function walkCheckpoint(page: Page, tapLatencyMs = 0): Promise<{ passed: boolean }> {
  await expect(page.getByTestId("checkpoint-intro")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("start-checkpoint").click();
  const review = page.getByTestId("checkpoint-review");
  for (let n = 0; n < 40; n++) {
    if (await review.isVisible().catch(() => false)) break;
    await expect(page.getByTestId("lesson-step").or(review)).toBeVisible({ timeout: 60_000 });
    if (await review.isVisible().catch(() => false)) break;
    const step = await page.getByTestId("lesson-step").getAttribute("data-step");
    await page.waitForFunction(() => !!(globalThis as { __oakCheckpoint?: unknown }).__oakCheckpoint);
    const response = await page.evaluate((lat) => {
      const cp = (globalThis as unknown as { __oakCheckpoint: Cp }).__oakCheckpoint;
      // A sung item is set aside: singing never gates (contracts §7.6, §8), and the gate journeys do not sing.
      if ((cp.exercise() as { kind?: string } | null)?.kind === "sing") return null;
      // A tapped item: on its targets, in the response window (an echo is tapped after the stimulus).
      const params = cp.params();
      // Wave 7: a polyrhythm tapped with two hands (`params.tapLanes`): each lane on its own targets, as `{ lanes }`.
      if (Array.isArray(params?.tapLanes))
        return {
          lanes: (params.tapLanes as { targets: number[] }[]).map((l) =>
            l.targets.map((t) => t + lat / 1000),
          ),
        };
      if (params?.mode === "tap" && Array.isArray(params.tapTargets)) {
        const at = typeof params.responseAt === "number" ? params.responseAt : 0;
        return { taps: (params.tapTargets as number[]).map((t) => t + at + lat / 1000) };
      }
      // Several answers in one item (J.CP1's read-the-chart): each authored part with its own passing test.
      const ex = cp.exercise() as {
        kind?: string;
        parts?: { tests?: { response: unknown; expect: string }[] }[];
      };
      if (ex?.kind === "all" && ex.parts)
        return {
          parts: ex.parts.map(
            (p) => p.tests?.find((t) => t.expect === "pass")?.response ?? { skipped: true },
          ),
        };
      // An authored item (and the Make) answers with its own passing test; a drawn trial with its expected answer.
      const pass = cp.exercise()?.tests?.find((t) => t.expect === "pass" && !("pitchFixture" in t.response));
      if (cp.kind() !== "family" && pass) return pass.response;
      const expected = cp.expected();
      if (expected) return { answer: expected };
      return pass?.response ?? null;
    }, tapLatencyMs);
    if (response === null) {
      await page.getByTestId("skip-item").click();
    } else {
      await page.evaluate(
        (r) => (globalThis as unknown as { __oakCheckpoint: Cp }).__oakCheckpoint.answer(r),
        response,
      );
    }
    // The next item (or the review) replaces this one.
    await expect(page.getByTestId("lesson-step").or(review)).not.toHaveAttribute("data-step", step ?? "", {
      timeout: 60_000,
    });
  }
  await expect(review).toBeVisible();
  await page.getByTestId("hand-in").click();
  const result = page.getByTestId("checkpoint-result");
  await expect(result).toBeVisible({ timeout: 60_000 });
  return { passed: (await result.getAttribute("data-passed")) === "1" };
}

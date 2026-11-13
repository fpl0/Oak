// /progress and the Oak for Wave 5, from dev seeds on the real server: every milestone in view lists what shows it
// (a lesson completed, a checkpoint passed, a capstone released with its checks passed, graded ladder passes), a
// can-do names the graded work its evidence came from, the side lessons count in their own track and never as what
// is left, the ladder grows L5 and L6 rungs once reached; and the Oak's bass, form, minor and blues strands and the
// sound-design branch read well as they light up. Nothing is filled or patched: the side-lesson count, the ladder and
// the skill map are the server's own, from the wave5.md §6 seeds.
import { expect, type Page, test } from "@playwright/test";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { api, blockHmr, expectNoOverflow, matrix, SHOTS, seed, settle } from "./support.ts";
import { watch } from "./w5-helpers.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await blockHmr(page);
});

test("progress: each milestone lists what shows it; can-dos name their graded work; side lessons in their own track", async ({
  page,
  request,
}) => {
  const errors = watch(page);
  await seed(request, "X1 released");
  const open = async (p: Page) => {
    await p.goto("/progress");
    await expect(p.getByTestId("progress-milestones").locator('[data-milestone="ms.03"]')).toHaveAttribute(
      "data-state",
      "reached",
      { timeout: 30_000 },
    );
    await expect(p.getByTestId("milestone-evidence").first()).toBeVisible();
  };
  await useUiPrefs(page, { theme: "paper" });
  await open(page);
  const ms3 = page.getByTestId("progress-milestones").locator('[data-milestone="ms.03"]');
  await expect(ms3.getByTestId("milestone-evidence")).toContainText(
    "C2 Four-Chord Song: released to your album: every check passed",
  );
  await expect(ms3.locator('[data-met="true"]')).toHaveCount(1);
  // The milestone being worked towards lists what is done and what is still ahead, plainly.
  const next = page.getByTestId("progress-milestones").locator('[data-state="next"]');
  await expect(next.getByTestId("milestone-evidence")).toBeVisible();
  await expect(next.locator('[data-met="false"]').first()).toBeVisible();
  // The new milestones wait under "Later" with the rest.
  await page.getByText(/^Later \(\d+\)$/).click();
  for (const id of ["ms.10", "ms.11", "ms.12", "ms.13", "ms.14"])
    await expect(page.locator(`[data-milestone="${id}"]`)).toHaveCount(1);
  // A can-do names the lesson whose graded work it came from.
  await expect(page.getByTestId("ledger-compose")).toContainText(
    /latest from (graded work in [A-Z]\d+\.L\d+|your album track|the )/,
  );
  // Track A: what was taken, never what is left. None taken here: open, optional.
  const side = page.getByTestId("progress-side-lessons");
  await expect(side).toContainText("Sound side lessons are open: optional, whenever you like.");
  await expect(page.getByTestId("progress-side-lessons")).toContainText("never in the core map");
  await expect(page.getByTestId("progress-side-lessons")).not.toContainText(/of 4|left|remaining/);
  await expect(page.locator("main")).not.toContainText(/\bfailed\b|fell behind|you lost/i);
  await matrix(page, "w5-progress", open);
  expect(errors).toEqual([]);
});

test("progress after two side lessons: two taken in track A, the core map's count untouched", async ({
  page,
  request,
}) => {
  const errors = watch(page);
  await seed(request, "A1.L02 done");
  const progress = await api<{ mapDone: number; sideLessons?: { done: number; total: number } }>(
    request,
    "GET",
    "/api/lessons/progress",
  );
  expect(progress.sideLessons).toEqual({ done: 2, total: 4 });
  await useUiPrefs(page, { theme: "bark" });
  await page.goto("/progress");
  const side = page.getByTestId("progress-side-lessons");
  await expect(side).toContainText("Sound side lessons: 2 taken. The others stay optional.", {
    timeout: 30_000,
  });
  await expect(side).not.toContainText(/of 4|left|remaining/);
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, "w5-progress-side-2", "bark");
  expect(errors).toEqual([]);
});

test("progress on ladder L5: the folk-song rung and the blues rung ahead, from graded passes only", async ({
  page,
  request,
}) => {
  await seed(request, "ladder L5");
  await useUiPrefs(page, { theme: "paper" });
  await page.goto("/progress");
  const ladder = page.getByTestId("progress-ladder");
  await expect(ladder.locator('[data-rung="5"]')).toBeVisible({ timeout: 30_000 });
  await expect(ladder.locator('[data-rung="5"]')).toContainText("Folk songs");
  await expect(ladder.locator('[data-rung="6"]')).toContainText("Blues");
  await expect(ladder.locator('[data-rung="6"]')).toHaveAttribute("data-state", "ahead");
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, "w5-progress-l5", "paper");
});

/** The Wave 5 strands a learner through U11.L06 has met: bass (B), form (F), minor (S05–S08, H07–H09, E10),
 * pentatonic and blues (S09–S11, H10, C06, F04), each lit on the real map; and the sound branch (D02–D05). */
const W5_CORE = [
  "B01",
  "B02",
  "B03",
  "B04",
  "F01",
  "F02",
  "F03",
  "F04",
  "F05",
  "F06",
  "S05",
  "S06",
  "S07",
  "S08",
  "S09",
  "S10",
  "S11",
  "H07",
  "H08",
  "H09",
  "H10",
  "E10",
  "C06",
];
const W5_LEAVES = [...W5_CORE, "R13", "M08", "D02", "D03", "D04", "D05"];

test("the Oak through U11: the bass, form, minor and blues strands and the sound branch read as they light up", async ({
  page,
  request,
}) => {
  const errors = watch(page);
  await seed(request, "after U11.L06");
  const open = async (p: Page) => {
    await p.goto("/oak?view=tree");
    await expect(p.locator('[data-node="B01"]')).toBeVisible({ timeout: 30_000 });
    await p.locator('[data-node="H10"]').focus();
  };
  await useUiPrefs(page, { theme: "paper" });
  await open(page);
  // Every strand the course has taught by now is lit; the leaf's status is the server's map, read as it is.
  for (const id of W5_CORE)
    await expect(page.locator(`[data-node="${id}"]`), id).not.toHaveAttribute("data-status", "locked");
  // Every Wave 5 leaf has a readable face label inside its own box: none overlaps another leaf's label.
  const boxes = await page.evaluate((ids) => {
    return ids
      .map((id) => {
        const el = document.querySelector(`[data-node="${id}"]`);
        const r = el?.getBoundingClientRect();
        return r ? { id, x: r.x, y: r.y, w: r.width, h: r.height } : null;
      })
      .filter((b): b is { id: string; x: number; y: number; w: number; h: number } => b !== null);
  }, W5_LEAVES);
  expect(boxes.length).toBe(W5_LEAVES.length);
  for (const a of boxes)
    for (const b of boxes) {
      if (a.id >= b.id) continue;
      const overlap =
        a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  await matrix(page, "w5-oak-tree", open);
  // Keyboard: the 12-bar blues leaf opens its panel and says what it is in sound-first words.
  await useUiPrefs(page, { theme: "bark" });
  await open(page);
  await page.keyboard.press("Enter");
  const panel = page.getByTestId("oak-panel");
  await expect(panel).toContainText("Twelve bars of I, IV and V");
  await settle(page);
  await shoot(page, SHOTS, "w5-oak-panel-h10", "bark");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  // The sound branch (track A) has its own rows; its leaves are never the core's "what's next".
  await page.locator('[data-node="D03"]').focus();
  await page.keyboard.press("Enter");
  await expect(panel).toContainText("Removing high or low frequencies");
  await settle(page);
  await shoot(page, SHOTS, "w5-oak-panel-d03", "bark");
  await expect(page.getByTestId("whats-next")).not.toContainText("A1.");
  expect(errors).toEqual([]);
});

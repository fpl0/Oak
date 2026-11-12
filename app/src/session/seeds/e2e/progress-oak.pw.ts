// /progress and the Oak from seeds: milestones defined in content (two reached after C1, the next one named),
// honest ledger counts, Quiet mode on the real server (sing can-dos and voice leaves wait for the mic, never
// fail), the U03–U04 leaves from real progress on the 'after U03.L02', 'after U03.CP' and 'U04.CP due' seeds,
// and Revive / Revive more against the real server.
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { api, blockHmr, expectNoOverflow, matrix, SHOTS, seed, settle } from "./support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await blockHmr(page);
});

/** Quiet mode for today on the real server (`PUT /voice/quiet`, wave3.md §5.3). */
async function quietMode(request: APIRequestContext): Promise<void> {
  await api(request, "PUT", "/api/voice/quiet", { quiet: true, scope: "today" });
}

/** Keyboard: focus a leaf (the map pans to it) and open its panel with Enter. */
async function openLeaf(page: Page, id: string): Promise<void> {
  await page.locator(`[data-node="${id}"]`).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("oak-panel")).toBeVisible();
}

type Level = "new" | "available" | "learning" | "practiced" | "mastered";
const STATUS: Record<Level, string> = {
  new: "locked",
  available: "available",
  learning: "introduced",
  practiced: "practising",
  mastered: "mastered",
};
/** The U03 (scales, degrees, keys, ear and voice) and U04 (intervals) leaves. */
const U03_U04 = ["S01", "S02", "S03", "M01", "E03", "E04", "E06", "V02", "V03", "I01", "I02"];

/** Every U03–U04 leaf on the tree is drawn at the level the server holds for it (real progress, no reshaping). */
async function leavesMatchServer(page: Page, request: APIRequestContext): Promise<Record<string, Level>> {
  const map = await api<{ nodes: { skillId: string; level: Level }[] }>(request, "GET", "/api/skills/map");
  const levels: Record<string, Level> = {};
  for (const n of map.nodes) if (U03_U04.includes(n.skillId)) levels[n.skillId] = n.level;
  for (const id of U03_U04) {
    const level = levels[id] ?? "new";
    await expect(page.locator(`[data-node="${id}"]`), id).toHaveAttribute("data-status", STATUS[level]);
  }
  return levels;
}

test("progress: milestones from content, honest ledger counts, sing can-dos wait for the mic in Quiet mode", async ({
  page,
  request,
}) => {
  await seed(request, "C1 released");
  const report = await api<{ milestones: { id: string; reachedAt: string | null }[] }>(
    request,
    "GET",
    "/api/progress",
  );
  expect(report.milestones.filter((m) => m.reachedAt).map((m) => m.id)).toEqual(["ms.01", "ms.02"]);
  await quietMode(request);
  const open = async (p: Page) => {
    await p.goto("/progress");
    await expect(p.getByTestId("progress-milestones").locator('[data-state="reached"]')).toHaveCount(2);
  };
  await useUiPrefs(page, { theme: "paper" });
  await open(page);
  const ms = page.getByTestId("progress-milestones");
  await expect(ms.locator('[data-milestone="ms.01"]')).toContainText("You can make a beat.");
  await expect(ms.locator('[data-milestone="ms.02"]')).toContainText("a bass line");
  await expect(ms.locator('[data-state="next"]')).toContainText("You can now compose a song.");
  await expect(ms.locator('[data-state="next"]')).toContainText("Chords that loop");
  await expect(ms).toContainText("Later (6)");
  // Counts are what the ledger holds: "n of N shown · k solid or strong".
  await expect(page.getByTestId("ledger-code-counts")).toHaveText(
    /^\d+ of \d+ shown( · \d+ solid or strong)?$/,
  );
  await expect(page.getByTestId("ledger-sing-quiet")).toContainText("Nothing else does.");
  await expect(page.getByTestId("ledger-sing")).toContainText("waits for the mic");
  await expect(page.locator("main")).not.toContainText(/failed|behind|lost/i);
  await matrix(page, "progress", open);
});

test("the Oak from real progress: U03's leaves after U03.L02; voice leaves wait for the mic in Quiet mode; Revive", async ({
  page,
  request,
}) => {
  await seed(request, "after U03.L02");
  await quietMode(request);
  const open = async (p: Page) => {
    await p.goto("/oak?view=tree");
    await expect(p.locator('[data-node="S02"]')).toBeVisible();
    // The keys-and-scales strand at reading size, where U03 sits.
    await p.locator('[data-node="S02"]').focus();
  };
  await useUiPrefs(page, { theme: "paper" });
  await open(page);
  const levels = await leavesMatchServer(page, request);
  // U03.L02 grew the degree leaf; U04's intervals are not open yet.
  expect(levels.S02).not.toBe("new");
  await expect(page.locator('[data-node="I01"]')).toHaveAttribute("data-status", "locked");
  await expect(page.locator('[data-node="V02"]')).toHaveAttribute("aria-label", /waiting for the mic/);
  await expect(page.locator('[data-node="V02"]')).not.toHaveAttribute("aria-label", /today's warm-up/);
  await expect(page.getByTestId("legend-quiet")).toBeVisible();
  await matrix(page, "oak-after-u03-l02", open);

  // Keyboard: Enter on the focused leaf opens its panel.
  await open(page);
  await page.keyboard.press("Enter");
  const panel = page.getByTestId("oak-panel");
  await expect(panel).toContainText("Scale degrees");
  await expect(panel).toContainText("U03.L02");
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, "oak-panel-s02", "paper");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // A voice leaf in Quiet mode: waiting, nothing to fix, no Revive.
  await openLeaf(page, "V02");
  await expect(panel.getByTestId("waiting-mic")).toContainText("Waiting for the mic.");
  await expect(panel.getByTestId("waiting-mic")).toContainText("nothing is lost");
  await expect(panel.getByTestId("revive")).toHaveCount(0);
  await expect(panel.getByTestId("voice-settings")).toHaveAttribute("href", "/settings/voice");
  await settle(page);
  await shoot(page, SHOTS, "oak-panel-quiet", "paper");
  await useUiPrefs(page, { theme: "bark" });
  await page.reload();
  await openLeaf(page, "V02");
  await expect(panel.getByTestId("waiting-mic")).toBeVisible();
  await settle(page);
  await shoot(page, SHOTS, "oak-panel-quiet", "bark");

  // A leaf in today's warm-up offers Revive; one that is not, Revive more or "tomorrow picks it up".
  await useUiPrefs(page, { theme: "paper" });
  await openLeaf(page, "E04");
  await expect(
    panel.getByTestId("revive").or(panel.getByTestId("revive-more")).or(panel.getByTestId("revive-none")),
  ).toBeVisible();
});

test("the Oak from real progress after U03.CP and on U04.CP's day: the leaves the server holds, never more", async ({
  page,
  request,
}) => {
  await useUiPrefs(page, { theme: "paper" });
  for (const point of ["after U03.CP", "U04.CP due"] as const) {
    await seed(request, point);
    await page.goto("/oak?view=tree");
    await expect(page.locator('[data-node="S02"]')).toBeVisible();
    const levels = await leavesMatchServer(page, request);
    if (point === "after U03.CP") {
      for (const id of ["S01", "S02", "S03", "V03"]) expect(levels[id], id).not.toBe("new");
    } else {
      // Every U04 lesson is done: the interval leaves are grown, and the next item is the checkpoint.
      for (const id of ["I01", "I02"]) expect(["practiced", "mastered", "learning"]).toContain(levels[id]);
      await expect(page.getByTestId("whats-next")).toContainText("U04.CP");
    }
    await page.locator('[data-node="I01"]').focus();
    await settle(page);
    await expectNoOverflow(page);
    await shoot(page, SHOTS, `oak-${point.replace(/\W+/g, "-").toLowerCase()}`, "paper");
    // The course view lists U03 and U04 by real lesson status.
    await page.goto("/oak?view=course");
    await expect(page.getByRole("heading", { name: /U04/ })).toContainText(
      point === "U04.CP due" ? "4 of 4 done" : "1 of 4 done",
    );
  }
});

test("Revive on the real server: today's planned sets of drying leaves, inside the budget", async ({
  page,
  request,
}) => {
  await seed(request, "after U02.L05", { gapDays: 6 });
  const batch = await api<{ items: unknown[]; plannedSec: number; budgetSec: number }>(
    request,
    "GET",
    "/api/skills/revive",
  );
  expect(batch.plannedSec).toBeLessThanOrEqual(batch.budgetSec);
  await useUiPrefs(page, { theme: "paper" });
  await page.goto("/session/revive");
  if (batch.items.length > 0) {
    await expect(page.getByRole("heading", { name: /^Revive/ })).toContainText(
      `≈ ${Math.max(1, Math.round(batch.plannedSec / 60))} min`,
    );
  } else {
    await expect(page.getByText("Nothing to revive right now")).toBeVisible();
  }
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, "revive-real", "paper");
  await page.goto("/session/revive?more=true");
  await expect(
    page.getByRole("heading", { name: /Revive more/ }).or(page.getByText("Nothing more to revive today")),
  ).toBeVisible();
});

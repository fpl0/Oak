// /progress and the Oak after C2 and X1, from a dev seed against the real server: the milestone C2 makes with its
// album track, the transcription ladder's claims ("You can now transcribe a bass line.") counted from graded passes
// only, the U05–U07 can-dos in view as the course reaches them (later ones folded away), Quiet mode; and the Oak's
// chord, harmony and melody strands drawn at the server's levels, with drill families named honestly.
import { expect, type Page, test } from "@playwright/test";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { api, blockHmr, expectNoOverflow, matrix, SHOTS, seed, settle } from "./support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await blockHmr(page);
});

type Level = "new" | "available" | "learning" | "practiced" | "mastered";
const STATUS: Record<Level, string> = {
  new: "locked",
  available: "available",
  learning: "introduced",
  practiced: "practising",
  mastered: "mastered",
};
/** Leaves U05–U07 introduce: chords (C), harmony (H), melody (M), ears (E). */
const W4 = [
  "C01",
  "C02",
  "C03",
  "C04",
  "C05",
  "H01",
  "H02",
  "H03",
  "H04",
  "H06",
  "M02",
  "M03",
  "M10",
  "E08",
  "E09",
];

test("progress after C2 and X1: the album milestone, the ladder's graded passes, the U05–U07 can-dos", async ({
  page,
  request,
}) => {
  await seed(request, "X1 released");
  // The real ladder: three graded L1 passes from GYM.01–03 (the third at R1), no level-up yet.
  expect(await api(request, "GET", "/api/ladder")).toMatchObject({
    level: 1,
    realism: 1,
    gradedPasses: { "1": 3 },
  });
  await api(request, "PUT", "/api/voice/quiet", { quiet: true, scope: "today" });
  const open = async (p: Page) => {
    await p.goto("/progress");
    await expect(p.getByTestId("progress-milestones").locator('[data-milestone="ms.03"]')).toHaveAttribute(
      "data-state",
      "reached",
      { timeout: 30_000 },
    );
    await expect(p.getByTestId("progress-ladder")).toBeVisible();
  };
  await useUiPrefs(page, { theme: "paper" });
  await open(page);
  const ms3 = page.getByTestId("progress-milestones").locator('[data-milestone="ms.03"]');
  await expect(ms3).toContainText("You can now compose a song.");
  await expect(ms3.getByRole("link", { name: /On your album: Four-Chord Song/ })).toHaveAttribute(
    "href",
    /\/album\/trk_/,
  );
  const ladder = page.getByTestId("progress-ladder");
  await expect(ladder).toContainText("Level 1 at R1");
  await expect(ladder.locator('[data-rung="1"]')).toContainText("You can transcribe a drum loop.");
  await expect(ladder.locator('[data-rung="1"]').getByTestId("graded-pass-flag")).toBeVisible();
  await expect(ladder.locator('[data-rung="2"]').getByTestId("graded-pass-flag")).toHaveCount(0);
  await expect(ladder.locator('[data-rung="3"]')).toHaveAttribute("data-state", "ahead");
  await expect(ladder).toContainText("Only a graded pass counts");
  // The can-dos the course has reached are in view; later ones wait under "Later in the course".
  const compose = page.getByTestId("ledger-compose");
  await expect(compose.locator('[data-cando="cd.compose.fourchord"]')).toBeVisible();
  await expect(compose.locator('[data-cando="cd.compose.chord-tones"]')).toBeVisible();
  await expect(page.getByTestId("ledger-compose-later")).toContainText("Later in the course");
  await expect(
    page.getByTestId("ledger-transcribe").locator('[data-cando="cd.transcribe.folk-tune"]'),
  ).toBeVisible();
  await expect(page.getByTestId("ledger-read").locator('[data-cando="cd.read.chord-symbols"]')).toBeVisible();
  // Quiet mode: the sing can-dos wait for the mic; nothing reads as a failure.
  await expect(page.getByTestId("ledger-sing-quiet")).toContainText("Nothing else does.");
  // (ms.05's own copy says "the minor unit behind you": no loss framing is a phrase, not that word.)
  await expect(page.locator("main")).not.toContainText(/\bfailed\b|fell behind|you lost|you'll lose/i);
  await matrix(page, "w4-progress", open);
});

test("the Oak after X1: the chord, harmony and melody strands at the server's levels; families named honestly", async ({
  page,
  request,
}) => {
  await seed(request, "X1 released");
  const map = await api<{ nodes: { skillId: string; level: Level }[] }>(request, "GET", "/api/skills/map");
  const levels = new Map(map.nodes.map((n) => [n.skillId, n.level]));
  const open = async (p: Page) => {
    await p.goto("/oak?view=tree");
    await expect(p.locator('[data-node="H04"]')).toBeVisible({ timeout: 30_000 });
    await p.locator('[data-node="H04"]').focus();
  };
  await useUiPrefs(page, { theme: "paper" });
  await open(page);
  for (const id of W4)
    await expect(page.locator(`[data-node="${id}"]`), id).toHaveAttribute(
      "data-status",
      STATUS[levels.get(id) ?? "new"],
    );
  // The seeded course reached U07: its leaves are lit, not locked.
  expect(W4.filter((id) => (levels.get(id) ?? "new") !== "new").length).toBeGreaterThan(8);
  await matrix(page, "w4-oak-tree", open);

  // Keyboard: Enter opens the panel; its drill families say where each one is, honestly.
  await useUiPrefs(page, { theme: "paper" });
  await open(page);
  await page.keyboard.press("Enter");
  const panel = page.getByTestId("oak-panel");
  await expect(panel).toContainText("Four-chord");
  const fams = panel.locator("[data-family]");
  expect(await fams.count()).toBeGreaterThan(0);
  for (const s of await fams.evaluateAll((els) => els.map((e) => e.getAttribute("data-family-status"))))
    expect(["mixed", "resting", "graduated", "active", "queued", "locked", "not-yet"]).toContain(s);
  await expect(panel).not.toContainText(/mastered in mixed|failed/i);
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, "w4-oak-panel-h04", "paper");
  await useUiPrefs(page, { theme: "bark" });
  await open(page);
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await settle(page);
  await shoot(page, SHOTS, "w4-oak-panel-h04", "bark");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  // What's next past X1: the unwritten lesson, named and never opened.
  await expect(page.getByTestId("whats-next")).toContainText("still being written");
});

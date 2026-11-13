// Wave 5 integration on the capstone stack (5210/8810, the scripted fake tutor), each test from a seed:
// - C3.S3 from "C3.S2 done": the tutor panel beside the workspace. A chat answer that names the sections streams
//   section chips; a chip selects that section in the capstone's form strip and loops it in the Workbench (the
//   ribbon's loop, the strip's mark), by mouse and by keyboard. The review asked from the Brief arrives as a card
//   naming the draft version it read (c11); a second request that fails before reaching the server clears the
//   Brief's "pending" at once (c9), and the panel's own "Request review" follows the Brief.
// - c3 (decision 46): the same C3 draft open in two tabs keeps both saves, and the second tab is told.
// Screenshots: both themes at 1440×900 and 1280×800 (the chips beside the form strip).
import { expect, type Page, test } from "@playwright/test";
import { PREFS_KEY, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { C3_FULL } from "./w5-pieces.ts";
import { api, editor, seedFirst, setCode, shots, watchErrors } from "./w5-support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

const panel = (page: Page) => page.getByTestId("tutor-chat");
const lastMessage = (page: Page) => panel(page).getByTestId("tutor-message").last();
const waitDone = (page: Page) =>
  expect(lastMessage(page)).toHaveAttribute("data-status", /done|error/, { timeout: 45_000 });

async function tutorOpen(page: Page) {
  await page.addInitScript((key) => {
    const cur = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...cur, tutorOpen: true }));
  }, PREFS_KEY);
}

async function openC3(page: Page) {
  await page.goto("/capstone/C3");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await editor(page, "C3");
  await expect(page.locator('[data-session="C3.S3"]')).toHaveAttribute("aria-current", "step");
}

test("C3: section chips from the tutor select sections in the form strip; the review names its version; c9 on the Brief", async ({
  page,
}) => {
  test.setTimeout(220_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["C3.S2 done"]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await tutorOpen(page);
  await openC3(page);
  await setCode(page, "C3", C3_FULL);
  const strip = page.getByTestId("form-strip");
  await expect(strip.getByTestId("form-letters")).toHaveText("A B A B", { timeout: 60_000 });
  await expect(page.getByTestId("tutor-status")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });

  // A streamed answer that names the sections: "the verse" and "the chorus" are chips.
  const box = panel(page).getByTestId("composer");
  await box.fill("Does my chorus lift above the verse? #sections");
  await box.press("Enter");
  await waitDone(page);
  const chorusChip = lastMessage(page).locator('[data-token="section"][data-section="chorus"]').first();
  const verseChip = lastMessage(page).locator('[data-token="section"][data-section="verse"]').first();
  await expect(chorusChip).toBeVisible();
  await expect(verseChip).toBeVisible();
  // A click selects the chorus: the strip marks it and the Workbench loops exactly its bars (9–16).
  await chorusChip.click();
  const stripChorus = strip.locator('[data-section="chorus"]').first();
  await expect(stripChorus).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  await expect(strip.locator('[data-section="verse"]').first()).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Loop bars 9–16" })).toHaveAttribute("aria-pressed", "true");
  // By keyboard: the verse chip, Enter.
  await verseChip.focus();
  await page.keyboard.press("Enter");
  await expect(strip.locator('[data-section="verse"]').first()).toHaveAttribute("aria-pressed", "true", {
    timeout: 15_000,
  });
  await expect(stripChorus).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Loop bars 1–8" })).toHaveAttribute("aria-pressed", "true");
  // The strip's own click reads the same loop back.
  await stripChorus.click();
  await expect(stripChorus).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  await chorusChip.scrollIntoViewIfNeeded();
  await shots(page, "w5i-c3-section-chips");

  // The review, asked from the Brief once the piece is checked: a card naming the version it read.
  await page.getByTestId("check-track").click();
  await expect(page.getByTestId("req-count")).toHaveText(/^(\d+) of \1 met$/, { timeout: 60_000 });
  const request = page.getByTestId("request-review");
  await expect(request).toBeEnabled({ timeout: 30_000 });
  await request.click();
  const review = page.getByTestId("review-summary");
  await expect(review).toBeVisible({ timeout: 60_000 });
  await expect(review.getByTestId("review-heading")).toHaveText(/^Review of version \d+$/);
  // C3 asks for one revision (contracts §10.6: two from C5 on).
  await expect(review.locator("[data-revision]")).toHaveCount(1);
  await expect(page.getByTestId("review-wait")).toHaveCount(0);
  await expect(request).toHaveText("Ask for a new review");

  // c9: a request that never reaches the server is not left "pending" on the Brief.
  await page.route("**/api/tutor/reviews/capstone", (route) => route.abort("connectionrefused"));
  const started = Date.now();
  await request.click();
  await expect(page.getByTestId("review-wait")).toHaveAttribute("data-state", "failed", { timeout: 20_000 });
  expect(Date.now() - started).toBeLessThan(20_000);
  await expect(request).toBeEnabled();
  await expect(request).toHaveText("Ask for a new review");
  // The panel's own action follows the same state: not pending, ready to ask again.
  const panelReview = panel(page).getByTestId("quick-actions").locator('[data-action="review"]');
  if (await panelReview.count()) await expect(panelReview).toBeEnabled();
  await page.unroute("**/api/tutor/reviews/capstone");
  // Strudel's one error per failed evaluation is allowed; the aborted request logs a failed fetch.
  expect(errors.filter((e) => !/Failed to fetch|ERR_CONNECTION_REFUSED|net::/.test(e))).toEqual([]);
});

test("c3: one C3 draft in two tabs keeps both saves and tells the second tab", async ({ page, context }) => {
  test.setTimeout(200_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["C3.S2 done"]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await openC3(page);
  const other = await context.newPage();
  await other.routeWebSocket(/.*/, () => {});
  await openC3(other);
  const state = await api<{ sketchId: string }>(page, "GET", "/capstones/C3");
  const before = await api<{ versions: { version: number }[] }>(page, "GET", `/sketches/${state.sketchId}`);
  const n0 = before.versions.length;

  // The first tab saves its edit.
  await setCode(page, "C3", C3_FULL.replace('hats: s("hh*8").gain(.4)', 'hats: s("hh*8").gain(.42)'));
  await expect(page.getByTestId("saved-state")).toContainText(`Version ${n0 + 1} saved`, { timeout: 60_000 });
  // The second tab, still on the older version, saves its own: both are kept, and it is told.
  await setCode(other, "C3", C3_FULL.replace('hats: s("hh*8").gain(.4)', 'hats: s("hh*8").gain(.38)'));
  await expect(other.getByText("This draft was also saved in another tab")).toBeVisible({ timeout: 60_000 });
  await expect(other.getByTestId("saved-state")).toContainText(`Version ${n0 + 2} saved`);
  const after = await api<{ versions: { version: number; code: string }[] }>(
    page,
    "GET",
    `/sketches/${state.sketchId}`,
  );
  expect(after.versions.length).toBe(n0 + 2);
  expect(after.versions.some((v) => v.code.includes(".gain(.42)"))).toBe(true);
  expect(after.versions.some((v) => v.code.includes(".gain(.38)"))).toBe(true);
  // The first tab is not told about its own save.
  await expect(page.getByText("This draft was also saved in another tab")).toHaveCount(0);
  await other.close();
  expect(errors).toEqual([]);
});

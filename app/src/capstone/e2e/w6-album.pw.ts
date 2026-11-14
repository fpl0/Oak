// The finished record, takes and C3 in four sessions, on the capstone stack (5210/8810), from seeds:
// - "core complete": `/album` is the record. Side A's twelve covers in running order with the single last, the
//   side's length, "Play Side A" played through (each track is moved to its end and the record goes on after its
//   breath, in order, to the single, then stops), Space stops it, the arrow keys move between covers, Enter on a cover plays from
//   there, and every recording downloads as one archive. Reduced motion on; both themes at both sizes.
// - "two takes (d20)": a version with two recordings lists both, the newer one playing on the album; the older
//   one is heard, chosen and plays by default; a new take is added and nothing is replaced.
// - "C3.S3 in progress (d13)": C3 has four sessions; the third shows the lead sheet and finishes without a take;
//   the fourth is the take and the release.
// The running order, the running time, the file names and the archive are unit-tested (album/wave6.test.ts).
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { seedTake } from "./seeded-take.ts";
import { api, editor, seedFirst, shots, watchErrors } from "./w5-support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

const ORDER = ["C0", "C1", "C2", "X1", "C3", "C4", "C5", "X2", "C6", "C7", "CF-T", "CF-A"];

test("the finished record from “core complete”: twelve covers in order, Play Side A moves on, keyboard, one archive", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["core complete"]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/album");
  const record = page.getByTestId("side-a-record");
  await expect(page.getByTestId("album-finished")).toBeVisible({ timeout: 60_000 });
  await expect(record.getByTestId("side-a-title")).toHaveText(/^12 tracks · \d+:\d\d$/, {
    timeout: 60_000,
  });
  // Twelve covers in running order, the single last; the tracklist below is numbered the same way.
  expect(
    await record.locator("[data-cover]").evaluateAll((els) => els.map((e) => e.getAttribute("data-cover"))),
  ).toEqual(ORDER);
  await expect(record.locator('[data-cover][data-state="ready"]')).toHaveCount(12);
  const album = await api<{ tracks: { id: string; capstoneId: string | null; title: string }[] }>(
    page,
    "GET",
    "/album",
  );
  const single = album.tracks.find((t) => t.capstoneId === "CF-A");
  await expect(page.locator('section[data-side="A"] ol > li').last()).toHaveAttribute(
    "data-track",
    single?.id ?? "none",
  );
  // Rings grow from the music: wait for the covers before the pictures.
  await expect(record.locator("svg[data-cover-rings]")).toHaveCount(12, { timeout: 60_000 });
  await shots(page, "album-finished");

  // Play Side A: track 1 is outlined and named; at its end the record breathes and goes on to track 2.
  await record.getByTestId("play-side-a").click();
  await expect(record).toHaveAttribute("data-state", "playing");
  await expect(record.getByTestId("now-playing")).toHaveText(/^1 of 12 · /);
  await expect(record.locator('[data-cover="C0"]')).toHaveAttribute("data-state", "playing");
  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLAudioElement>('[data-testid="side-a-player"]');
    return !!el && Number.isFinite(el.duration) && el.duration > 0 && !el.paused;
  });
  await page.evaluate(() => {
    const el = document.querySelector<HTMLAudioElement>('[data-testid="side-a-player"]');
    if (el) el.currentTime = Math.max(0, el.duration - 0.3);
  });
  await expect(record.getByTestId("now-playing")).toHaveText(/^2 of 12 · /, { timeout: 15_000 });
  await expect(record.locator('[data-cover="C1"]')).toHaveAttribute("data-state", "playing");
  await shots(page, "album-playing");

  // Played through: each track runs to its end and the record goes on, in order, to the single; after it, it stops.
  const toEnd = () =>
    page.evaluate(() => {
      const el = document.querySelector<HTMLAudioElement>('[data-testid="side-a-player"]');
      if (el && Number.isFinite(el.duration)) el.currentTime = Math.max(0, el.duration - 0.2);
    });
  for (let no = 3; no <= 12; no++) {
    await page.waitForFunction(() => {
      const el = document.querySelector<HTMLAudioElement>('[data-testid="side-a-player"]');
      return !!el && Number.isFinite(el.duration) && el.duration > 0 && !el.paused;
    });
    await toEnd();
    await expect(record.getByTestId("now-playing")).toHaveText(new RegExp(`^${no} of 12 · `), {
      timeout: 15_000,
    });
    await expect(record.locator(`[data-cover="${ORDER[no - 1]}"]`)).toHaveAttribute("data-state", "playing");
  }
  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLAudioElement>('[data-testid="side-a-player"]');
    return !!el && Number.isFinite(el.duration) && el.duration > 0 && !el.paused;
  });
  await toEnd();
  await expect(record).toHaveAttribute("data-state", "stopped", { timeout: 15_000 });

  // Keyboard: Right moves to the next cover, Space plays the record from the top and stops it, Enter on a cover
  // plays from that track on.
  const cover = (id: string) => record.locator(`[data-cover="${id}"] button`);
  await cover("C1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(cover("C2")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(record.getByTestId("now-playing")).toHaveText(/^1 of 12 · /);
  await page.keyboard.press("Space");
  await expect(record).toHaveAttribute("data-state", "stopped");
  await page.keyboard.press("End");
  await cover("CF-A").focus();
  await page.keyboard.press("Enter");
  await expect(record.getByTestId("now-playing")).toHaveText(/^12 of 12 · /, { timeout: 15_000 });
  await record.getByTestId("play-side-a").click();
  await expect(record).toHaveAttribute("data-state", "stopped");

  // Every recording in one archive.
  const download = page.waitForEvent("download");
  await record.getByTestId("download-side-a").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/-side-a\.zip$/);
  const path = await file.path();
  const { statSync } = await import("node:fs");
  expect(statSync(path).size).toBeGreaterThan(12 * 44);
  // Nothing on the page celebrates on the learner's behalf.
  const text = ((await page.locator("#main").textContent()) ?? "").toLowerCase();
  expect(text).not.toContain("!");
  expect(text).not.toContain("congratulations");
  expect(errors).toEqual([]);
});

test("takes from “two takes (d20)”: both recordings are kept; the older one is heard and chosen; a third is added", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["two takes (d20)"]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const album = await api<{ tracks: { id: string; capstoneId: string | null }[] }>(page, "GET", "/album");
  const c3 = album.tracks.find((t) => t.capstoneId === "C3");
  if (!c3) throw new Error("the seed has no C3 track");
  await page.goto(`/album/${c3.id}`);
  const takes = page.getByTestId("takes");
  await expect(takes.locator("[data-take]")).toHaveCount(2, { timeout: 60_000 });
  await expect(takes.locator('[data-take="2"]')).toHaveAttribute("data-current", "true");
  await expect(takes.locator('[data-take="2"]')).toContainText("plays on the album");
  await expect(page.getByTestId("track-audio")).toHaveAttribute("data-take", "2");
  await shots(page, "track-takes");

  // The older take: heard in place, then chosen. It now plays by default; the newer one stays in the list.
  await takes.locator('[data-take="1"]').getByTestId("hear-take").click();
  await expect(page.getByTestId("track-audio")).toHaveAttribute("data-take", "1");
  await expect(page.getByTestId("track-audio")).toHaveAttribute("src", /take=1/);
  await takes.locator('[data-take="1"]').getByTestId("use-take").click();
  await expect(takes.locator('[data-take="1"]')).toHaveAttribute("data-current", "true", { timeout: 30_000 });
  await expect(takes.locator("[data-take]")).toHaveCount(2);
  type Version = { version: number; currentTake?: number | null; takes?: unknown[] };
  const after = await api<{ currentVersion: number; versions: Version[] }>(
    page,
    "GET",
    `/album/tracks/${c3.id}`,
  );
  expect(after.versions.find((v) => v.version === after.currentVersion)?.currentTake).toBe(1);

  // Another take: added, never replacing. No confirmation is asked, because nothing is lost.
  await page.getByRole("button", { name: "Play it live" }).click();
  const again = page.getByTestId("record-version");
  await expect(again).toHaveText("Record another take", { timeout: 60_000 });
  await expect(again).toBeEnabled({ timeout: 60_000 });
  await seedTake(page);
  await again.click();
  await expect(takes.locator("[data-take]")).toHaveCount(3, { timeout: 60_000 });
  await expect(takes.locator('[data-take="3"]')).toHaveAttribute("data-current", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("C3 from “C3.S3 in progress (d13)”: four sessions; the third has the lead sheet and ends without a take", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["C3.S3 in progress (d13)", "C3.S2 done"]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/C3");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await editor(page, "C3");
  const plan = page.getByTestId("session-plan");
  await expect(plan.locator("[data-session]")).toHaveCount(4);
  await expect(plan.locator('[data-session="C3.S3"]')).toHaveAttribute("aria-current", "step");
  await expect(plan.locator('[data-session="C3.S1"]')).toHaveAttribute("data-status", "done");
  await expect(plan.locator('[data-session="C3.S2"]')).toHaveAttribute("data-status", "done");
  // Session 3 is arranging and the lead sheet: the sheet is on the page; there is no release here.
  await expect(page.getByTestId("lead-sheet")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("release")).toHaveCount(0);
  await expect(page.getByTestId("finish-session")).toHaveText("Finish session 3 of 4");
  await shots(page, "c3-s3-of-4");
  await page.getByTestId("finish-session").click();
  await expect(page.getByRole("status").filter({ hasText: "Session 3 of 4 done." })).toBeVisible({
    timeout: 30_000,
  });
  // Session 4: the take, the review and the release; the draft and the lead sheet are still there.
  await expect(plan.locator('[data-session="C3.S4"]')).toHaveAttribute("aria-current", "step", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("release")).toBeVisible();
  await expect(page.getByTestId("finish-session")).toHaveCount(0);
  await expect(page.getByTestId("lead-sheet")).toBeVisible();
  expect(errors).toEqual([]);
});

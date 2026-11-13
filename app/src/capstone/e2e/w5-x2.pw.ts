// X2 "Blues Transcription" on the capstone stack (5210/8810, the fake tutor), from seeds. It needs X2's songs
// (author:repertoire: St. Louis Blues, Careless Love) and its checks (author:capstones); until both exist the tests
// skip and say which is missing. The logic is covered by wave5.test.ts on a made-up strain.
// - S1 from "X2 open" in Quiet mode: the song chosen, the givens with the swing feel; only the bass is open, the
//   changes "Open after the bass"; the bass passes at 0.90; the changes open with the chart, written from the
//   chart into the code, and pass; the session finishes;
// - S2 from "X2.S1 done": the melody lines open after the changes; each passes; the review names the version it
//   was asked about and has two revisions; release with the liner notes naming the song.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { capstoneDef, editor, seedFirst, setCode, shots, watchErrors } from "./w5-support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

const X2 = capstoneDef("X2");
const checks = X2.sessionDefs.flatMap((s) => s.checks ?? []);
const BASS = checks.find((c) => c.layer === "bass")?.id ?? "bass";
const CHANGES = checks.find((c) => c.layer === "chords")?.id ?? "changes";

type Song = { title: string; bpm: number; answerKey: { layers: Record<string, string> } };
async function firstSong(): Promise<{ slug: string; song: Song } | null> {
  for (const id of X2.song ?? []) {
    const slug = String(id).replace(/^song\./, "");
    try {
      const mod = (await import(`../../../../content/repertoire/${slug}/song.ts`)) as { default?: Song };
      if (mod.default?.answerKey.layers.bass && mod.default.answerKey.layers.chords)
        return { slug, song: mod.default };
    } catch {
      // not written yet
    }
  }
  return null;
}

test("X2 session 1 from “X2 open” in Quiet mode: bass first, then the changes from the chart", async ({
  page,
}) => {
  test.setTimeout(230_000);
  const found = await firstSong();
  test.skip(
    !found || checks.length === 0,
    "X2's songs (author:repertoire) or checks (author:capstones) are not written yet",
  );
  const { song } = found as NonNullable<typeof found>;
  const errors = watchErrors(page);
  await seedFirst(page, ["X2 open", "C5 released"], false);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/X2");
  await expect(page.getByRole("heading", { level: 1, name: "X2 Blues Transcription" })).toBeVisible({
    timeout: 60_000,
  });
  const songs = page.getByRole("radiogroup", { name: "The song" });
  await songs.getByRole("radio", { name: song.title }).click();
  await page.getByRole("button", { name: /^Start session 1 of 2$/ }).click();
  await expect(page.getByTestId("capstone-workspace")).toHaveAttribute("data-kind", "transcribe", {
    timeout: 60_000,
  });
  await expect(page.getByTestId("x1-given")).toContainText("Swing");
  await expect(page.getByTestId("song-source")).toBeVisible({ timeout: 60_000 });
  // c12: the song's transport is the kit's TransportBar (X1 and X2 share it), its play button and rate slider.
  const transport = page.getByTestId("song-source").locator("[data-transport]");
  await expect(transport).toBeVisible();
  await expect(transport.getByTestId("transport-play")).toBeVisible();
  await expect(transport.getByTestId("transport-rate")).toBeVisible();
  await editor(page, "X2");
  const bass = page.locator(`[data-check="${BASS}"]`);
  const changes = page.locator(`[data-check="${CHANGES}"]`);
  await expect(bass).toHaveAttribute("data-state", "new");
  await expect(changes).toHaveAttribute("data-state", "locked");
  await expect(changes).toContainText("Opens after the bass.");
  await shots(page, "x2-s1");

  const l = song.answerKey.layers;
  await setCode(page, "X2", `setcpm(${song.bpm}/4)\n\nbass: ${l.bass}`);
  await bass.getByTestId("check-phrase").click();
  await expect(bass).toHaveAttribute("data-state", "passed", { timeout: 60_000 });
  await expect(changes).not.toHaveAttribute("data-state", "locked");
  await expect(page.getByTestId("x2-changes")).toBeVisible();
  await setCode(page, "X2", `setcpm(${song.bpm}/4)\n\nbass: ${l.bass}\nchords: ${l.chords}`);
  await changes.getByTestId("check-phrase").click();
  await expect(changes).toHaveAttribute("data-state", "passed", { timeout: 60_000 });
  await shots(page, "x2-s1-changes");
  await page.getByTestId("finish-session").click();
  await expect(page.getByRole("status").filter({ hasText: "Session 1 of 2 done." })).toBeVisible({
    timeout: 30_000,
  });
  expect(errors).toEqual([]);
});

test("X2 session 2 from “X2.S1 done”: the melody line by line, a review of a named version, release", async ({
  page,
}) => {
  test.setTimeout(230_000);
  const found = await firstSong();
  test.skip(
    !found || checks.length === 0,
    "X2's songs (author:repertoire) or checks (author:capstones) are not written yet",
  );
  const { song } = found as NonNullable<typeof found>;
  const errors = watchErrors(page);
  await seedFirst(page, ["X2.S1 done", "after X2.S1"]);
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  await page.goto("/capstone/X2");
  await expect(page.getByTestId("capstone-workspace")).toHaveAttribute("data-kind", "transcribe", {
    timeout: 60_000,
  });
  await editor(page, "X2");
  await expect(page.locator('[data-session="X2.S2"]')).toHaveAttribute("aria-current", "step");
  const l = song.answerKey.layers;
  await setCode(
    page,
    "X2",
    `setcpm(${song.bpm}/4)\n\nbass: ${l.bass}\nchords: ${l.chords}\nmelody: ${l.melody}.s("piano")`,
  );
  const rows = page.getByTestId("x1-checks").locator("[data-check]");
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    await row.getByTestId("check-phrase").click();
    await expect(row).toHaveAttribute("data-state", "passed", { timeout: 60_000 });
  }
  await page.getByTestId("request-review").click();
  const review = page.getByTestId("review-summary");
  await expect(review).toBeVisible({ timeout: 60_000 });
  await expect(review.getByTestId("review-heading")).toHaveText(/^Review of version \d+$/);
  await expect(review.locator("[data-revision]")).toHaveCount(2);
  await shots(page, "x2-s2");
  const release = page.getByTestId("release");
  await expect(release).toBeEnabled();
  await release.click();
  const dialog = page.getByRole("dialog", { name: /Release/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByTestId("release-liner")).toContainText(song.title);
  await dialog.getByTestId("record-take").click();
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: 120_000 });
  await dialog.getByTestId("confirm-release").click();
  await expect(page.getByTestId("release-ceremony")).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

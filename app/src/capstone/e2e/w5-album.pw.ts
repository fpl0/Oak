// The album after the Wave 5 capstones (capstone stack 5210/8810), from a seed: "X2 released" (eight tracks: C0, C1,
// C2, X1, C3, C4, C5, X2) or, until X2's songs exist, "C5 released" (seven, with X2's slot saying what opens it).
// Side A in course order; every cover grown from its own music and distinct from the others; the long pieces (C3's
// 96 seconds) play in place and download; re-recording a version asks first and replaces the take only once
// confirmed (c11). Screenshots in both themes at both sizes.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { seedTake } from "./seeded-take.ts";
import { api, seedFirst, shots, watchErrors } from "./w5-support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

const ORDER = ["C0", "C1", "C2", "X1", "C3", "C4", "C5", "X2"];

interface Album {
  tracks: { id: string; capstoneId: string | null; title: string; trackNo: number; side: string }[];
}
interface TrackDetail {
  id: string;
  title: string;
  versions: { version: number; hasAudio: boolean; durationS: number | null }[];
}

test("the album with the Wave 5 tracks: course order, distinct covers, long pieces play and download", async ({
  page,
}) => {
  test.setTimeout(200_000);
  const errors = watchErrors(page);
  const point = await seedFirst(page, ["X2 released", "C5 released"]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const album = await api<Album>(page, "GET", "/album");
  const released = ORDER.filter((c) => album.tracks.some((t) => t.capstoneId === c));
  expect(released).toEqual(point === "X2 released" ? ORDER : ORDER.slice(0, 7));

  await page.goto("/album");
  await expect(page.getByTestId("album-meta")).toContainText(`${released.length} tracks`, {
    timeout: 60_000,
  });
  // Side A lists the core capstones in course order: each released one with its cover.
  const rows = page.locator("[data-track]");
  await expect(rows).toHaveCount(released.length);
  const titles = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-track")));
  const expected = released.map((c) => album.tracks.find((t) => t.capstoneId === c)?.id);
  expect(titles).toEqual(expected);
  // Every cover is grown from its own music: no two are the same drawing.
  await expect(page.locator("[data-track] svg.oak-cover[aria-busy]")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator("[data-track] svg.oak-cover[data-cover-rings]")).toHaveCount(released.length);
  const labels = await page
    .locator("[data-track] svg.oak-cover")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  // Grown from the music; a version whose seeded code does not run keeps a cover grown from its seed.
  expect(labels.every((l) => /^Cover of .+(: \d+ rings, one per bar|, grown from its seed)/.test(l))).toBe(
    true,
  );
  const fromSeed = labels.filter((l) => l.endsWith("grown from its seed"));
  if (fromSeed.length)
    test
      .info()
      .annotations.push({ type: "seeded code", description: `covers from the seed: ${fromSeed.join("; ")}` });
  // C3's demo (at least 90 seconds: 32 bars or more, one ring a bar) is the album's longest piece.
  const rings = await page
    .locator("[data-track] svg.oak-cover")
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-cover-rings") ?? 0)));
  const c3Rings = rings[released.indexOf("C3")] ?? 0;
  expect(c3Rings).toBeGreaterThanOrEqual(32);
  expect(Math.max(...rings)).toBe(c3Rings);
  const covers = await rows.evaluateAll((els) =>
    els.map((e) => e.querySelector("svg.oak-cover")?.innerHTML ?? ""),
  );
  expect(covers.every((c) => c.length > 200)).toBe(true);
  expect(new Set(covers).size).toBe(covers.length);
  if (point !== "X2 released") await expect(page.getByText("X2 Blues Transcription").first()).toBeVisible();
  await shots(page, "album-w5");

  // C3's demo, the longest piece: its recording plays in place and downloads.
  const c3 = album.tracks.find((t) => t.capstoneId === "C3") as Album["tracks"][number];
  const detail = await api<TrackDetail>(page, "GET", `/album/tracks/${c3.id}`);
  expect(detail.versions[0]?.hasAudio).toBe(true);
  const row = page.locator(`[data-track="${c3.id}"]`);
  const play = row.getByRole("button", { name: `Play ${c3.title}` });
  await play.focus();
  await page.keyboard.press("Enter");
  await expect(row.getByRole("button", { name: `Stop ${c3.title}` })).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: `Stop ${c3.title}` }).click();
  await page.goto(`/album/${c3.id}`);
  await expect(page.getByRole("heading", { level: 1, name: c3.title })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("download-audio")).toHaveAttribute("download", /-v1\.\w+$/);
  await shots(page, "album-w5-c3-track");
  expect(errors).toEqual([]);
});

test("re-recording an album version asks first; keeping the earlier take changes nothing; replacing it uploads with the confirm (c11)", async ({
  page,
}) => {
  test.setTimeout(200_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["C5 released", "C2 released"]);
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  const album = await api<Album>(page, "GET", "/album");
  const c0 = album.tracks.find((t) => t.capstoneId === "C0") as Album["tracks"][number];
  const before = await api<TrackDetail>(page, "GET", `/album/tracks/${c0.id}`);
  expect(before.versions[0]?.hasAudio).toBe(true);
  await page.goto(`/album/${c0.id}`);
  await expect(page.getByRole("heading", { level: 1, name: c0.title })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Play it live" }).click();
  const again = page.getByTestId("record-version");
  await expect(again).toHaveText("Record again", { timeout: 60_000 });
  await expect(again).toBeEnabled({ timeout: 60_000 });
  await again.click();
  const dialog = page.getByRole("dialog", { name: "Replace the earlier recording of v1?" });
  await expect(dialog).toBeVisible();
  // Focus moves into the dialog (Esc closes it, Tab reaches both choices).
  await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await shots(page, "album-w5-replace-confirm");
  // Esc keeps the earlier take: nothing records.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("stop-recording")).toHaveCount(0);

  // Confirmed: the take is recorded and replaces the earlier one (the server checks the confirm nonce).
  const puts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && /\/api\/album\/tracks\/[^/]+\/versions\/1\/audio/.test(r.url()))
      puts.push(r.headers()["x-oak-confirm"] ?? "");
  });
  // A seeded take (seeded-take.ts): the recorder's own window, uploaded through the album's re-record path.
  await seedTake(page);
  await again.click();
  await dialog.getByTestId("confirm-replace").click();
  await expect(page.getByText("Version 1 recorded again")).toBeVisible({ timeout: 30_000 });
  expect(puts.length).toBe(1);
  expect((puts[0] ?? "").length).toBeGreaterThanOrEqual(16);
  expect(errors).toEqual([]);
});

// The album: a released track with no recording says so (no placeholder dash), Play all explains why it waits,
// and re-recording a version can be stopped, or abandoned by leaving the page, without anything uploaded later.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { api, seed } from "./support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

interface Detail {
  versions: { version: number; hasAudio: boolean }[];
}

test("an album with no recordings yet, and a take abandoned mid-way", async ({ page }) => {
  test.setTimeout(240_000);
  // Since Wave 4 the seeder records every release; this album has none yet.
  await seed(page, "C0 released", { recordings: false });
  const album = await api<{ tracks: { id: string }[] }>(page, "GET", "/album");
  const trackId = album.body.tracks[0]?.id as string;
  const hasAudio = async () =>
    (await api<Detail>(page, "GET", `/album/tracks/${trackId}`)).body.versions.some((v) => v.hasAudio);
  expect(await hasAudio()).toBe(false);

  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/album");
  await expect(page.getByTestId("album-meta")).toHaveText("1 track · no recordings yet");
  await expect(page.getByRole("button", { name: "Play all" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Play all" })).toHaveAttribute(
    "title",
    /No track has a recording yet/,
  );

  await page.goto(`/album/${trackId}`);
  await page.getByRole("button", { name: "Play it live" }).click();
  const recordBtn = page.getByRole("button", { name: "Record this version" });
  await expect(recordBtn).toBeEnabled({ timeout: 60_000 });

  // Stop: nothing saved.
  await recordBtn.click();
  await page.getByTestId("stop-recording").click();
  await expect(page.getByText("Recording stopped. Nothing was saved.")).toBeVisible({ timeout: 10_000 });
  expect(await hasAudio()).toBe(false);

  // Leave mid-take: the recorder is cancelled, and nothing is uploaded after the learner has gone.
  await recordBtn.click();
  await expect(page.getByText(/Recording \d/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: "Studio" }).first().click();
  await expect(page).toHaveURL(/\/studio$/);
  // The recorder stops at once; the master falls silent once the transport's stop reaches the audio thread
  // (closer: under a loaded machine that took longer than a fixed 300 ms, so a silent second is polled for, 5 s at most).
  const state = () =>
    page.evaluate(async () => {
      const o = (
        globalThis as unknown as {
          __oakStrudel: { recorder: { recording: boolean }; master: { level(): { rms: number } } };
        }
      ).__oakStrudel;
      let peak = 0;
      for (let i = 0; i < 40; i++) {
        peak = Math.max(peak, o.master.level().rms);
        await new Promise((r) => setTimeout(r, 25));
      }
      return { recording: o.recorder.recording, peak };
    });
  expect((await state()).recording).toBe(false);
  await expect
    .poll(async () => (await state()).peak, { timeout: 5_000, intervals: [100] })
    .toBeLessThan(0.0005);
  await page.waitForTimeout(12_000); // longer than the 4-bar take and its tail
  expect(await hasAudio()).toBe(false);
});

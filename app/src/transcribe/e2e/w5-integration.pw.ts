// Wave 5 integration on the Transcribe stack (5213/8813, the scripted fake tutor), from the "ladder L5" seed:
// c4 for songs in phrases. Red River Valley opens with a two-beat pickup: its bars count from the first full bar
// (the pickup is "pickup", the bar after it "bar 1"), a tutor bar reference ([[bars:2-3]], through the panel's
// `showBars`, as a chip click does) loops exactly display bars 2–3 on the song's own transport, and a phrase loops
// with its pickup. The panel's host keeps that numbering; the Workbench below is not asked to loop a second time.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { api } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

test("c4: a song with a pickup counts bars from the first full bar; a tutor bar reference loops those bars", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await api(page, "PUT", "/dev/clock", { reset: true });
  const seeded = await api(page, "POST", "/dev/seed", { point: "ladder L5" });
  expect(seeded.status, JSON.stringify(seeded.body)).toBe(200);
  const item = await api<{ itemId: string; song?: { songId: string } | null }>(
    page,
    "POST",
    "/ladder/items",
    {
      sessionId: null,
      gymId: null,
      level: 5,
      songId: "song.red-river-valley",
    },
  );
  expect(item.status, JSON.stringify(item.body)).toBe(200);
  const id = item.body.itemId;
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto(`/transcribe/${id}`);
  await expect(page.getByTestId("transport-play")).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByTestId("given")).toContainText(/pickup/i);
  await expect(page.getByTestId("loop-label")).toHaveText("Off");

  // A tutor bar reference: display bars 2–3 are cycles 2–3 after the pickup (never cycles 1–2).
  await page.waitForFunction(() => "__oakTutor" in window);
  await page.evaluate((subjectId) => {
    (
      window as unknown as {
        __oakTutor: { showBars(t: { subjectKind: string; subjectId: string }, a: number, b: number): void };
      }
    ).__oakTutor.showBars({ subjectKind: "transcription", subjectId }, 2, 3);
  }, id);
  await expect(page.getByTestId("loop-label")).toContainText("bars 2–3");

  // A single bar reference: bar 1 is the first full bar, not the pickup.
  await page.evaluate((subjectId) => {
    (
      window as unknown as {
        __oakTutor: { showBars(t: { subjectKind: string; subjectId: string }, a: number, b: number): void };
      }
    ).__oakTutor.showBars({ subjectKind: "transcription", subjectId }, 1, 1);
  }, id);
  await expect(page.getByTestId("loop-label")).toContainText("bar 1");
  await expect(page.getByTestId("loop-label")).not.toContainText("pickup");

  // Phrase 1 loops with its pickup (the key 1): the label names the pickup.
  await page.getByTestId("transcribe-project").focus();
  await page.keyboard.press("1");
  await expect(page.getByTestId("loop-label")).toContainText("pickup + bars 1–");
});

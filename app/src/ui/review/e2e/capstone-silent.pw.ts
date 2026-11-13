// Releasing a silent take: the C0 reference passes every requirement, but the master bus is muted at the
// recorder's tap (what a fully muted mix or a sample bank that never loaded sounds like). The take is refused
// with a way forward and nothing reaches the album; with sound back, the same dialog records and releases.
import { expect, type Page, test } from "@playwright/test";
import { capstones } from "../../../../../content/capstones.ts";
import { useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { api, SHOTS, seed } from "./support.ts";

const C0 = capstones.find((c) => c.id === "C0");
const REFERENCE = (() => {
  const t = C0?.brief?.tests.find((x) => x.name === "four bars, tom fill in bar 4");
  if (!t || !("code" in t.response)) throw new Error("C0 reference test missing");
  return t.response.code;
})();
const EDITOR = "oak_capstone-C0_0_";

test.beforeEach(async ({ page }) => {
  // Other engineers edit the shared tree; Vite's HMR socket must not reload the page under a running test.
  await page.routeWebSocket(/.*/, () => {});
});

async function setCode(page: Page, code: string) {
  await page.waitForFunction(
    (id) =>
      !!(globalThis as { __oakStrudel?: { editors: Map<string, unknown> } }).__oakStrudel?.editors.get(id),
    EDITOR,
  );
  await page.evaluate(
    ([id, c]) =>
      (
        globalThis as unknown as { __oakStrudel: { editors: Map<string, { setCode(c: string): void }> } }
      ).__oakStrudel.editors
        .get(id as string)
        ?.setCode(c as string),
    [EDITOR, code],
  );
}

const tapGain = (page: Page, value: number) =>
  page.evaluate((v) => {
    const o = (globalThis as unknown as { __oakStrudel: { master: { trim: GainNode } } }).__oakStrudel;
    o.master.trim.gain.value = v;
  }, value);

test("a silent take is refused; a take with sound releases", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, "C0 ready");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/C0");
  await page.getByRole("button", { name: /^Start session/ }).click({ timeout: 30_000 });
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await setCode(page, REFERENCE);
  await expect(page.getByTestId("req-count")).toHaveText(/(\d+) of \1 met/, { timeout: 30_000 });
  await page.getByTestId("check-track").click();
  await expect(page.getByTestId("release")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("release").click();
  const dialog = page.getByRole("dialog", { name: "Release to the album" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  await tapGain(page, 0);
  await dialog.getByTestId("record-take").click();
  await expect(dialog).toContainText("The take was silent", { timeout: 60_000 });
  await expect(dialog.getByTestId("take-audio")).toHaveCount(0);
  await expect(dialog.getByTestId("confirm-release")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/release-silent-paper-1440x900.png` });
  const album = await api<{ tracks: unknown[] }>(page, "GET", "/album");
  expect(album.body.tracks).toHaveLength(0);

  await tapGain(page, 1);
  await dialog.getByTestId("record-take").click();
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: 60_000 });
  await expect(dialog).not.toContainText("The take was silent");
});

test("a locked operator in the piece reads as locked, not as a typo, and the empty views say so once", async ({
  page,
}) => {
  await seed(page, "C0 in progress");
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  await page.goto("/capstone/C0");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  // The seeded draft is loaded first (it would replace code typed before it arrives).
  await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });
  await setCode(page, 'drums: s("bd ~ sd ~, hh*8")');
  const banner = page.getByTestId("eval-banner");
  await expect(banner).toContainText("unlocks in", { timeout: 30_000 });
  await expect(banner).not.toContainText("typo");
  await page.reload();
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });
  await setCode(page, 'drums: s("bd ~ sd ~, hh*8")');
  await expect(page.getByTestId("eval-banner")).toBeVisible({ timeout: 30_000 });
  // The empty views say so once (never side by side). If the saved draft was analysed before the edit, the views
  // keep that last good version instead and say so (the Workbench's documented behaviour).
  const empty = await page.getByText("No music yet.").count();
  expect(empty).toBeLessThanOrEqual(1);
  if (empty === 0) await expect(page.getByText(/Showing the last version that ran/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/capstone-locked-operator-bark-1440x900.png` });
});

test("Stop and Esc end a take in progress; nothing keeps recording or sounding", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, "C0 ready");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/C0");
  await page.getByRole("button", { name: /^Start session/ }).click({ timeout: 30_000 });
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await setCode(page, REFERENCE);
  await page.getByTestId("check-track").click();
  await expect(page.getByTestId("release")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("release").click();
  const dialog = page.getByRole("dialog", { name: "Release to the album" });
  const quiet = () =>
    page.evaluate(async () => {
      const o = (
        globalThis as unknown as {
          __oakStrudel: { recorder: { recording: boolean }; master: { level(): { rms: number } } };
        }
      ).__oakStrudel;
      await new Promise((r) => setTimeout(r, 400));
      let peak = 0;
      for (let i = 0; i < 40; i++) {
        peak = Math.max(peak, o.master.level().rms);
        await new Promise((r) => setTimeout(r, 25));
      }
      return { recording: o.recorder.recording, peak };
    });

  // Stop: back to the details with a calm line, no take kept.
  await dialog.getByTestId("record-take").click();
  await expect(dialog).toContainText(/Recording \d/, { timeout: 15_000 });
  await dialog.getByTestId("stop-take").click();
  await expect(dialog).toContainText("Recording stopped", { timeout: 10_000 });
  await expect(dialog.getByTestId("take-audio")).toHaveCount(0);
  expect(await quiet()).toEqual({ recording: false, peak: expect.any(Number) });
  expect((await quiet()).peak).toBeLessThan(0.0005);

  // Esc mid-take closes the dialog and stops everything; the page can be left at once.
  await dialog.getByTestId("record-take").click();
  await expect(dialog).toContainText(/Recording \d/, { timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("link", { name: "Album" }).first().click();
  await expect(page).toHaveURL(/\/album$/);
  const after = await quiet();
  expect(after.recording).toBe(false);
  expect(after.peak).toBeLessThan(0.0005);
  const album = await api<{ tracks: unknown[] }>(page, "GET", "/album");
  expect(album.body.tracks).toHaveLength(0);
});

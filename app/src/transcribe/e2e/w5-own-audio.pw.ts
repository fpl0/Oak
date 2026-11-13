// Wave 5 in Transcribe's own audio and imported code. First run (ux §9 "BeatGrid"): a fresh recording asks to
// set the bars; tapping along with T sets the tempo and bar 1, Shift+→/← move bar 1 by a beat, W marks the swung
// off-beats and is remembered. Carry-over c2 (contracts §11.3): a version that came in an imported backup opens as
// text, never in the editor; the strict check passes and "Run it as mine" confirms it before it reaches the
// editor; a version that reaches outside the music stays text. From the "own-audio project" seed, and for c2
// the server's own import flag ("imported own-audio (c2)", confirmed on the real endpoint).
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { api, seed } from "./support.ts";
import { makeWav } from "./wav.ts";

const SHOTS = new URL("./screenshots", import.meta.url).pathname;

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

async function shots(page: Page, name: string) {
  for (const s of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), s.theme);
    await page.waitForTimeout(300);
    await shoot(page, SHOTS, name, s.theme);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "paper"));
}

const seconds = (t: string) => {
  const [m, s] = t.split(":");
  return Number(m) * 60 + Number(s);
};

test("first run: tap along to set the bars, nudge bar 1 by a beat, swing 8ths on the grid", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seed(page, "own-audio project");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/transcribe");
  // The kit's drop zone (c12): the button is the keyboard way in; the file goes through its input.
  await expect(page.getByTestId("import")).toContainText("Bring a recording");
  await page
    .getByTestId("import")
    .locator("input[type=file]")
    .setInputFiles({
      name: "shuffle_take.wav",
      mimeType: "audio/wav",
      buffer: makeWav({ bpm: 120, bars: 8, leadInSec: 0.5 }),
    });
  await expect(page).toHaveURL(/\/transcribe\/tr/, { timeout: 30_000 });
  const id = page.url().split("/").pop() as string;
  await expect(page.getByTestId("transport-play")).toBeEnabled({ timeout: 30_000 });

  // A fresh recording asks for its bars first.
  const card = page.getByTestId("tempo-card");
  await expect(card).toHaveAttribute("data-first-run", "true");
  await expect(card.getByRole("heading", { name: "Set the bars" })).toBeVisible();
  await expect(page.getByTestId("downbeat")).toHaveText("not set");
  await expect(page.getByTestId("beat-later")).toBeDisabled();
  await shots(page, "w5-own-audio-first-run");

  // Keyboard only: T starts the recording, then eight taps half a second apart (120 BPM).
  await page.getByTestId("transcribe-project").focus();
  await page.keyboard.press("t");
  await expect(page.getByTestId("transport-play")).toHaveAccessibleName(/Pause/);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("t");
    if (i < 7) await page.waitForTimeout(500);
  }
  await expect(card).not.toHaveAttribute("data-first-run", "true", { timeout: 10_000 });
  await expect(card.getByRole("heading", { name: "Bars" })).toBeVisible();
  const project = await api<{ bpm: number; downbeatS: number }>(page, "GET", `/transcriptions/${id}`);
  // Key presses from the test runner arrive a little late: the taps land near 120, never exactly on it.
  expect(project.body.bpm).toBeGreaterThan(90);
  expect(project.body.bpm).toBeLessThan(140);
  await page.keyboard.press("Space");

  // Bar 1 a beat later, then back: a beat is 60 / BPM seconds.
  const before = seconds((await page.getByTestId("downbeat").textContent()) ?? "0:0");
  await page.keyboard.press("Shift+ArrowRight");
  await expect
    .poll(async () => seconds((await page.getByTestId("downbeat").textContent()) ?? "0:0"))
    .toBeCloseTo(before + 60 / project.body.bpm, 0);
  await page.keyboard.press("Shift+ArrowLeft");
  await expect
    .poll(async () => seconds((await page.getByTestId("downbeat").textContent()) ?? "0:0"))
    .toBeCloseTo(before, 1);
  // Halve and double: a run tapped on every other beat.
  await page.getByTestId("tempo-double").click();
  await expect
    .poll(async () => (await api<{ bpm: number }>(page, "GET", `/transcriptions/${id}`)).body.bpm)
    .toBeCloseTo(project.body.bpm * 2, 0);
  await page.getByTestId("tempo-half").click();
  await expect
    .poll(async () => (await api<{ bpm: number }>(page, "GET", `/transcriptions/${id}`)).body.bpm)
    .toBeCloseTo(project.body.bpm, 0);

  // W: swing 8ths on the grid, said in the header, and kept for this project.
  await page.getByTestId("transcribe-project").focus();
  await page.keyboard.press("w");
  const swing = page.getByTestId("swing-switch");
  await expect(swing.getByRole("radio", { name: "Swing 8ths" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("header").getByText("Swing 8ths")).toBeVisible();
  await shots(page, "w5-own-audio-bars-set");
  await page.reload();
  await expect(page.getByTestId("transport-play")).toBeEnabled({ timeout: 30_000 });
  await expect(swing.getByRole("radio", { name: "Swing 8ths" })).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("transcribe-project").focus();
  await page.keyboard.press("w");
  await expect(swing.getByRole("radio", { name: "Straight" })).toHaveAttribute("aria-checked", "true");
});

/** The seeded own-audio project with its versions marked as imported (the flag the server sets on a restore). */
async function importedProject(page: Page, codeOf?: (code: string) => string) {
  const list = await api<{ items: { id: string; sourceKind: string }[] }>(page, "GET", "/transcriptions");
  const own = list.body.items.find((t) => t.sourceKind === "own-audio");
  expect(own, "the seed has an own-audio project").toBeTruthy();
  const id = own?.id as string;
  const confirms: unknown[] = [];
  await page.route(`**/api/transcriptions/${id}`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    const body = (await res.json()) as { versions: { code: string; reviewBeforeRun?: true }[] };
    body.versions = body.versions.map((v) => ({
      ...v,
      code: codeOf ? codeOf(v.code) : v.code,
      reviewBeforeRun: true,
    }));
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });
  await page.route(`**/api/transcriptions/${id}/versions/*/confirm`, async (route) => {
    confirms.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        transcriptionId: id,
        version: 1,
        code: "",
        createdAt: "2026-11-13T09:00:00.000Z",
      }),
    });
  });
  return { id, confirms };
}

test("c2: an imported version is reviewed as text, checked strictly, then runs as mine (real server)", async ({
  page,
}) => {
  test.setTimeout(150_000);
  // The server's own import flag: the "imported own-audio (c2)" seed restores the project as a backup would.
  await seed(page, "imported own-audio (c2)");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const list = await api<{ items: { id: string; sourceKind: string }[] }>(page, "GET", "/transcriptions");
  const id = list.body.items.find((t) => t.sourceKind === "own-audio")?.id as string;
  expect(id, "the seed has an own-audio project").toBeTruthy();
  type Detail = { versions: { version: number; code: string; reviewBeforeRun?: true }[] };
  const before = (await api<Detail>(page, "GET", `/transcriptions/${id}`)).body.versions;
  expect(before.length).toBeGreaterThan(0);
  expect(
    before.every((v) => v.reviewBeforeRun === true),
    "every imported version is held for review",
  ).toBe(true);
  const seeded = before.at(-1)?.code as string;
  const confirms: unknown[] = [];
  page.on("request", (r) => {
    if (/\/versions\/\d+\/confirm$/.test(r.url())) confirms.push(r.postDataJSON());
  });
  await page.goto(`/transcribe/${id}`);

  const review = page.getByTestId("import-review");
  await expect(review).toContainText("Review before running", { timeout: 30_000 });
  await expect(page.getByTestId("review-code")).toContainText(seeded.split("\n")[0] as string);
  // Nothing evaluates it: no editor while it is under review.
  await expect(page.locator(".cm-content")).toHaveCount(0);
  await expect(page.getByTestId("versions")).toContainText("imported");
  await shots(page, "w5-import-review");

  await page.getByTestId("review-check").click();
  await expect(page.getByTestId("review-passed")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("run-as-mine").click();
  await expect(review).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator(".cm-content").first()).toContainText(seeded.split("\n")[0] as string, {
    timeout: 30_000,
  });
  expect(confirms).toEqual([{ strictLintPassed: true }]);
  // The server re-linted it strictly and cleared the flag of the confirmed version.
  const after = (await api<Detail>(page, "GET", `/transcriptions/${id}`)).body.versions;
  expect(after.find((v) => v.version === before.at(-1)?.version)?.reviewBeforeRun).toBeUndefined();
});

test("c2: imported code that reaches outside the music stays text; starting fresh opens the starter", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seed(page, "imported own-audio (c2)");
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  const { id, confirms } = await importedProject(
    page,
    (code) => `${code}\nfetch("http://example.invalid/x")\n`,
  );
  await page.goto(`/transcribe/${id}`);
  await expect(page.getByTestId("import-review")).toBeVisible({ timeout: 30_000 });
  // Keyboard: the check button is reachable and pressed with Enter.
  await page.getByTestId("review-check").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("review-problems")).toContainText("Line", { timeout: 30_000 });
  await expect(page.getByTestId("run-as-mine")).toHaveCount(0);
  await shots(page, "w5-import-refused");
  await page.getByTestId("review-fresh").click();
  await expect(page.locator(".cm-content").first()).toContainText('melody: n("0")', { timeout: 30_000 });
  await expect(page.locator(".cm-content").first()).not.toContainText("fetch(");
  expect(confirms).toEqual([]);
});

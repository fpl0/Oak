// Wave 6 in Transcribe's own audio (ladder L7; content/specs/CF.md "Own audio"), against the real server from the
// "own-audio project" seed. The form of the learner's recording: sections cut on the strip under the waveform
// (a click on a bar line, X at the playing bar), named in the Form card, kept as the project's sections (so the
// server's export of the project carries them) and written into the code as a comment; the checklist gains its form
// row. The grid in triplets and in a compound meter: three to the beat, the dotted quarter as the beat.
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";
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
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await shoot(page, SHOTS, name, s.theme);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "paper"));
}

interface Region {
  id: string;
  label: string;
  startS: number;
  endS: number;
  kind: string;
}

/** A recording of `bars` bars at 120 BPM with its bars already set (bar 1 at 0.5 s). */
async function ownProject(page: Page, bars: number, meter = "4/4"): Promise<string> {
  const up = await page.request.fetch(`${stack.apiURL}/api/audio?name=song-form.wav`, {
    method: "POST",
    headers: { origin: stack.baseURL, "x-oak": "1", "content-type": "audio/wav" },
    data: makeWav({ bpm: 120, bars, leadInSec: 0.5 }),
  });
  expect(up.status(), await up.text()).toBe(200);
  const audioId = ((await up.json()) as { id: string }).id;
  const made = await api<{ id: string }>(page, "POST", "/transcriptions", {
    sourceKind: "own-audio",
    audioId,
    songId: null,
    title: "Song form",
    artist: null,
    ladderLevel: null,
    templateId: null,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  const patched = await api(page, "PATCH", `/transcriptions/${made.body.id}`, {
    bpm: 120,
    meter,
    downbeatS: 0.5,
    key: { tonic: "C", mode: "major" },
  });
  expect(patched.status, JSON.stringify(patched.body)).toBe(200);
  return made.body.id;
}

test("own audio: sections cut on the form strip are kept with the project, named, looped and written into the code", async ({
  page,
}) => {
  await seed(page, "own-audio project");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const id = await ownProject(page, 16);
  await page.goto(`/transcribe/${id}`);
  await expect(page.getByTestId("transport-play")).toBeEnabled({ timeout: 30_000 });

  // The strip shows the recording's sixteen bars as one unnamed section; the Form card says how to start.
  const strip = page.getByTestId("form-strip");
  await expect(strip).toHaveAttribute("aria-valuemax", "16");
  await expect(page.getByTestId("form-section")).toHaveCount(1);
  await expect(page.getByTestId("form-card")).toContainText("Map the recording's sections");
  await expect(page.getByTestId("checklist")).not.toContainText("The sections start where");

  // A click on a bar line cuts; the server keeps the sections.
  const saved = page.waitForResponse(
    (r) => r.url().includes(`/transcriptions/${id}`) && r.request().method() === "PATCH",
  );
  await page.locator('[data-testid="form-line"][data-bar="9"]').click();
  await saved;
  await expect(page.getByTestId("form-section")).toHaveCount(2);

  // X: a section starts at the bar the playhead is in. Alt+→ from the lead-in lands on bar 1's line, then 2, 3, 4, 5.
  await page.getByTestId("transcribe-project").focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("Alt+ArrowRight");
  await page.keyboard.press("x");
  await expect(page.getByTestId("form-section")).toHaveCount(3);
  await expect(strip).toHaveAttribute("data-cursor", "5");

  // Names, typed in the Form card (Enter keeps one).
  const names = page.getByTestId("form-name");
  await names.nth(0).fill("Intro");
  await names.nth(0).press("Enter");
  await expect(page.getByTestId("form-section").nth(0)).toHaveAttribute("data-label", "Intro");
  await names.nth(1).fill("verse");
  await names.nth(1).press("Enter");
  await names.nth(2).fill("chorus");
  await names.nth(2).press("Enter");
  await expect(page.getByTestId("form-map")).toHaveAttribute("data-form", "ABC");
  await expect(page.getByTestId("form-summary")).toHaveText("A B C");

  // Kept with the project: the server has three section regions on the bar lines (what its backup exports).
  await expect
    .poll(async () => {
      const p = await api<{ regions: Region[] }>(page, "GET", `/transcriptions/${id}`);
      return p.body.regions.filter((r) => r.kind === "section").map((r) => [r.id, r.label, r.startS, r.endS]);
    })
    .toEqual([
      ["form-1", "Intro", 0.5, 8.5],
      ["form-5", "verse", 8.5, 16.5],
      ["form-9", "chorus", 16.5, 32.5],
    ]);
  // …and the backup export carries them with the project (an .oakbackup is a stored zip of the tables as JSON).
  const backup = await page.request.fetch(`${stack.apiURL}/api/backup/export`, {
    headers: { origin: stack.baseURL, "x-oak": "1" },
  });
  expect(backup.status()).toBe(200);
  const exported = (await backup.body()).toString("latin1");
  expect(exported).toContain("form-9");
  expect(exported).toContain("chorus");

  // A reload reads the same map back; a click on a section loops it; the checklist asks about the form too.
  await page.reload();
  await expect(page.getByTestId("form-map")).toHaveAttribute("data-form", "ABC");
  await expect(page.getByTestId("transport-play")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("form-section").nth(2).click();
  await expect(page.getByTestId("loop-label")).toHaveText("bars 9–16");
  await expect(page.getByTestId("checklist")).toContainText(
    "The sections start where the recording's sections start",
  );

  // The form goes into the code as a comment, so a saved version carries it.
  await page.getByTestId("form-to-code").click();
  await expect(page.locator(".cm-content").first()).toContainText(
    "// Form: Intro (bars 1–4) · verse (5–8) · chorus (9–16)",
  );
  await shots(page, "w6-own-audio-form");

  // Joining a section back on the strip, by keyboard: Shift+X, to bar line 5, Enter.
  await page.getByTestId("transcribe-project").focus();
  await page.keyboard.press("Shift+X");
  await expect(strip).toBeFocused();
  await page.keyboard.press("Home");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("form-section")).toHaveCount(2);
  await expect(page.getByTestId("form-map")).toHaveAttribute("data-form", "AB");
});

test("own audio: triplets and a compound meter on the grid", async ({ page }) => {
  await seed(page, "own-audio project");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const id = await ownProject(page, 8);
  await page.goto(`/transcribe/${id}`);
  await expect(page.getByTestId("transport-play")).toBeEnabled({ timeout: 30_000 });
  const card = page.getByTestId("tempo-card");

  // Triplets: a third feel. The grid says so, the header names it, and it is still there after a reload.
  await card.getByRole("radio", { name: "Triplets" }).click();
  await expect(card).toContainText("The grid marks three to each beat.");
  await expect(page.getByTestId("transcribe-project")).toContainText("Triplets");
  await page.reload();
  await expect(page.getByTestId("tempo-card").getByRole("radio", { name: "Triplets" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // W swings instead: one feel at a time.
  await expect(page.getByTestId("transport-play")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("transcribe-project").focus();
  await page.keyboard.press("w");
  await expect(page.getByTestId("tempo-card").getByRole("radio", { name: "Swing 8ths" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByTestId("tempo-card")).toContainText("swung off-beats at two thirds");

  // 6/8: the beat is the dotted quarter, in three; swing and triplets do not apply; the starter counts that beat.
  await page.getByTestId("tempo-card").getByRole("radio", { name: "6/8" }).click();
  await expect(page.getByTestId("tempo-card")).toContainText("BPM counts the dotted quarter");
  await expect(page.getByTestId("tempo-card").getByRole("radio", { name: "Swing 8ths" })).toBeDisabled();
  await expect(page.getByTestId("tempo-card").getByRole("radio", { name: "Triplets" })).toBeDisabled();
  await expect(page.getByTestId("tempo-card").getByRole("radio", { name: "In three" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.locator(".cm-content").first()).toContainText("setcpm(120/2)");
  // A bar of 6/8 at 120 to the dotted quarter is one second: the 8.5-second file now has eight whole bars… of 1 s.
  await expect(page.getByTestId("tempo-card")).toContainText("A bar is 1.00 s.");
  await expect(page.getByTestId("form-strip")).toHaveAttribute("aria-valuemax", "16");
});

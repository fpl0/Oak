// Own audio in Transcribe (contracts §6.12 L7; wave4.md §5.3): a generated WAV is imported (picked, decoded in
// the page, stored by the local server), its bars are set, a region loops at 0.75×, A/B switches between the
// recording and the learner's code without stopping, the checklist and notes are kept; Quiet mode offers
// typing instead of humming. Starts from the "own-audio project" seed.
import { expect, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { api, seed } from "./support.ts";
import { makeWav } from "./wav.ts";

const SHOTS = new URL("./screenshots", import.meta.url).pathname;

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

async function importWav(page: import("@playwright/test").Page) {
  await page.goto("/transcribe");
  await expect(page.getByRole("heading", { level: 1, name: "Transcribe" })).toBeVisible();
  await expect(page.getByText("Drop an audio file — it stays on this device.")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles({
    name: "groove_take_1.wav",
    mimeType: "audio/wav",
    buffer: makeWav({ bpm: 120, bars: 8, leadInSec: 0.5 }),
  });
  await expect(page).toHaveURL(/\/transcribe\/tr/, { timeout: 30_000 });
  await expect(page.getByTestId("project-title")).toHaveText("groove take 1");
  await expect(page.getByTestId("waveform").locator("div").first()).toBeVisible();
  await expect(page.getByTestId("play")).toBeEnabled({ timeout: 30_000 });
}

test("import a WAV, set the bars, loop a region at 0.75× and switch A/B", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, "own-audio project");
  await importWav(page);
  const id = page.url().split("/").pop() as string;

  // The bars: 120 BPM, bar 1 half a second in (the generated lead-in).
  await page.getByTestId("bpm-input").fill("120");
  await expect
    .poll(async () => (await api<{ bpm: number }>(page, "GET", `/transcriptions/${id}`)).body.bpm)
    .toBe(120);
  await page.getByTestId("project-title").click();
  // Downbeat by API-free keys: the playhead is at 0; nudge bar 1 to 0.5 s with "Bar 1 starts here" after a seek.
  await page.getByRole("button", { name: "Bar 1 starts here" }).click();
  await expect(page.getByTestId("downbeat")).toHaveText("0:00.0");
  for (let i = 0; i < 50; i++) await page.getByRole("button", { name: /later by 10 milliseconds/ }).click();
  await expect(page.getByTestId("downbeat")).toHaveText("0:00.5");

  // Keyboard only from here: the page has focus.
  const root = page.getByTestId("transcribe-project");
  await root.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press(",");
  await expect(page.getByTestId("rate")).toContainText("75 %");
  await page.keyboard.press("l");
  await expect(page.getByTestId("loop-label")).toHaveText("bar 1");
  // With a loop on, Alt+arrows move it bar by bar.
  await page.keyboard.press("Alt+ArrowRight");
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.getByTestId("loop-label")).toHaveText("bar 3");
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(page.getByTestId("loop-label")).toHaveText("bar 2");
  await page.keyboard.press("l");
  await expect(page.getByTestId("loop-label")).toHaveText("Off");

  // A and B at the playhead while it plays: [ in bar 2, ] in bar 3 → the loop is exactly A–B (about 3.0 s – 5.6 s),
  // inside bars 2–3, never widened to the whole bars.
  const pos = async () => {
    const text = (await page.getByTestId("position").textContent()) ?? "";
    const [m, sec] = (text.split(" / ")[0] ?? "0:0").split(":");
    return Number(m) * 60 + Number(sec);
  };
  await page.keyboard.press("Space");
  await expect(page.getByTestId("play")).toHaveAccessibleName(/Pause/);
  await expect.poll(pos, { timeout: 15_000, intervals: [50] }).toBeGreaterThanOrEqual(3);
  await page.keyboard.press("[");
  await expect(page.getByTestId("loop-label")).toContainText("A at 0:03");
  await expect.poll(pos, { timeout: 15_000, intervals: [50] }).toBeGreaterThanOrEqual(5.6);
  await page.keyboard.press("]");
  await expect(page.getByTestId("loop-label")).toHaveText(/^0:03\.\d–0:05\.\d in bars 2–3$/);
  const loopLabel = (await page.getByTestId("loop-label").textContent()) ?? "";

  // The playhead stays inside A–B while it loops.
  await page.waitForTimeout(400);
  const times: number[] = [];
  for (let i = 0; i < 16; i++) {
    times.push(await pos());
    await page.waitForTimeout(250);
  }
  for (const t of times) {
    expect(t).toBeGreaterThanOrEqual(2.9);
    expect(t).toBeLessThanOrEqual(5.9);
  }
  expect(Math.max(...times) - Math.min(...times)).toBeGreaterThan(1);

  // A/B: the learner's code (a labelled line) is heard at the same place; the transport keeps playing.
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText('setcpm(120/4)\n\nbass: n("<0 3>").scale("A2:major").s("ebass")\n');
  await root.focus();
  await page.keyboard.press("v");
  await expect(page.getByRole("radio", { name: "Mine" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("play")).toHaveAccessibleName(/Pause/);
  await page.keyboard.press("o");
  await expect(page.getByRole("radio", { name: "Both" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("v");
  await expect(page.getByRole("radio", { name: "Source" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("v");
  await expect(page.getByRole("radio", { name: "Mine" })).toHaveAttribute("aria-checked", "true");
  // Still the same loop, still playing: a switch never restarts the transport.
  await expect(page.getByTestId("loop-label")).toHaveText(loopLabel);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("play")).toHaveAccessibleName(/Play/);

  // The checklist and a saved version.
  await page.getByTestId("check-contour-2").click();
  await page.getByTestId("check-rhythm-1").click();
  await expect
    .poll(
      async () =>
        (await api<{ checklist: Record<string, number> }>(page, "GET", `/transcriptions/${id}`)).body
          .checklist,
    )
    .toEqual({ contour: 2, rhythm: 1 });
  await page.getByTestId("save-version").click();
  await expect(page.getByTestId("versions")).toContainText("v1");

  // Name the loop as a section: it is kept with the project and drawn on the waveform.
  await page.getByPlaceholder(/Name this loop/).fill("Verse");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect
    .poll(async () => {
      const p = await api<{ regions: { label: string; kind: string }[] }>(
        page,
        "GET",
        `/transcriptions/${id}`,
      );
      return p.body.regions.map((r) => `${r.kind}:${r.label}`);
    })
    .toEqual(["section:Verse"]);
  await expect(page.getByTestId("waveform")).toContainText("Verse");

  // Drag across the waveform: the span becomes the loop. Then the spectrogram (Shift+S) and zoom (>).
  await page.getByTestId("waveform").scrollIntoViewIfNeeded();
  const box = (await page.getByTestId("waveform").boundingBox()) as { x: number; y: number; width: number };
  await page.mouse.move(box.x + box.width * 0.62, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + 60, { steps: 4 });
  await page.mouse.move(box.x + box.width * 0.8, box.y + 60, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId("loop-label")).toHaveText(/bars? \d/);
  await expect(page.getByTestId("loop-label")).not.toHaveText("bars 2–3");
  await root.focus();
  await page.keyboard.press("Shift+S");
  await expect(page.getByTestId("spectrogram")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(">");
  await expect(page.getByRole("button", { name: "Zoom out (<)" })).toBeEnabled();
  await page.waitForTimeout(500);
  await shoot(page, SHOTS, "own-audio-spectrogram", "paper");
  await page.keyboard.press("Shift+S");
  await page.keyboard.press("<");

  // Every transport key is in the shortcut sheet.
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("Transcribe");
  await expect(sheet).toContainText("Switch between the source and your code");
  await expect(sheet).toContainText("Set the loop start (A) at the playhead");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await root.focus();

  for (const s of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), s.theme);
    await page.waitForTimeout(400);
    await shoot(page, SHOTS, "own-audio-project", s.theme);
  }
});

test("the seeded project opens with its regions and versions; Quiet mode offers typing instead of humming", async ({
  page,
}) => {
  await seed(page, "own-audio project");
  await api(page, "PUT", "/voice/quiet", { quiet: true, scope: "today" });
  const list = await api<{ items: { id: string; sourceKind: string }[] }>(page, "GET", "/transcriptions");
  const own = list.body.items.find((t) => t.sourceKind === "own-audio");
  expect(own, "the seed has an own-audio project").toBeTruthy();
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto(`/transcribe/${own?.id}`);
  await expect(page.getByTestId("play")).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByTestId("versions")).toBeVisible();
  await page.getByTestId("hum-open").click();
  await expect(page.getByRole("dialog")).toContainText("Quiet mode is on");
  await expect(page.getByTestId("hum-start")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("an own-audio project: on the real stretch engine, Claude reviews the code and the checklist, and deleting it removes the recording", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await seed(page, "own-audio project");
  const list = await api<{ items: { id: string; sourceKind: string; audioId: string | null }[] }>(
    page,
    "GET",
    "/transcriptions",
  );
  const own = list.body.items.find((t) => t.sourceKind === "own-audio");
  expect(own?.audioId, "the seed has an own-audio project with a recording").toBeTruthy();
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto(`/transcribe/${own?.id}`);
  await expect(page.getByTestId("play")).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByTestId("source")).toHaveAttribute("data-engine", "stretch");
  // The remembered player settings come back (the seed saved 0.75×).
  await expect(page.getByTestId("rate")).toContainText("75 %");

  // A review from the scripted tutor: kept, and shown as a card beside the code.
  const reviews = page.getByTestId("transcription-reviews");
  await expect(reviews.getByTestId("request-transcription-review")).toBeVisible({ timeout: 30_000 });
  await reviews.getByTestId("request-transcription-review").click();
  await expect(reviews.getByTestId("review-cards")).toBeVisible({ timeout: 90_000 });
  for (const s of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), s.theme);
    await page.waitForTimeout(300);
    await shoot(page, SHOTS, "own-audio-review", s.theme);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "paper"));

  // Delete: one question names the recording; the project and its recording go.
  const status = (aid: string) =>
    page.evaluate(
      async (a) => (await fetch(`/api/audio/${a}`, { headers: { Range: "bytes=0-0" } })).status,
      aid,
    );
  expect([200, 206]).toContain(await status(own?.audioId as string));
  let question = "";
  page.once("dialog", (d) => {
    question = d.message();
    void d.accept();
  });
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/transcribe$/, { timeout: 30_000 });
  expect(question).toContain("its recording");
  // A media GET from the page itself (the server wants Sec-Fetch-Site: same-origin for audio).
  expect(await status(own?.audioId as string)).toBe(404);
});

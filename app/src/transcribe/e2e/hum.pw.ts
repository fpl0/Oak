// "Hum it, Oak drafts it" (contracts §6.12) with a fake microphone singing a line: the dialog counts in, listens,
// drafts `melody: n("…")` in the project's key, and the draft lands in the editor to be corrected and saved.
// Chromium's fake capture plays a generated WAV of four sung notes, looping.
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { REPO_ROOT, SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { api, seed } from "./support.ts";

const DIR = `${REPO_ROOT}test-results/transcribe-hum`;
const WAV = `${DIR}/sung-line.wav`;
const SHOTS = new URL("./screenshots", import.meta.url).pathname;

/** A voice-like line (harmonics, a little vibrato) of G4 A4 B4 G4, 0.55 s each with breaths, for 16 s. */
function sungLine(): Buffer {
  const sr = 48000;
  const seconds = 16;
  const n = sr * seconds;
  const x = new Float32Array(n);
  const notes = [67, 69, 71, 67];
  const step = 0.625;
  for (let k = 0; k * step < seconds; k++) {
    const midi = notes[k % notes.length] as number;
    const f0 = 440 * 2 ** ((midi - 69) / 12);
    const a = Math.round(k * step * sr);
    const len = Math.round(0.55 * sr);
    let phase = 0;
    for (let i = 0; i < len && a + i < n; i++) {
      const t = i / sr;
      const f = f0 * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t));
      phase += (2 * Math.PI * f) / sr;
      const env = Math.min(1, t / 0.03, (0.55 - t) / 0.05);
      x[a + i] = 0.3 * env * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
    }
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i] as number)) * 32767), 44 + i * 2);
  return buf;
}

// The fake device reads the file when the browser starts: write it before the worker launches Chromium.
mkdirSync(DIR, { recursive: true });
writeFileSync(WAV, sungLine());

test.use({
  launchOptions: {
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${WAV}`,
      "--use-fake-ui-for-media-stream",
    ],
  },
  permissions: ["microphone"],
});

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

test("hum a line: Oak drafts it in the editor, the draft is saved as a version to correct", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await seed(page, "own-audio project");
  await api(page, "PUT", "/voice/quiet", { quiet: false, scope: "today" });
  const list = await api<{ items: { id: string; sourceKind: string }[] }>(page, "GET", "/transcriptions");
  const own = list.body.items.find((t) => t.sourceKind === "own-audio");
  expect(own, "the seed has an own-audio project").toBeTruthy();
  const id = own?.id as string;
  await api(page, "PATCH", `/transcriptions/${id}`, {
    bpm: 96,
    meter: "4/4",
    key: { tonic: "G", mode: "major" },
  });
  await page.goto(`/transcribe/${id}`);
  await expect(page.getByTestId("play")).toBeEnabled({ timeout: 30_000 });

  await page.getByTestId("hum-open").click();
  await expect(page.getByRole("dialog")).toContainText("Nothing is recorded or sent");
  await page.getByTestId("hum-start").click();
  await expect(page.getByTestId("hum-draft")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("hum-draft")).toContainText('melody: n("');
  await expect(page.getByTestId("hum-draft")).toContainText('.scale("G4:major")');
  for (const s of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), s.theme);
    await page.screenshot({ path: `${SHOTS}/hum-draft-${s.theme}-${s.width}x${s.height}.png` });
  }
  await page.getByTestId("hum-use").click();
  await expect(page.locator(".cm-content").first()).toContainText('melody: n("');
  const before = (await api<{ versions: unknown[] }>(page, "GET", `/transcriptions/${id}`)).body.versions
    .length;
  await page.getByTestId("save-version").click();
  await expect
    .poll(
      async () =>
        (await api<{ versions: unknown[] }>(page, "GET", `/transcriptions/${id}`)).body.versions.length,
    )
    .toBe(before + 1);
});

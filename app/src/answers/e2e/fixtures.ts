// Inputs and helpers for the answers specs: the fake-microphone WAVs (Chromium reads a 16-bit PCM mono file from an
// absolute path and loops it while the fake device is open), the gallery URL, and a console-error collector.
import { mkdirSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { REPO_ROOT } from "../../../../e2e/support/stack.ts";

export const FIXTURE_DIR = `${REPO_ROOT}test-results/stacks/answers-fixtures`;
export const GALLERY = "/src/answers/dev/gallery.html";
export const SHOTS = `${REPO_ROOT}app/src/answers/e2e/screenshots`;

/** A4, and A♯4 (a semitone sharp): 0.3 s of near-silence, then a steady sine. */
export const MIC_FILES = { a4: "sing-a4-440.wav", sharp: "sing-a4-sharp-466.wav" } as const;

function wav(hz: number, seconds: number, sampleRate = 48000): Uint8Array {
  const lead = Math.round(0.3 * sampleRate);
  const n = lead + Math.round(seconds * sampleRate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  const fade = Math.round(0.01 * sampleRate);
  for (let i = 0; i < n; i++) {
    let x = 0;
    if (i >= lead) {
      const k = i - lead;
      const env = Math.min(1, k / fade, (n - lead - k) / fade);
      x = 0.5 * env * Math.sin((2 * Math.PI * hz * k) / sampleRate);
    } else x = (((i * 7919) % 101) / 101 - 0.5) * 0.0006; // ≈ −70 dBFS noise
    v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(x * 32767))), true);
  }
  return new Uint8Array(buf);
}

export function writeMicFixtures(): void {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(`${FIXTURE_DIR}/${MIC_FILES.a4}`, wav(440, 8));
  writeFileSync(`${FIXTURE_DIR}/${MIC_FILES.sharp}`, wav(440 * 2 ** (1 / 12), 8));
}

/** Chromium flags for a fake microphone fed from one of the WAVs. */
export function fakeMicArgs(file: string): string[] {
  return [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${FIXTURE_DIR}/${file}`,
  ];
}

/** Console errors and page errors (a widget must never log one). */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // Vite's first start on a port re-optimises dependencies once and reloads (504 "Outdated Optimize Dep").
    if (m.type() === "error" && !m.text().includes("Outdated Optimize Dep"))
      errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Opens the gallery (optionally one widget) and waits until the analysed melody is in. */
export async function openGallery(page: Page, query = ""): Promise<void> {
  const q = query ? `${query}&pin=1` : "?pin=1";
  await page.goto(`${GALLERY}${q}`);
  await page.locator("main[data-ready='1']").waitFor({ timeout: 60_000 });
}

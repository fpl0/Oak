// Shared bits of the @oak/audio Playwright specs.
import { resolve } from "node:path";
import type { Page } from "@playwright/test";

export const MODE = process.env.OAK_AUDIO_E2E === "preview" ? "preview" : "dev";

/** Chromium flags for a deterministic fake microphone fed from a WAV file (the path must be absolute). */
export function fakeMicArgs(wav: string): string[] {
  const abs = resolve(import.meta.dirname, ".generated", wav);
  return [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${abs}`,
  ];
}

/** Opens the page and collects every page error, console error/warning and failed request. */
export async function openHarness(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`);
  });
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  await page.goto("/");
  await page.waitForFunction(() => window.oakAudioE2E?.ready === true);
  return problems;
}

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[s.length >> 1] as number) : Number.NaN;
};
export const cents = (hz: number, ref: number): number => 1200 * Math.log2(hz / ref);

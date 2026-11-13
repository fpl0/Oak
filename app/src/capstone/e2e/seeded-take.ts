// A seeded take for the release dialog (not a spec). Recording a performance is real time: the piece once, plus
// its tail (C3 is 96 s). Only a few specs have the recorder itself as their subject, and they keep the real take:
// capstone.pw.ts "C0 from the reference solution" (a real, non-silent upload, decoded), ui-review
// capstone-silent.pw.ts (a silent take refused, Stop and Esc), album capstone.pw.ts (the tab hidden mid-take) and
// the journey's C3 (e2e/journey/w5-capstones.pw.ts (d), the whole 96-second take). Every other spec that releases a
// piece is about the brief, the dialog, the album and the track page, so it gets its take from here: the dev hook
// `__oakStrudel` (import.meta.env.DEV only) has its `recorder.record` replaced, for this page only, by one that lets
// the piece play for a moment (so the dialog's "Recording … of …" line shows, and the master bus is heard: the
// app's silent-take check still runs on it) and then resolves with a WAV exactly as long as the real recorder's
// window (`recordingWindow`: bars / cps + tail), which the release then uploads through the app's own path.
import { expect, type Page } from "@playwright/test";

/** Milliseconds the piece plays before the seeded take resolves. */
export const SEEDED_TAKE_MS = 2_500;

/**
 * Replaces the recorder of the page's adapter with the seeded take. Call after the workspace's editor exists
 * (the adapter is created with it) and again after any reload. Returns nothing; the next "Record the
 * performance" uses it.
 */
export async function seedTake(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!(globalThis as { __oakStrudel?: { recorder?: unknown } }).__oakStrudel?.recorder,
    undefined,
    { timeout: 60_000 },
  );
  const installed = await page.evaluate((ms) => {
    interface Rec {
      record(opts: {
        bars: number;
        tailSec?: number;
      }): Promise<{ blob: Blob; mime: string; durationS: number }>;
      __seeded?: boolean;
    }
    const oak = (globalThis as unknown as { __oakStrudel: { recorder: Rec; transport: { cps(): number } } })
      .__oakStrudel;
    const rec = oak.recorder;
    rec.record = (opts) => {
      // The real recorder's window (packages/strudel/src/recorder.ts recordingWindow).
      const cps = oak.transport.cps() > 0 ? oak.transport.cps() : 0.5;
      const durationS = Math.max(0, opts.bars) / cps + (opts.tailSec ?? 2);
      // 8 kHz mono 16-bit PCM: a quiet 220 Hz tone for the whole length.
      const sr = 8_000;
      const n = Math.round(durationS * sr);
      const buf = new ArrayBuffer(44 + n * 2);
      const v = new DataView(buf);
      const text = (at: number, s: string) => {
        for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
      };
      text(0, "RIFF");
      v.setUint32(4, 36 + n * 2, true);
      text(8, "WAVE");
      text(12, "fmt ");
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, 1, true);
      v.setUint32(24, sr, true);
      v.setUint32(28, sr * 2, true);
      v.setUint16(32, 2, true);
      v.setUint16(34, 16, true);
      text(36, "data");
      v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++)
        v.setInt16(44 + i * 2, Math.round(0.2 * 32_767 * Math.sin((2 * Math.PI * 220 * i) / sr)), true);
      const blob = new Blob([buf], { type: "audio/wav" });
      return new Promise((resolve) => setTimeout(() => resolve({ blob, mime: "audio/wav", durationS }), ms));
    };
    rec.__seeded = true;
    return rec.__seeded;
  }, SEEDED_TAKE_MS);
  expect(installed, "the seeded take replaced the page's recorder").toBe(true);
}

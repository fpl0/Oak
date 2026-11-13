// bun packages/audio/e2e/make-fixtures-w5.bun.ts
// Wave 5 fake-microphone takes, written into e2e/.generated/ by the Wave 5 sing specs before Chromium starts (the
// fake device reads a 16-bit PCM mono WAV and loops it, so each take ends in a silent room):
//   sing-blues.wav  a blues line in C at 100 BPM: 1 ♭3 4 ♭5 5 ♭7 1, the ♭3 bent 55¢ up toward 3 (a blue third),
//                   the ♭5 sung 60¢ low toward 4, the ♭7 60¢ up toward 7.
//   sing-minor.wav  a minor answer phrase in A at 90 BPM: 1 ♭3 4 5 ♭6 5 7 1′ (me, le and ti), 10¢ sharp.
import { mkdirSync } from "node:fs";
import { type ClipPart, renderClip } from "@oak/pitch/corpus";
import { encodeWav16 } from "@oak/pitch/synth";

export const BLUES_BPM = 100;
export const BLUES_LINE: [midi: number, cents: number][] = [
  [60, 0],
  [63, 55],
  [65, 0],
  [66, -60],
  [67, 0],
  [70, 60],
  [60, 0],
];
export const MINOR_BPM = 90;
export const MINOR_LINE: [midi: number, cents: number][] = [57, 60, 62, 64, 65, 64, 68, 69].map((m) => [
  m,
  10,
]);
/** Each note lasts a beat minus this articulation gap. */
export const GAP_SEC = 0.07;
export const LEAD_SEC = 0.4;

function take(id: string, line: [number, number][], bpm: number, vowel: "a" | "o"): Uint8Array {
  const beat = 60 / bpm;
  const parts: ClipPart[] = [{ kind: "gap", sec: LEAD_SEC }];
  for (const [midi, cents] of line) {
    parts.push({ kind: "phrase", notes: [{ midi: midi + cents / 100, dur: beat - GAP_SEC }] });
    parts.push({ kind: "gap", sec: GAP_SEC });
  }
  parts.push({ kind: "gap", sec: 2.4 });
  const clip = renderClip({ id, cls: "steady", rangeLow: 48, timbre: { vowel }, parts });
  return encodeWav16(clip.samples, clip.sampleRate);
}

if (import.meta.main) {
  const dir = new URL("./.generated/", import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  await Bun.write(`${dir}sing-blues.wav`, take("e2e/sing-blues", BLUES_LINE, BLUES_BPM, "a"));
  await Bun.write(`${dir}sing-minor.wav`, take("e2e/sing-minor", MINOR_LINE, MINOR_BPM, "o"));
  console.log(`wave 5 fixtures written to ${dir}`);
}

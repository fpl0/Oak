// bun packages/audio/e2e/make-fixtures.bun.ts
// Writes the e2e inputs into e2e/.generated/: the fake-microphone WAV (Chromium reads a 16-bit PCM mono
// file, path must be absolute) and the spare IIFE worklet the page loads through `?raw` + a Blob URL. Wave 4
// adds the hummed line for hum-to-draft (hum-g.wav) and a steady C4 leak for runtime bleed (bleed-c4.wav).
import { mkdirSync } from "node:fs";
import { type ClipPart, renderClip } from "@oak/pitch/corpus";
import { concat, encodeWav16, silence, tone } from "@oak/pitch/synth";
import { buildPitchWorkletIife } from "../src/worklet-iife.bun.ts";

const dir = new URL("./.generated/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const sr = 48000;
// 0.3 s of near-silence, then a steady 440 Hz sine (the file loops while the fake device is open).
const sine = concat([
  silence(0.3, sr, -70),
  tone({ hz: 440, seconds: 3.7, sampleRate: sr, amp: 0.5, fade: 0.01 }),
]);
await Bun.write(`${dir}sine-440.wav`, encodeWav16(sine, sr));
// Wave 4, hum-to-draft: a hummed line on "oo" in G major at 96 bpm (1 2 3 5 | 5 3 1–), sung 20¢ sharp, then a
// silent room (the file loops while the fake device is open, so a whole pass follows a silence).
const beat = 60 / 96;
const line: [number, number][] = [
  [67, 1],
  [69, 1],
  [71, 1],
  [74, 1],
  [74, 1],
  [71, 1],
  [67, 2],
];
const parts: ClipPart[] = [{ kind: "gap", sec: 0.4 }];
for (const [midi, beats] of line) {
  parts.push({ kind: "phrase", notes: [{ midi: midi + 0.2, dur: beats * beat - 0.07 }] });
  parts.push({ kind: "gap", sec: 0.07 });
}
parts.push({ kind: "gap", sec: 2.2 });
const hum = renderClip({ id: "e2e/hum-g", cls: "steady", rangeLow: 48, timbre: { vowel: "u" }, parts });
await Bun.write(`${dir}hum-g.wav`, encodeWav16(hum.samples, hum.sampleRate));
// Wave 4, runtime bleed: what leaky speakers put into the mic while Oak plays C4 — a C4 with a few harmonics at
// about −32 dBFS, steady (the "learner" never sings anything else).
const c4 = tone({
  hz: 440 * 2 ** ((60 - 69) / 12),
  seconds: 12,
  sampleRate: sr,
  wave: "saw",
  amp: 0.035,
  fade: 0.01,
});
await Bun.write(`${dir}bleed-c4.wav`, encodeWav16(c4, sr));
await Bun.write(`${dir}pitch.worklet.iife.js`, await buildPitchWorkletIife());
console.log(`e2e fixtures written to ${dir}`);

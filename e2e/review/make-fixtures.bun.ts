// bun e2e/review/make-fixtures.bun.ts — fake-microphone WAVs for the review suite (Chromium restarts the file at
// every capture open): `hold-c4.wav` is a voice holding C4 (home in C) from the first instant for 20 s, so a sing
// take hears its note whenever it opens. The Wave 3 voice review adds the wrong ways to sing it (below) and a silent
// room (`silent.wav` is the onboarding suite's).
import { mkdirSync, writeFileSync } from "node:fs";
import { concat, encodeWav16, silence, tone } from "@oak/pitch/synth";

const dir = new URL("./.generated/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const sr = 48000;
const c4 = tone({
  hz: 261.6256,
  seconds: 20,
  sampleRate: sr,
  amp: 0.35,
  wave: "voice",
  fade: 0.02,
  vibratoCents: 6,
});
writeFileSync(`${dir}hold-c4.wav`, encodeWav16(concat([silence(0.05, sr, -70), c4]), sr));

// Wave 3 review (notation and voice): the ways a learner sings a held home note wrong. Each is 20 s long (a take
// opens the file again from the start).
const C4 = 261.6256;
const voice = (hz: number, seconds: number, extra: Partial<Parameters<typeof tone>[0]> = {}) =>
  tone({ hz, seconds, sampleRate: sr, amp: 0.35, wave: "voice", fade: 0.02, vibratoCents: 6, ...extra });
const cents = (c: number) => C4 * 2 ** (c / 1200);
const w3: Record<string, Float32Array> = {
  // A whole take sung 60 cents flat or sharp: outside every rung of the ladder, close enough to read as home.
  "flat-c4.wav": concat([silence(0.05, sr, -70), voice(cents(-60), 20)]),
  "sharp-c4.wav": concat([silence(0.05, sr, -70), voice(cents(60), 20)]),
  // An octave below (a low voice): octave-folded, always accepted.
  "octave-c3.wav": concat([silence(0.05, sr, -70), voice(C4 / 2, 20)]),
  // Late: six seconds of quiet room before the voice comes in.
  "late-c4.wav": concat([silence(6, sr, -62), voice(C4, 14)]),
  // Too short: a 150 ms blip every two seconds, never long enough to count as a note.
  "short-c4.wav": concat(Array.from({ length: 10 }, () => concat([voice(C4, 0.15), silence(1.85, sr, -62)]))),
  // A noisy room: the voice on home under broadband noise about 15 dB below it.
  "noisy-c4.wav": voice(C4, 20, { noiseDb: -27, seed: 11 }),
};
for (const [name, samples] of Object.entries(w3)) writeFileSync(`${dir}${name}`, encodeWav16(samples, sr));
console.log(`review fixtures written to ${dir}`);

// bun e2e/review/make-fixtures.bun.ts — fake-microphone WAVs for the review suite (Chromium restarts the file at
// every capture open): `hold-c4.wav` is a voice holding C4 (home in C) from the first instant for 20 s, so a sing
// take hears its note whenever it opens.
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
console.log(`review fixtures written to ${dir}`);

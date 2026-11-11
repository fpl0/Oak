// bun packages/audio/e2e/make-fixtures.bun.ts
// Writes the e2e inputs into e2e/.generated/: the fake-microphone WAV (Chromium reads a 16-bit PCM mono
// file, path must be absolute) and the spare IIFE worklet the page loads through `?raw` + a Blob URL.
import { mkdirSync } from "node:fs";
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
await Bun.write(`${dir}pitch.worklet.iife.js`, await buildPitchWorkletIife());
console.log(`e2e fixtures written to ${dir}`);

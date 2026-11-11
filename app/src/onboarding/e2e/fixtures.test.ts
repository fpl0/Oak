// The fake-mic WAV says what the specs assume: the real @oak/pitch maths, fed the file as the worklet would,
// finds a quiet start, both ends of the range, the home note, and a sing latency near 80 ms.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { PitchFrame } from "@oak/pitch";
import {
  calibrateTapLatency,
  estimateRange,
  firstSingPasses,
  PitchFrameAnalyzer,
  pitchFramesToNotes,
  rmsDb,
  WINDOW_SIZE,
} from "@oak/pitch";
import { decodeWav16 } from "@oak/pitch/synth";
import { NOISE_OK_DB } from "../../voice/logic.ts";

const file = new URL("./.generated/voice.wav", import.meta.url).pathname;

test("voice.wav drives every measurement the way the specs expect", async () => {
  await import("./make-fixtures.bun.ts");
  const { samples, sampleRate } = decodeWav16(new Uint8Array(readFileSync(file)));
  const a = new PitchFrameAnalyzer(sampleRate);
  const frames: PitchFrame[] = [];
  for (let i = 0; i < samples.length; i += 128)
    frames.push(...a.push(samples.subarray(i, i + 128), i / sampleRate));
  const within = (from: number, to: number) => frames.filter((f) => f.t >= from && f.t <= to);
  // Noise floor window (0.2–3.2 s): quiet.
  const quiet = within(0.25, 3.2)
    .map((f) => rmsDb(f.rms))
    .sort((x, y) => x - y);
  expect(quiet[quiet.length >> 1] as number).toBeLessThan(NOISE_OK_DB);
  // Range sweep (first 10 s): A2 to E4.
  const r = estimateRange(within(0, 10));
  expect(r?.low).toBe(45);
  expect(r?.high).toBe(64);
  // First sing: passes once C4 is held (after 7 s), not before.
  const profile = {
    rangeLow: 45,
    rangeHigh: 64,
    comfLow: 49,
    comfHigh: 61,
    tapLatencyMs: 0,
    tapJitterMs: 0,
    singLatencyMs: 0,
    singTolCents: 70 as const,
    singTolMode: "auto" as const,
    noiseFloorDb: -70,
    outputKind: "wired" as const,
    inputKind: "builtin" as const,
    quiet: false,
  };
  expect(firstSingPasses(within(0, 6.9), 60, profile)).toBe(false);
  expect(firstSingPasses(within(0, 8.5), 60, profile)).toBe(true);
  // Sing latency: notes against clicks at 1 + 0.75 k.
  const notes = pitchFramesToNotes(within(0, 6.95), {
    minNoteSec: 0.07,
    windowSec: WINDOW_SIZE / sampleRate,
  });
  const clicks = Array.from({ length: 8 }, (_, k) => 1 + 0.75 * k);
  const lat = calibrateTapLatency(
    notes.map((n) => n.start),
    clicks,
  ).latencyMs;
  expect(lat).toBeGreaterThan(40);
  expect(lat).toBeLessThan(140);
});

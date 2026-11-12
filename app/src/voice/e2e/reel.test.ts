// The reel the browser gate plays through Chromium's fake microphone: the same file, decoded and run through the
// worklet DSP path in Bun, passes the gate, and the alignment finds where it starts. If the browser spec fails
// while this passes, the difference is the browser path (resampling, the worklet, timing), not the reel.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { type PitchFrame, PitchFrameAnalyzer } from "@oak/pitch";
import { formatGateTable } from "@oak/pitch/gate";
import { decodeWav16 } from "@oak/pitch/synth";
import { alignReel, type ReelMeta, reelClips, scoreReel } from "./reel.ts";

test("reel.wav passes the gate through the worklet DSP path, and aligns to where it starts", async () => {
  await import("./make-fixtures.bun.ts");
  const dir = new URL("./.generated/", import.meta.url).pathname;
  const meta = JSON.parse(readFileSync(`${dir}reel.json`, "utf8")) as ReelMeta;
  const { samples, sampleRate } = decodeWav16(new Uint8Array(readFileSync(`${dir}reel.wav`)));
  // As if the file started 0.4 s into the context's life.
  const start = 0.4;
  const a = new PitchFrameAnalyzer(sampleRate);
  const frames: PitchFrame[] = [];
  for (let i = 0; i + 128 <= samples.length; i += 128)
    frames.push(...a.push(samples.subarray(i, i + 128), start + i / sampleRate));
  const clips = reelClips();
  const offset = alignReel(frames, clips, meta, 0, 1);
  expect(Math.abs(offset - start)).toBeLessThan(0.011);
  const report = scoreReel(frames, clips, meta, offset);
  console.log(`\nReel through the DSP path in Bun:\n${formatGateTable(report)}\n`);
  expect(report.failures).toEqual([]);
}, 60_000);

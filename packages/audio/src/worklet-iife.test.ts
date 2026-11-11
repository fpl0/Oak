// The spare worklet loader: one self-contained IIFE with no imports, no `self`/`process` at top level.
import { expect, setDefaultTimeout, test } from "bun:test";
import { buildPitchWorkletIife } from "./worklet-iife.bun.ts";

setDefaultTimeout(20_000);

test("the pitch worklet bundles into one self-contained IIFE that registers 'oak-pitch'", async () => {
  const code = await buildPitchWorkletIife({ minify: false });
  expect(code).toContain('registerProcessor("oak-pitch"');
  expect(code).not.toMatch(/^\s*import\s/m);
  expect(code).not.toMatch(/\bfrom\s+["']/);
  expect(code.length).toBeLessThan(60_000);
  // It runs in a scope with only the AudioWorklet globals and registers its processor.
  const registered: string[] = [];
  class AudioWorkletProcessor {
    port = { postMessage() {}, onmessage: null };
  }
  const run = new Function(
    "sampleRate",
    "currentTime",
    "AudioWorkletProcessor",
    "registerProcessor",
    "self",
    "process",
    "performance",
    code,
  );
  run(
    48000,
    0,
    AudioWorkletProcessor,
    (name: string) => registered.push(name),
    undefined,
    undefined,
    undefined,
  );
  expect(registered).toEqual(["oak-pitch"]);
});

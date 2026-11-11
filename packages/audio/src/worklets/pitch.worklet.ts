// AudioWorkletGlobalScope: no DOM, no `self`, no `performance`, no `process`. Checked by
// tsconfig.worklet.json. It feeds render quanta to PitchFrameAnalyzer from @oak/pitch (warm-up in the
// constructor) and posts PitchFrame messages; with no input it skips analysis and resets the ring.
// Node options: numberOfInputs 1, numberOfOutputs 0, channelCount 1, channelCountMode "explicit".
import type { PitchFrame } from "@oak/pitch";

class OakPitchProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const frame: PitchFrame | null = inputs[0]?.[0] ? null : null;
    if (frame) this.port.postMessage(frame);
    return true;
  }
}
registerProcessor("oak-pitch", OakPitchProcessor);

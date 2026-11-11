// AudioWorkletGlobalScope: no DOM, no `self`, no `performance`, no `process` (spike S5). Checked by
// tsconfig.worklet.json. It feeds render quanta to PitchFrameAnalyzer from `@oak/pitch/detector` (which
// imports only pitchy and pure maths) and posts one PitchFrame per 512-sample hop. With no input (no mic
// connected) it skips analysis and resets its ring, so a later session never analyses stale audio.
// Node options: numberOfInputs 1, numberOfOutputs 0, channelCount 1, channelCountMode "explicit".
// Loaded with `import url from "./worklets/pitch.worklet.ts?worker&url"` (dev: an ES module; build: a
// self-contained IIFE asset). Never `new URL("./pitch.worklet.ts", import.meta.url)`: broken in build.
import { PitchFrameAnalyzer } from "@oak/pitch/detector";

/** `processorOptions` of the node. */
interface PitchProcessorOptions {
  /** Detector runs in the constructor (JIT warm-up): the first `findPitch` costs 4 to 6 ms. Default 8. */
  warmUp?: number;
  minVolumeDb?: number;
  hopSize?: number;
}

class OakPitchProcessor extends AudioWorkletProcessor {
  private readonly analyzer: PitchFrameAnalyzer;
  private active = false;
  private alive = true;

  constructor(options?: { processorOptions?: PitchProcessorOptions }) {
    super();
    const o = options?.processorOptions ?? {};
    const analyzerOptions: { warmUp: number; minVolumeDb?: number; hopSize?: number } = {
      warmUp: o.warmUp ?? 8,
    };
    if (o.minVolumeDb !== undefined) analyzerOptions.minVolumeDb = o.minVolumeDb;
    if (o.hopSize !== undefined) analyzerOptions.hopSize = o.hopSize;
    this.analyzer = new PitchFrameAnalyzer(sampleRate, analyzerOptions);
    this.port.onmessage = (event) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === "reset") this.analyzer.reset();
      else if (data?.type === "dispose") this.alive = false;
      else if (data?.type === "ping") this.port.postMessage({ type: "pong", sampleRate });
    };
  }

  process(inputs: Float32Array[][]): boolean {
    // inputs[0] has no channels while nothing is connected: idle, and drop the ring.
    const channel = inputs[0]?.[0];
    if (!channel) {
      if (this.active) {
        this.active = false;
        this.analyzer.reset();
      }
      return this.alive;
    }
    this.active = true;
    const frames = this.analyzer.push(channel, currentTime);
    for (const frame of frames) this.port.postMessage(frame);
    return this.alive;
  }
}

registerProcessor("oak-pitch", OakPitchProcessor);

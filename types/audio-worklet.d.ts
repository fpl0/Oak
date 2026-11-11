// AudioWorkletGlobalScope globals. They are not in lib.dom and the scope has no `self`, `performance`
// or `process` (spike S5). Only tsconfig.worklet.json includes this file.
declare const sampleRate: number;
declare const currentTime: number;
declare const currentFrame: number;

interface OakWorkletMessagePort {
  postMessage(message: unknown, transfer?: unknown[]): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

declare abstract class AudioWorkletProcessor {
  readonly port: OakWorkletMessagePort;
  constructor(options?: { numberOfInputs?: number; numberOfOutputs?: number; processorOptions?: unknown });
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processor: new (options?: never) => AudioWorkletProcessor,
): void;

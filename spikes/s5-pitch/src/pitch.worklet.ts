/**
 * S5 spike — AudioWorkletProcessor 'oak-pitch'.
 * Thin shell around PitchFrameAnalyzer (pure, unit-tested). Posts one PitchFrame per 512-sample hop.
 *
 * Loaded with:  import url from './pitch.worklet.ts?worker&url';  await ctx.audioWorklet.addModule(url);
 * Node:         new AudioWorkletNode(ctx, 'oak-pitch', { numberOfInputs: 1, numberOfOutputs: 0,
 *                 channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' })
 */
import { type DetectorOptions, PitchFrameAnalyzer } from './pitch.ts';

// AudioWorkletGlobalScope is not in lib.dom — declare the bits we use.
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(name: string, ctor: new (options?: any) => AudioWorkletProcessor): void;

export interface PitchWorkletOptions extends DetectorOptions {
  hop?: number;
  /** detector calls to run in the constructor (JIT warm-up). 0 = none. */
  warmUp?: number;
}

class OakPitchProcessor extends AudioWorkletProcessor {
  private readonly analyzer: PitchFrameAnalyzer;
  private readonly post = (f: unknown) => this.port.postMessage(f);
  // spike-only instrumentation
  private active = false;
  private blocks = 0;
  private emptyBlocks = 0;
  private busyMs = 0;
  private maxBlockMs = 0;
  private maxAtBlock = -1;
  private warmUpMs = 0;
  private hist = [0, 0, 0, 0]; // blocks whose Date.now() delta was 0, 1, 2, >=3 ms

  constructor(options?: { processorOptions?: PitchWorkletOptions }) {
    super();
    const o = options?.processorOptions ?? {};
    this.analyzer = new PitchFrameAnalyzer(sampleRate, o);
    const w0 = Date.now();
    if (o.warmUp) this.analyzer.warmUp(o.warmUp);
    this.warmUpMs = Date.now() - w0;
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data === 'bench') {
        // spike-only: warm per-call cost measured INSIDE AudioWorkletGlobalScope (blocks the render thread ~0.3 s)
        const N = 2000;
        const b0 = Date.now();
        this.analyzer.warmUp(N);
        this.port.postMessage({ type: 'bench', n: N, usPerCall: ((Date.now() - b0) / N) * 1000 });
        return;
      }
      if (e.data === 'stats') {
        this.port.postMessage({
          type: 'stats',
          sampleRate,
          blocks: this.blocks,
          emptyBlocks: this.emptyBlocks,
          busyMs: this.busyMs,
          maxBlockMs: this.maxBlockMs,
          maxAtBlock: this.maxAtBlock,
          warmUpMs: this.warmUpMs,
          hist: this.hist,
          clock: typeof (globalThis as any).performance?.now === 'function' ? 'performance.now' : 'Date.now',
          globals: {
            self: typeof (globalThis as any).self,
            performance: typeof (globalThis as any).performance,
            viteDefines: typeof (globalThis as any).__vite_ssr_import__,
            process: typeof (globalThis as any).process,
          },
        });
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    // inputs[0] has ZERO channels while nothing is connected (or the upstream node is inactive).
    // Idle = no analysis, no messages; drop the ring so a later reconnect never analyses stale audio.
    const ch = inputs[0]?.[0];
    this.blocks++;
    if (!ch) {
      this.emptyBlocks++;
      if (this.active) {
        this.active = false;
        this.analyzer.reset();
      }
      return true; // keep the processor alive across mic sessions
    }
    this.active = true;
    const t0 = Date.now(); // spike-only timing; `performance` does not exist in AudioWorkletGlobalScope
    this.analyzer.push(ch, currentFrame, this.post);
    const dt = Date.now() - t0;
    this.busyMs += dt;
    const bin = Math.min(3, Math.round(dt));
    this.hist[bin] = (this.hist[bin] ?? 0) + 1;
    if (dt > this.maxBlockMs) {
      this.maxBlockMs = dt;
      this.maxAtBlock = this.blocks;
    }
    return true;
  }
}

registerProcessor('oak-pitch', OakPitchProcessor);

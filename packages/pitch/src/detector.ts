// The detector and the worklet's ring buffer. This file is what the AudioWorklet imports
// (`@oak/pitch/detector`): it must stay free of `self`, `performance`, `process` and of every other
// module of this package except the pure maths, because in Vite dev the worklet loads its imports as
// ES modules one by one.
import { PitchDetector } from "pitchy";
import { rmsOf } from "./math.ts";
import type { Detector, DetectorOptions, PitchFrame } from "./types.ts";
import { HOP_SIZE, WINDOW_SIZE } from "./types.ts";

/** Default RMS gate of the detector, dBFS (amplitude convention). */
export const MIN_VOLUME_DB = -45;

/**
 * pitchy McLeod detector with the two gates spike S5 found missing:
 *  - the volume gate is set through `minVolumeAbsolute = 10 ** (dB / 20)`; pitchy's own
 *    `minVolumeDecibels` uses the power convention and would gate at −90 dBFS;
 *  - an estimate whose period does not fit `minPeriods` times in the window is rejected: on pure noise
 *    pitchy reports clarity ≥ 0.9 at lag ≈ windowSize − 2 for a few percent of the frames.
 */
export function createDetector(options: DetectorOptions = {}): Detector {
  const windowSize = options.windowSize ?? WINDOW_SIZE;
  const detector = PitchDetector.forFloat32Array(windowSize);
  detector.minVolumeAbsolute = 10 ** ((options.minVolumeDb ?? MIN_VOLUME_DB) / 20);
  const minPeriods = options.minPeriods ?? 2;
  return {
    windowSize,
    detect(buf, sampleRate) {
      const [hz, clarity] = detector.findPitch(buf as Float32Array, sampleRate);
      if (!(hz >= (minPeriods * sampleRate) / windowSize) || !Number.isFinite(clarity)) {
        return { hz: 0, clarity: 0 };
      }
      return { hz, clarity: Math.min(1, Math.max(0, clarity)) };
    },
  };
}

const NO_FRAMES: PitchFrame[] = [];

/**
 * The worklet's ring buffer: push render quanta, get a frame every `hopSize` samples once a full window
 * has arrived. `reset()` empties the ring, so a reconnect never analyses stale audio. `warmUp` runs the
 * detector that many times in the constructor: the first `findPitch` in a fresh realm costs 4 to 6 ms,
 * more than one render quantum, and must not be paid at the first hop of a sing step.
 */
export class PitchFrameAnalyzer {
  readonly sampleRate: number;
  readonly windowSize: number;
  readonly hopSize: number;
  private readonly ring: Float32Array;
  private readonly scratch: Float32Array;
  private readonly detector: Detector;
  private writePos = 0;
  private filled = 0;
  private sinceHop = 0;

  constructor(sampleRate: number, options: DetectorOptions & { hopSize?: number; warmUp?: number } = {}) {
    if (!(sampleRate > 0)) throw new RangeError(`PitchFrameAnalyzer: bad sample rate ${sampleRate}`);
    this.sampleRate = sampleRate;
    this.windowSize = options.windowSize ?? WINDOW_SIZE;
    this.hopSize = options.hopSize ?? HOP_SIZE;
    if (!(this.hopSize > 0) || !(this.windowSize > 1)) throw new RangeError("PitchFrameAnalyzer: bad geometry");
    this.ring = new Float32Array(this.windowSize);
    this.scratch = new Float32Array(this.windowSize);
    this.detector = createDetector(options);
    if (options.warmUp && options.warmUp > 0) this.warmUp(options.warmUp);
  }

  /**
   * `time` is the context time of the first sample of `block`. Returns the frames completed by this
   * block (usually none: do not keep or mutate the returned array, the empty one is shared).
   */
  push(block: Float32Array, time: number): PitchFrame[] {
    const n = this.windowSize;
    const ring = this.ring;
    let out = NO_FRAMES;
    for (let i = 0; i < block.length; i++) {
      ring[this.writePos] = block[i] as number;
      this.writePos = this.writePos + 1 === n ? 0 : this.writePos + 1;
      if (this.filled < n) this.filled++;
      if (++this.sinceHop >= this.hopSize) {
        this.sinceHop = 0;
        if (this.filled === n) {
          if (out === NO_FRAMES) out = [];
          out.push(this.analyze(time + (i + 1) / this.sampleRate));
        }
      }
    }
    return out;
  }

  private analyze(t: number): PitchFrame {
    const n = this.windowSize;
    const head = n - this.writePos; // the oldest sample lives at writePos
    this.scratch.set(this.ring.subarray(this.writePos), 0);
    this.scratch.set(this.ring.subarray(0, this.writePos), head);
    const { hz, clarity } = this.detector.detect(this.scratch, this.sampleRate);
    return { t, hz, clarity, rms: rmsOf(this.scratch) };
  }

  /** Runs the detector `n` times on a synthetic tone without touching the ring (JIT warm-up). */
  warmUp(n = 8): void {
    const s = this.scratch;
    for (let i = 0; i < s.length; i++) s[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / this.sampleRate);
    for (let i = 0; i < n; i++) this.detector.detect(s, this.sampleRate);
    s.fill(0);
  }

  reset(): void {
    this.ring.fill(0);
    this.writePos = 0;
    this.filled = 0;
    this.sinceHop = 0;
  }
}

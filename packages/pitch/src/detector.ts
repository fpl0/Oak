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
  const octaveCheck = options.octaveCheck ?? true;
  const hann = new Float32Array(windowSize);
  for (let i = 0; i < windowSize; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (windowSize - 1));
  return {
    windowSize,
    detect(buf, sampleRate) {
      const [hz, clarity] = detector.findPitch(buf as Float32Array, sampleRate);
      if (!(hz >= (minPeriods * sampleRate) / windowSize) || !Number.isFinite(clarity)) {
        return { hz: 0, clarity: 0 };
      }
      if (octaveCheck && clarity >= OCTAVE_CHECK_MIN_CLARITY) {
        const lower = octaveBelow(buf, hz, sampleRate, hann);
        if (lower !== null) return { hz: hz / 2, clarity: Math.min(1, Math.max(0, lower)) };
      }
      return { hz, clarity: Math.min(1, Math.max(0, clarity)) };
    },
  };
}

/** Estimates below this clarity are not worth the octave check (the tracker drops them anyway). */
const OCTAVE_CHECK_MIN_CLARITY = 0.8;
/** The lowest pitch the octave check may move an estimate down to, Hz. */
const OCTAVE_CHECK_MIN_HZ = 60;

/** Normalised correlation of `x[i]` with `x[i + lag]` over `i ∈ [0, n)` (McLeod's NSDF term on a fixed span). */
function corrAt(x: ArrayLike<number>, lag: number, n: number): number {
  let acf = 0;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] as number;
    const b = x[i + lag] as number;
    acf += a * b;
    m += a * a + b * b;
  }
  return m > 0 ? (2 * acf) / m : 0;
}
/** The correlation peak near a fractional `lag`: the best integer lag within ±1, refined by a parabola. */
function bestCorrNear(x: ArrayLike<number>, lag: number, n: number): number {
  const c = Math.round(lag);
  const v = [
    corrAt(x, c - 2, n),
    corrAt(x, c - 1, n),
    corrAt(x, c, n),
    corrAt(x, c + 1, n),
    corrAt(x, c + 2, n),
  ];
  let k = 1;
  for (let i = 2; i <= 3; i++) if ((v[i] as number) > (v[k] as number)) k = i;
  const a = v[k - 1] as number;
  const b = v[k] as number;
  const d = v[k + 1] as number;
  const den = a - 2 * b + d;
  // A vertex inside the bracket; a flat or inverted parabola keeps the sample.
  return den < 0 ? b - ((a - d) * (a - d)) / (8 * den) : b;
}
/** Goertzel power at `hz` of the Hann-windowed buffer. */
function powerAt(x: ArrayLike<number>, hz: number, sampleRate: number, hann: Float32Array): number {
  const c = 2 * Math.cos((2 * Math.PI * hz) / sampleRate);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < hann.length; i++) {
    const s0 = (x[i] as number) * (hann[i] as number) + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

/**
 * The weak-fundamental octave trap (Wave 3 corpus): when the odd harmonics of a sung note are weak (a dark
 * vowel, a fundamental 20–30 dB down, a formant on the second harmonic), the waveform repeats almost every half
 * period and McLeod's "first peak above 0.9 of the best" picks half the true period: an octave too high, for a
 * whole note. Odd harmonics anti-correlate at the half period and correlate at the full one; noise and vibrato
 * do neither (noise lowers both alike, vibrato lowers the longer lag more). So, on one span of samples:
 *   ρ = (c(2τ) − c(τ)) / (1 − c(τ))
 * is near 1 when the missing correlation at τ is explained by period 2τ, near 0 for noise, negative for vibrato.
 * The estimate moves down an octave when ρ ≥ 0.7, or when ρ ≥ 0.2 and there is real energy halfway between the
 * harmonics (the odd harmonics of the lower pitch: ≥ 1.2·10⁻³ of the harmonic energy, about −29 dB).
 * Returns the clarity at 2τ when the estimate should move down, else null.
 */
function octaveBelow(
  x: ArrayLike<number>,
  hz: number,
  sampleRate: number,
  hann: Float32Array,
): number | null {
  const tau = sampleRate / hz;
  const N = hann.length;
  // Both lags need room: 2τ at most half the window, and the lower pitch inside the voice.
  if (2 * tau > N / 2 || hz / 2 < OCTAVE_CHECK_MIN_HZ) return null;
  const n = N - Math.round(2 * tau) - 3;
  const c1 = bestCorrNear(x, tau, n);
  const c2 = bestCorrNear(x, 2 * tau, n);
  // The longer lag must explain clearly more of the signal (≥ 0.1 % of its energy): a pure tone has
  // c(τ) ≈ c(2τ) ≈ 1, and their tiny difference says nothing about the octave.
  if (!(c2 - c1 >= 1e-3)) return null;
  const rho = (c2 - c1) / Math.max(1e-9, 1 - c1);
  if (rho >= 0.7) return c2;
  if (rho < 0.2) return null;
  let harm = 0;
  let sub = 0;
  for (let m = 1; m <= 4; m++) {
    if (m * hz < sampleRate / 2) harm += powerAt(x, m * hz, sampleRate, hann);
    sub += powerAt(x, (m - 0.5) * hz, sampleRate, hann);
  }
  return harm > 0 && sub / harm >= 1.2e-3 ? c2 : null;
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
    if (!(this.hopSize > 0) || !(this.windowSize > 1))
      throw new RangeError("PitchFrameAnalyzer: bad geometry");
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
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(this.scratch[i] as number);
      if (a > peak) peak = a;
    }
    return { t, hz, clarity, rms: rmsOf(this.scratch), peak };
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

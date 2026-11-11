/**
 * S5 spike — pure pitch module (no DOM, no Bun APIs, no AudioWorklet globals).
 * Imported by: bun tests, the AudioWorklet (pitch.worklet.ts) and the main thread (PitchTracker).
 */
import { PitchDetector } from 'pitchy';

export const WINDOW_SIZE = 2048;
export const HOP_SIZE = 512;

export interface PitchFrame {
  /** AudioContext time (s) of the LAST sample in the analysis window. Window centre = time - windowSize/2/sampleRate. */
  time: number;
  /** Detected fundamental in Hz; 0 when pitchy bails out (below min volume / no key maximum). */
  hz: number;
  /** MPM clarity 0..1 (0 when below min volume). */
  clarity: number;
  /** Linear RMS of the analysis window (0..1 for full-scale float audio). */
  rms: number;
}

export interface DetectorOptions {
  windowSize?: number;
  /**
   * RMS gate in dBFS, AMPLITUDE convention (20*log10). Default -45.
   * NOTE: pitchy's own `minVolumeDecibels` setter uses 10**(db/10) (power convention), so
   * `detector.minVolumeDecibels = -45` really gates at -90 dBFS. We set `minVolumeAbsolute` instead.
   */
  minVolumeDb?: number;
  /**
   * Reject estimates whose period does not fit this many times in the window (default 2).
   * pitchy 4.1 reports clarity ~1.0 at lag ~= windowSize-2 for a few % of pure-noise frames
   * (the NSDF is computed from 1-2 sample products out there), so clarity alone does not reject noise.
   */
  minPeriods?: number;
}

export interface Detector {
  readonly windowSize: number;
  detect(buf: ArrayLike<number>, sampleRate: number): { hz: number; clarity: number };
}

export function createDetector(o: DetectorOptions = {}): Detector {
  const windowSize = o.windowSize ?? WINDOW_SIZE;
  const d = PitchDetector.forFloat32Array(windowSize);
  d.minVolumeAbsolute = 10 ** ((o.minVolumeDb ?? -45) / 20);
  const minPeriods = o.minPeriods ?? 2;
  return {
    windowSize,
    detect(buf, sampleRate) {
      const [hz, clarity] = d.findPitch(buf, sampleRate);
      if (hz < (minPeriods * sampleRate) / windowSize) return { hz: 0, clarity: 0 };
      return { hz, clarity };
    },
  };
}

const detectorCache = new Map<number, Detector>();
/** Convenience one-shot: buf.length must be the window size (2048 by default). */
export function detect(buf: Float32Array, sampleRate: number): { hz: number; clarity: number } {
  let d = detectorCache.get(buf.length);
  if (!d) {
    d = createDetector({ windowSize: buf.length });
    detectorCache.set(buf.length, d);
  }
  return d.detect(buf, sampleRate);
}

export function rms(buf: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] as number;
    s += v * v;
  }
  return Math.sqrt(s / buf.length);
}

/**
 * Ring buffer + hop scheduler. This is the whole DSP body of the worklet, kept pure so `bun test`
 * exercises exactly the code that runs on the render thread.
 * Feed it blocks of any size (the worklet feeds 128-sample render quanta).
 */
export class PitchFrameAnalyzer {
  readonly windowSize: number;
  readonly hop: number;
  private readonly ring: Float32Array;
  private readonly scratch: Float32Array;
  private readonly detector: Detector;
  private writePos = 0;
  private filled = 0;
  private sinceHop = 0;

  constructor(
    readonly sampleRate: number,
    o: DetectorOptions & { hop?: number } = {},
  ) {
    this.windowSize = o.windowSize ?? WINDOW_SIZE;
    this.hop = o.hop ?? HOP_SIZE;
    this.ring = new Float32Array(this.windowSize);
    this.scratch = new Float32Array(this.windowSize);
    this.detector = createDetector(o);
  }

  /**
   * @param block samples (mono)
   * @param blockStartFrame absolute frame index of block[0] (worklet: `currentFrame`)
   * @param emit called once per hop once the window is full
   */
  push(block: ArrayLike<number>, blockStartFrame: number, emit: (f: PitchFrame) => void): void {
    const n = this.windowSize;
    const ring = this.ring;
    for (let i = 0; i < block.length; i++) {
      ring[this.writePos] = block[i] as number;
      this.writePos = (this.writePos + 1) % n;
      if (this.filled < n) this.filled++;
      if (++this.sinceHop >= this.hop) {
        this.sinceHop = 0;
        if (this.filled === n) emit(this.analyze((blockStartFrame + i + 1) / this.sampleRate));
      }
    }
  }

  private analyze(time: number): PitchFrame {
    const n = this.windowSize;
    const head = n - this.writePos; // oldest sample lives at writePos
    this.scratch.set(this.ring.subarray(this.writePos), 0);
    this.scratch.set(this.ring.subarray(0, this.writePos), head);
    const { hz, clarity } = this.detector.detect(this.scratch, this.sampleRate);
    return { time, hz, clarity, rms: rms(this.scratch) };
  }

  /**
   * JIT warm-up: run the detector `n` times on a synthetic tone without touching the ring.
   * The first findPitch in a fresh realm costs ~4 ms in V8 (more than one 2.67 ms render quantum);
   * call this from the processor constructor so that cost is paid when the node is created, not mid-phrase.
   */
  warmUp(n = 8): void {
    const s = this.scratch;
    for (let i = 0; i < s.length; i++) s[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / this.sampleRate);
    for (let i = 0; i < n; i++) this.detector.detect(s, this.sampleRate);
  }

  reset(): void {
    this.ring.fill(0);
    this.writePos = 0;
    this.filled = 0;
    this.sinceHop = 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Pitch maths

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function hzToMidi(hz: number, a4 = 440): number {
  return 69 + 12 * Math.log2(hz / a4);
}
export function midiToHz(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}
export function midiToNoteName(midi: number): string {
  const m = Math.round(midi);
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/**
 * Cents of `hz` relative to `targetHz`. With foldOctaves the result is wrapped into [-600, 600)
 * and `octaveOffset` reports how many octaves were removed (e.g. singing A3 against A4 => -1).
 */
export function centsVsTarget(
  hz: number,
  targetHz: number,
  o: { foldOctaves?: boolean } = {},
): { cents: number; octaveOffset: number } {
  const raw = 1200 * Math.log2(hz / targetHz);
  if (!o.foldOctaves) return { cents: raw, octaveOffset: 0 };
  const octaveOffset = Math.round(raw / 1200);
  return { cents: raw - 1200 * octaveOffset, octaveOffset };
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

// ---------------------------------------------------------------------------------------------
// Tracker (main thread, pure)

export interface TrackerOptions {
  clarityMin?: number; // 0.9
  rmsMinDb?: number; // -45
  median?: number; // 5
  a4?: number; // 440
  minHz?: number; // 60
  maxHz?: number; // 1600
  /** new note when the smoothed pitch deviates more than this from the segment median ... */
  splitCents?: number; // 70
  /** ... for at least this many consecutive voiced frames */
  splitFrames?: number; // 3
  /** unvoiced frames that close a note */
  gapFrames?: number; // 3
  /** shortest note kept (seconds) */
  minNoteSec?: number; // 0.12
}

export interface TrackedFrame {
  t: number;
  voiced: boolean;
  /** raw detector Hz (0 when unvoiced) */
  hz: number;
  /** median-smoothed fractional MIDI, null when unvoiced */
  midi: number | null;
}

export interface NoteSegment {
  start: number;
  end: number;
  /** median fractional MIDI over the segment */
  midi: number;
  hz: number;
  note: string;
  /** deviation from the nearest equal-tempered note, in cents */
  cents: number;
  frames: number;
}

interface OpenSegment {
  start: number;
  end: number;
  values: number[];
}

export class PitchTracker {
  private readonly o: Required<TrackerOptions>;
  private window: number[] = [];
  private unvoicedRun = 0;
  private seg: OpenSegment | null = null;
  private pending: { t: number; midi: number }[] = [];
  private closed: NoteSegment[] = [];

  constructor(o: TrackerOptions = {}) {
    this.o = {
      clarityMin: 0.9,
      rmsMinDb: -45,
      median: 5,
      a4: 440,
      minHz: 60,
      maxHz: 1600,
      splitCents: 70,
      splitFrames: 3,
      gapFrames: 3,
      minNoteSec: 0.12,
      ...o,
    };
  }

  push(f: PitchFrame): TrackedFrame {
    const o = this.o;
    const rmsDb = f.rms > 0 ? 20 * Math.log10(f.rms) : Number.NEGATIVE_INFINITY;
    const voiced = f.clarity >= o.clarityMin && rmsDb >= o.rmsMinDb && f.hz >= o.minHz && f.hz <= o.maxHz;
    if (!voiced) {
      if (++this.unvoicedRun >= o.gapFrames) {
        this.closeSegment();
        this.window = [];
      }
      return { t: f.time, voiced: false, hz: 0, midi: null };
    }
    this.unvoicedRun = 0;
    this.window.push(hzToMidi(f.hz, o.a4));
    if (this.window.length > o.median) this.window.shift();
    const midi = median(this.window);
    this.segment(f.time, midi);
    return { t: f.time, voiced: true, hz: f.hz, midi };
  }

  private segment(t: number, midi: number): void {
    const o = this.o;
    if (!this.seg) {
      this.seg = { start: t, end: t, values: [midi] };
      return;
    }
    const ref = median(this.seg.values);
    if (Math.abs(midi - ref) * 100 > o.splitCents) {
      this.pending.push({ t, midi });
      if (this.pending.length >= o.splitFrames) {
        const p = this.pending;
        this.pending = [];
        this.closeSegment();
        this.seg = {
          start: (p[0] as { t: number }).t,
          end: t,
          values: p.map((x) => x.midi),
        };
      }
      return;
    }
    this.pending = []; // transient outliers are dropped, the note continues
    this.seg.values.push(midi);
    this.seg.end = t;
  }

  private toNote(s: OpenSegment): NoteSegment {
    const midi = median(s.values);
    const nearest = Math.round(midi);
    return {
      start: s.start,
      end: s.end,
      midi,
      hz: midiToHz(midi, this.o.a4),
      note: midiToNoteName(nearest),
      cents: (midi - nearest) * 100,
      frames: s.values.length,
    };
  }

  private closeSegment(): void {
    const s = this.seg;
    this.seg = null;
    this.pending = [];
    if (s && s.end - s.start >= this.o.minNoteSec) this.closed.push(this.toNote(s));
  }

  /** Closed notes, plus the still-open note (if long enough) when includeOpen is true. */
  segments(includeOpen = true): NoteSegment[] {
    const out = [...this.closed];
    if (includeOpen && this.seg && this.seg.end - this.seg.start >= this.o.minNoteSec) out.push(this.toNote(this.seg));
    return out;
  }

  reset(): void {
    this.window = [];
    this.unvoicedRun = 0;
    this.seg = null;
    this.pending = [];
    this.closed = [];
  }
}

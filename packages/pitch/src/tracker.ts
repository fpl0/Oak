// Tracking and segmentation (contracts §8.1 step 1): voicing gate, median of 5, octave-error repair,
// then notes. Pure and incremental: the PitchLane pushes frames as they arrive, the graders run a fresh
// tracker over the whole take.
import type { LearnerProfile } from "@oak/content-kit";
import { hzToMidi, mean, median, quantile, rmsDb } from "./math.ts";
import type { PitchFrame, SungNote, TrackedFrame, TrackerOptions } from "./types.ts";
import { HOP_SIZE, WINDOW_SIZE } from "./types.ts";

export const TRACKER_DEFAULTS: Required<TrackerOptions> = {
  clarityMin: 0.9,
  rmsMinDb: -45,
  median: 5,
  a4: 440,
  minHz: 60,
  maxHz: 1600,
  splitCents: 70,
  splitFrames: 3,
  splitWindow: 16,
  gapFrames: 3,
  minNoteSec: 0.1,
  windowSec: WINDOW_SIZE / 48000,
  octaveRepairFrames: 4,
  dipDb: 8,
};

/** A learner whose range reaches A2 or lower: fewer periods fit the window, so the clarity gate is 0.85. */
export function isLowVoice(profile: Pick<LearnerProfile, "rangeLow">): boolean {
  return Number.isFinite(profile.rangeLow) && profile.rangeLow <= 45;
}
/** The voicing gate of contracts §8.1: clarity ≥ 0.90 (0.85 for a low voice), RMS ≥ max(−45 dBFS, noise floor + 12 dB). */
export function trackerOptionsFor(
  profile: Pick<LearnerProfile, "rangeLow" | "noiseFloorDb">,
): Pick<Required<TrackerOptions>, "clarityMin" | "rmsMinDb"> {
  const floor = Number.isFinite(profile.noiseFloorDb) ? profile.noiseFloorDb + 12 : -45;
  return { clarityMin: isLowVoice(profile) ? 0.85 : 0.9, rmsMinDb: Math.max(-45, floor) };
}

interface SegFrame {
  /** Window-centre time. */
  t: number;
  midi: number;
  rms: number;
}
interface OpenSeg {
  frames: SegFrame[];
  /** Opened by a pitch change: the smoothed pitch crossed over about half a median window late. */
  lagged: boolean;
  /** Index of the first frame of a level dip, or −1. */
  dipAt: number;
}

const REF_FRAMES = 48;
/** Frames (about 260 ms, a whole cycle of a 4 Hz vibrato) the reference needs before it may leave out the frames under test. */
const MIN_REF_FRAMES = 24;

/** Range of the last `n` frames' pitch, cents. */
function heldSpread(frames: readonly SegFrame[], n: number): number {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let i = Math.max(0, frames.length - n); i < frames.length; i++) {
    const m = (frames[i] as SegFrame).midi;
    lo = Math.min(lo, m);
    hi = Math.max(hi, m);
  }
  return (hi - lo) * 100;
}

/**
 * The note's pitch: the median of its frames BEFORE the last `exclude` (the ones under test), so the frames of a new
 * pitch never pull the reference towards themselves. A note with fewer than `MIN_REF_FRAMES` frames before them uses all its frames (a part of a vibrato cycle is no reference).
 */
function refMidi(seg: OpenSeg, exclude = 0): number {
  const len = seg.frames.length;
  const to = len - exclude >= MIN_REF_FRAMES ? len - exclude : len;
  const from = Math.max(0, to - REF_FRAMES);
  const values: number[] = [];
  for (let i = from; i < to; i++) values.push((seg.frames[i] as SegFrame).midi);
  return median(values);
}
function refLevel(seg: OpenSeg): number {
  const to = seg.dipAt >= 0 ? seg.dipAt : seg.frames.length;
  const from = Math.max(0, to - REF_FRAMES);
  const values: number[] = [];
  for (let i = from; i < to; i++) values.push((seg.frames[i] as SegFrame).rms);
  return median(values);
}

/** Voicing gate, median of 5, octave-error repair (an 11 to 13 semitone jump that returns within 4 frames is folded back). */
export class PitchTracker {
  private readonly o: Required<TrackerOptions>;
  private win: number[] = [];
  private ref: number | null = null;
  private unvoicedRun = 0;
  private seg: OpenSeg | null = null;
  /** Frames in a row whose trailing mean sits off the note. */
  private pending = 0;
  /** Smoothed pitch of the last `splitWindow` frames of the open note. */
  private trail: number[] = [];
  private octRun: SegFrame[] = [];
  private octSeg: OpenSeg | null = null;
  private octSegLen = 0;
  /** The segment behind the last closed note, when a pitch split closed it (for the merge in `closeSegment`). */
  private prevSplit: OpenSeg | null = null;
  private closed: SungNote[] = [];
  private lastT: number | null = null;
  private hop = HOP_SIZE / 48000;

  constructor(options: TrackerOptions = {}) {
    const o = { ...TRACKER_DEFAULTS };
    for (const key of Object.keys(options) as (keyof TrackerOptions)[]) {
      const v = options[key];
      if (v !== undefined && Number.isFinite(v)) o[key] = v;
    }
    o.median = Math.max(1, Math.round(o.median));
    this.o = o;
  }

  push(frame: PitchFrame): TrackedFrame {
    const o = this.o;
    if (this.lastT !== null && frame.t > this.lastT && frame.t - this.lastT < 0.2)
      this.hop = frame.t - this.lastT;
    this.lastT = frame.t;
    const tc = frame.t - o.windowSec / 2;
    const voiced =
      frame.clarity >= o.clarityMin &&
      rmsDb(frame.rms) >= o.rmsMinDb &&
      frame.hz >= o.minHz &&
      frame.hz <= o.maxHz;
    if (!voiced) {
      this.noteDip(frame.rms);
      if (++this.unvoicedRun >= o.gapFrames) {
        this.closeSegment();
        this.win = [];
        this.ref = null;
        this.octRun = [];
      }
      return { t: frame.t, voiced: false, hz: 0, midi: null };
    }
    this.unvoicedRun = 0;
    const raw = hzToMidi(frame.hz, o.a4);
    let value = raw;
    if (this.ref !== null && o.octaveRepairFrames > 0) {
      const jump = raw - this.ref;
      if (Math.abs(jump) >= 11 && Math.abs(jump) <= 13) {
        if (this.octRun.length === 0) {
          this.octSeg = this.seg;
          this.octSegLen = this.seg?.frames.length ?? 0;
        }
        this.octRun.push({ t: tc, midi: raw, rms: frame.rms });
        if (this.octRun.length > o.octaveRepairFrames) {
          this.commitRegisterChange();
          return { t: frame.t, voiced: true, hz: frame.hz, midi: this.ref };
        }
        value = raw - 12 * Math.sign(jump);
      } else {
        this.octRun = [];
      }
    }
    this.win.push(value);
    if (this.win.length > o.median) this.win.shift();
    const smoothed = median(this.win);
    this.ref = smoothed;
    this.segment({ t: tc, midi: smoothed, rms: frame.rms });
    return { t: frame.t, voiced: true, hz: frame.hz, midi: smoothed };
  }

  /** The jump did not come back: it is a real change of register, so the folded frames become a new note. */
  private commitRegisterChange(): void {
    const run = this.octRun;
    this.octRun = [];
    if (this.seg !== null && this.seg === this.octSeg) {
      this.seg.frames.length = Math.min(this.seg.frames.length, this.octSegLen);
      if (this.seg.dipAt >= this.seg.frames.length) this.seg.dipAt = -1;
      if (this.seg.frames.length === 0) this.seg = null;
    } else {
      // A split happened during the run: the open note holds folded frames only.
      this.seg = null;
    }
    this.pending = 0;
    this.closeSegment();
    this.seg = { frames: run, lagged: false, dipAt: -1 };
    this.trail = run.slice(-this.o.splitWindow).map((f) => f.midi);
    this.win = run.slice(-this.o.median).map((f) => f.midi);
    this.ref = median(this.win);
  }

  private noteDip(rms: number): void {
    const seg = this.seg;
    if (!seg || this.o.dipDb <= 0 || seg.dipAt >= 0 || seg.frames.length < 3) return;
    if (rms < refLevel(seg) * 10 ** (-this.o.dipDb / 20)) seg.dipAt = seg.frames.length;
  }

  /**
   * A pitch change splits the note when the MEAN of the last `splitWindow` frames moves more than `splitCents`
   * from the note's median for `splitFrames` frames in a row. Reading single frames (Wave 3 review) cut a held
   * note with an ordinary vibrato (±60¢ at 5.5–7 Hz) into fragments shorter than `minNoteSec`: the note came
   * out 45¢ flat or vanished. The mean over ~130 ms cancels a 4–7 Hz vibrato (±90¢ at 4 Hz stays under the
   * split line); a held new pitch crosses it a few frames late, so the cut is then moved back to the first
   * frame that sits nearer the new pitch than the old one.
   */
  private segment(f: SegFrame): void {
    const o = this.o;
    const seg = this.seg;
    if (!seg) {
      this.seg = { frames: [f], lagged: false, dipAt: -1 };
      this.trail = [f.midi];
      return;
    }
    this.trail.push(f.midi);
    if (this.trail.length > o.splitWindow) this.trail.shift();
    const ref = refMidi(seg, this.trail.length);
    if (Math.abs(mean(this.trail) - ref) * 100 > o.splitCents) {
      seg.frames.push(f);
      // … and only once the new pitch is held: in the middle of a glide the last frames are still moving.
      if (++this.pending >= o.splitFrames && heldSpread(seg.frames, o.splitFrames) <= o.splitCents)
        this.splitAt(seg, ref);
      return;
    }
    this.pending = 0;
    if (o.dipDb > 0 && seg.frames.length >= 3) {
      const level = refLevel(seg);
      if (seg.dipAt < 0) {
        if (f.rms < level * 10 ** (-o.dipDb / 20)) seg.dipAt = seg.frames.length;
      } else if (f.rms >= level * 10 ** (-o.dipDb / 40)) {
        // The level came back after a dip: the same pitch, articulated again.
        seg.frames.length = seg.dipAt;
        seg.dipAt = -1;
        this.closeSegment();
        this.seg = { frames: [f], lagged: false, dipAt: -1 };
        return;
      }
    }
    seg.frames.push(f);
  }

  /**
   * Cuts the open note where the new pitch begins: among the recent frames, the change point that best fits
   * "the note's pitch, then one new level" (least squares). A vibrato on the new note makes any few frames a
   * poor guess of its level, so the cut is made only when the new level, averaged from the change point on,
   * is itself more than `splitCents` away; otherwise the next frame tries again.
   */
  private splitAt(seg: OpenSeg, ref: number): void {
    const o = this.o;
    const frames = seg.frames;
    const lowest = Math.max(0, frames.length - o.splitWindow - o.splitFrames);
    let cut = -1;
    let best = Number.POSITIVE_INFINITY;
    let level = ref;
    // Suffix sums from the end, prefix cost against the note's pitch from `lowest`.
    let sum = 0;
    let sumSq = 0;
    let before = 0;
    for (let i = lowest; i < frames.length; i++) before += ((frames[i] as SegFrame).midi - ref) ** 2;
    for (let c = frames.length - 1; c >= lowest; c--) {
      const x = (frames[c] as SegFrame).midi;
      sum += x;
      sumSq += x * x;
      before -= (x - ref) ** 2;
      const n = frames.length - c;
      if (n < o.splitFrames) continue;
      const m = sum / n;
      const cost = sumSq - n * m * m + before;
      if (cost < best) {
        best = cost;
        cut = c;
        level = m;
      }
    }
    if (cut < 0 || Math.abs(level - ref) * 100 <= o.splitCents) return;
    this.pending = 0;
    if (cut === 0) {
      // The whole note so far already sits at the new pitch: nothing to cut off.
      this.trail = frames.slice(-o.splitWindow).map((x) => x.midi);
      return;
    }
    const tail = frames.splice(cut);
    if (seg.dipAt >= frames.length) seg.dipAt = -1;
    const closed = this.closeSegment();
    this.seg = { frames: tail, lagged: true, dipAt: -1 };
    this.prevSplit = closed;
    this.trail = tail.slice(-o.splitWindow).map((x) => x.midi);
  }

  private toNote(seg: OpenSeg): SungNote | null {
    const frames = seg.frames;
    const first = frames[0];
    const last = frames[frames.length - 1];
    if (!first || !last) return null;
    const lag = seg.lagged ? Math.floor(this.o.median / 2) * this.hop : 0;
    const start = first.t - lag;
    const end = last.t;
    if (end - start < this.o.minNoteSec) return null;
    // The pitch of a note is read from its middle: scoops into it and the release are skipped.
    const from = start + 0.2 * (end - start);
    const to = end - 0.1 * (end - start);
    let core = frames.filter((f) => f.t >= from && f.t <= to).map((f) => f.midi);
    if (core.length === 0) core = frames.map((f) => f.midi);
    const midi = median(core);
    const centsSpread = quantile(
      core.map((m) => Math.abs(m - midi) * 100),
      0.9,
    );
    return { start, end, midi, centsSpread, frames: frames.length };
  }

  /**
   * Closes the open note. A note opened by a pitch split that ends up within `splitCents` of the note the split
   * closed was no change of pitch (a wide vibrato swinging past the line): the two are merged back into one.
   * Returns the segment the last closed note stands for, or null when this one made no note.
   */
  private closeSegment(): OpenSeg | null {
    const seg = this.seg;
    const prev = this.prevSplit;
    this.prevSplit = null;
    this.seg = null;
    this.pending = 0;
    if (!seg) return null;
    const note = this.toNote(seg);
    if (!note) return null;
    const last = this.closed[this.closed.length - 1];
    if (
      seg.lagged &&
      prev !== null &&
      last !== undefined &&
      Math.abs(note.midi - last.midi) * 100 < this.o.splitCents
    ) {
      const merged: OpenSeg = { frames: [...prev.frames, ...seg.frames], lagged: prev.lagged, dipAt: -1 };
      const whole = this.toNote(merged);
      if (whole) {
        this.closed[this.closed.length - 1] = whole;
        return merged;
      }
    }
    this.closed.push(note);
    return seg;
  }

  /** Notes closed so far. */
  notes(): SungNote[] {
    return [...this.closed];
  }
  /** The note being sung right now, if it is already long enough to count. It may still grow or split. */
  openNote(): SungNote | null {
    return this.seg ? this.toNote(this.seg) : null;
  }
  /** Closes the open note. Call when the take ends. */
  flush(): SungNote[] {
    this.closeSegment();
    this.win = [];
    this.ref = null;
    this.octRun = [];
    this.unvoicedRun = 0;
    return [...this.closed];
  }
  reset(): void {
    this.win = [];
    this.trail = [];
    this.prevSplit = null;
    this.ref = null;
    this.unvoicedRun = 0;
    this.seg = null;
    this.pending = 0;
    this.octRun = [];
    this.octSeg = null;
    this.closed = [];
    this.lastT = null;
  }
}

/** Segments a whole take. `frames` must be in time order. */
export function pitchFramesToNotes(frames: readonly PitchFrame[], options?: TrackerOptions): SungNote[] {
  const tracker = new PitchTracker(options);
  for (const frame of frames) tracker.push(frame);
  return tracker.flush();
}

/** Median spacing of the frames in seconds (the hop), or the 48 kHz default when it cannot be measured. */
export function hopSecOf(frames: readonly PitchFrame[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < frames.length && gaps.length < 64; i++) {
    const gap = (frames[i] as PitchFrame).t - (frames[i - 1] as PitchFrame).t;
    if (gap > 0 && gap < 0.2) gaps.push(gap);
  }
  return gaps.length > 0 ? median(gaps) : HOP_SIZE / 48000;
}

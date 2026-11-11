// Shared fixtures for the @oak/pitch tests (not a test file itself).
import type { LearnerProfile, SingTolerance, TapTolerance } from "@oak/content-kit";
import { PitchFrameAnalyzer } from "./detector.ts";
import { midiToHz } from "./math.ts";
import type { PitchFrame } from "./types.ts";
import { HOP_SIZE, WINDOW_SIZE } from "./types.ts";

export const SR = 48000;
export const HOP = HOP_SIZE / SR;
export const HALF_WINDOW = WINDOW_SIZE / 2 / SR;

export const PROFILE: LearnerProfile = {
  rangeLow: 50,
  rangeHigh: 74,
  comfLow: 53,
  comfHigh: 70,
  tapLatencyMs: 0,
  tapJitterMs: 10,
  singLatencyMs: 0,
  singTolCents: 50,
  singTolMode: "auto",
  noiseFloorDb: -70,
  outputKind: "wired",
  inputKind: "builtin",
  quiet: false,
};

export const SING_TOL: SingTolerance = {
  cents: "learner",
  octave: "per-note",
  driftCompCents: 30,
  minCoverage: 0.4,
  passHitRate: 0.8,
};
export const TAP_TOL: TapTolerance = {
  windowMs: "auto",
  tempo: "locked",
  forgiveOffset: true,
  passF1: 0.9,
  passTiming: 0.5,
};

/** Runs a signal through the exact worklet DSP path in 128-sample render quanta (t0 = 0). */
export function analyze(signal: Float32Array, sampleRate = SR): PitchFrame[] {
  const a = new PitchFrameAnalyzer(sampleRate);
  const frames: PitchFrame[] = [];
  for (let i = 0; i + 128 <= signal.length; i += 128) {
    for (const f of a.push(signal.subarray(i, i + 128), i / sampleRate)) frames.push(f);
  }
  return frames;
}

export interface Seg {
  /** Fractional MIDI, or null for silence. */
  midi: number | null;
  /** Start and end of the sound at the window CENTRE, seconds. */
  from: number;
  to: number;
  /** Cents, added per frame (vibrato etc.). */
  wobble?: (t: number) => number;
  rms?: number;
}
/**
 * Synthetic detector output: one frame per hop, `t` = time of the window's last sample, so a frame
 * describes the sound at `t − HALF_WINDOW`. Silence is clarity 0.2 at −80 dBFS.
 */
export function frames(segs: readonly Seg[], until: number, start = 0): PitchFrame[] {
  const out: PitchFrame[] = [];
  for (let t = start + HALF_WINDOW + HOP; t <= until + HALF_WINDOW + 1e-9; t += HOP) {
    const tc = t - HALF_WINDOW;
    const seg = segs.find((s) => tc >= s.from && tc < s.to);
    if (!seg || seg.midi === null) {
      out.push({ t, hz: 0, clarity: 0.2, rms: 1e-4 });
      continue;
    }
    const cents = seg.wobble ? seg.wobble(tc) : 0;
    out.push({ t, hz: midiToHz(seg.midi + cents / 100), clarity: 0.97, rms: seg.rms ?? 0.1 });
  }
  return out;
}

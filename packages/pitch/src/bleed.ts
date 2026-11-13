// Runtime bleed detection during sing steps (contracts §8.6): "voiced frames within 30¢ of the playing note for
// more than 300 ms in playback-only spans" means the microphone hears the speakers (or leaky headphones), not
// the learner. Two ways to know what was playing, one rule:
//
//  - the host lists the notes it played (`playing`, AudioContext seconds), as calibration's bleed test does;
//  - the mic session listened to Oak's own output with a second pitch analyser (`@oak/audio`
//    `MicGraphOptions.playback`) and wrote what the output had on each mic frame (`PitchFrame.playing`).
//
// "Playback-only" spans are the moments something plays while nobody is asked to sing: a target window (plus a
// margin for an early or a late singer) is never one, so singing along in tune is never called bleed.
// Pure and isomorphic: the graders, the mic session and the tests share it.
import { centsFrom, hzToMidi, rmsDb } from "./math.ts";
import { hopSecOf } from "./tracker.ts";
import type { PitchFrame, SungTarget } from "./types.ts";
import { HOP_SIZE, WINDOW_SIZE } from "./types.ts";

/** A voiced mic frame this close to what plays (cents, any octave) heard the playback. */
export const BLEED_CENTS = 30;
/** More than this much of it, in playback-only spans, is bleed. */
export const BLEED_MIN_SEC = 0.3;
/** The output reaches the mic late (output latency + the air + input latency): playback this recent counts. */
export const PLAYBACK_LAG_SEC = 0.3;
/** A frame of Oak's output counts as a pitch at this clarity and level. */
export const PLAYBACK_CLARITY = 0.85;
export const PLAYBACK_MIN_DB = -60;
/** A mic frame counts as voiced at this clarity (the tracker's own gate). */
export const BLEED_VOICED_CLARITY = 0.9;
/** Around each target window, seconds: a singer who starts early or ends late is still singing. */
export const SINGING_MARGIN_SEC = 0.25;
/** A host-listed note rings on after its end (release, room) by about this much. */
const NOTE_TAIL_SEC = 0.15;

/** The clear pitch of an output frame, or `null`. */
export function playbackPitch(frame: PitchFrame): number | null {
  if (!(frame.hz > 0) || frame.clarity < PLAYBACK_CLARITY) return null;
  if (rmsDb(frame.rms) < PLAYBACK_MIN_DB) return null;
  return hzToMidi(frame.hz);
}

/**
 * A short history of Oak's output, as the second analyser reports it: `at(t)` is the distinct clear pitches of
 * the last `lagSec` before `t`, newest first (pitches within 30¢ of a newer one are merged).
 */
export class PlaybackHistory {
  private readonly frames: { t: number; midi: number | null }[] = [];
  constructor(private readonly keepSec = 5) {}
  push(frame: PitchFrame): void {
    this.frames.push({ t: frame.t, midi: playbackPitch(frame) });
    const oldest = frame.t - this.keepSec;
    let drop = 0;
    while (drop < this.frames.length && (this.frames[drop] as { t: number }).t < oldest) drop++;
    if (drop > 0) this.frames.splice(0, drop);
  }
  at(t: number, lagSec = PLAYBACK_LAG_SEC): number[] {
    const out: number[] = [];
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const f = this.frames[i] as { t: number; midi: number | null };
      if (f.t > t + 1e-6) continue;
      if (f.t < t - lagSec) break;
      if (f.midi === null) continue;
      if (out.some((m) => Math.abs(centsFrom(f.midi as number, m)) <= BLEED_CENTS)) continue;
      out.push(f.midi);
      if (out.length >= 4) break;
    }
    return out;
  }
  /** Seconds the output had a clear pitch in `[from, to]`. */
  pitchedSec(from: number, to: number): number {
    let n = 0;
    for (const f of this.frames) if (f.t >= from && f.t <= to && f.midi !== null) n++;
    const hop = this.frames.length > 1 ? hopSecOf(this.frames.map((f) => ({ t: f.t }) as PitchFrame)) : 0;
    return n * hop;
  }
  clear(): void {
    this.frames.length = 0;
  }
}

/** Mic frames with `playing` filled from the output's frames (both on the AudioContext clock). */
export function annotatePlayback(
  mic: readonly PitchFrame[],
  playback: readonly PitchFrame[],
  lagSec = PLAYBACK_LAG_SEC,
): PitchFrame[] {
  const history = new PlaybackHistory(Number.POSITIVE_INFINITY);
  const sorted = [...playback].sort((a, b) => a.t - b.t);
  let k = 0;
  return mic.map((f) => {
    while (k < sorted.length && (sorted[k] as PitchFrame).t <= f.t + 1e-6)
      history.push(sorted[k++] as PitchFrame);
    return { ...f, playing: history.at(f.t, lagSec) };
  });
}

export interface BleedOptions {
  /** Notes the host played, AudioContext seconds (frames are judged at their window centre). */
  playing?: readonly SungTarget[];
  /** Windows in which the learner is asked to sing (the targets): never playback-only. */
  singing?: readonly { on: number; off: number }[];
  /** Seconds added around each `singing` window. Default `SINGING_MARGIN_SEC`. */
  marginSec?: number;
  /** Subtracted from frame times before comparing with `singing` (the profile's sing latency). Default 0. */
  latencySec?: number;
}

export interface BleedReport {
  bleed: boolean;
  /** Seconds of voiced mic frames on what played, in playback-only spans. */
  heardSec: number;
  /** Seconds of mic frames in playback-only spans (something played, nobody was asked to sing). */
  playbackOnlySec: number;
  /** Time of the frame that tipped it over, or `null`. */
  at: number | null;
}

/** Whether a frame's window centre falls in a singing window. */
function inSinging(t: number, opts: BleedOptions): boolean {
  const m = opts.marginSec ?? SINGING_MARGIN_SEC;
  const at = t - (opts.latencySec ?? 0);
  for (const w of opts.singing ?? []) if (at >= w.on - m && at <= w.off + m) return true;
  return false;
}

/**
 * The bleed rule over a run of mic frames. A frame is in a playback-only span when something plays (a listed
 * note covers its window centre, or `PitchFrame.playing` is not empty) and it is outside every singing window.
 */
export function bleedReport(frames: readonly PitchFrame[], opts: BleedOptions = {}): BleedReport {
  const report: BleedReport = { bleed: false, heardSec: 0, playbackOnlySec: 0, at: null };
  if (frames.length === 0) return report;
  const hop = hopSecOf(frames);
  const half = ((WINDOW_SIZE / HOP_SIZE) * hop) / 2;
  const listed = opts.playing ?? [];
  for (const frame of frames) {
    const centre = frame.t - half;
    if (inSinging(centre, opts)) continue;
    const refs: number[] = [];
    for (const note of listed)
      if (centre >= note.on && centre <= note.off + NOTE_TAIL_SEC) refs.push(note.midi);
    if (frame.playing) refs.push(...frame.playing);
    if (refs.length === 0) continue;
    report.playbackOnlySec += hop;
    if (frame.clarity < BLEED_VOICED_CLARITY || !(frame.hz > 0)) continue;
    const midi = hzToMidi(frame.hz);
    if (!refs.some((r) => Math.abs(centsFrom(midi, r, true)) <= BLEED_CENTS)) continue;
    report.heardSec += hop;
    if (!report.bleed && report.heardSec > BLEED_MIN_SEC + 1e-9) {
      report.bleed = true;
      report.at = frame.t;
    }
  }
  return report;
}

/** The same rule, one frame at a time (the mic session's live check). */
export class BleedWatch {
  private hop: number | null = null;
  private lastT: number | null = null;
  private heard = 0;
  private only = 0;
  private tripped: number | null = null;
  push(frame: PitchFrame, singing = false): boolean {
    if (this.lastT !== null && frame.t > this.lastT && frame.t - this.lastT < 0.2)
      this.hop ??= frame.t - this.lastT;
    this.lastT = frame.t;
    const hop = this.hop ?? HOP_SIZE / 48000;
    if (singing || !frame.playing || frame.playing.length === 0) return this.tripped !== null;
    this.only += hop;
    if (frame.clarity >= BLEED_VOICED_CLARITY && frame.hz > 0) {
      const midi = hzToMidi(frame.hz);
      if (frame.playing.some((r) => Math.abs(centsFrom(midi, r, true)) <= BLEED_CENTS)) this.heard += hop;
    }
    if (this.tripped === null && this.heard > BLEED_MIN_SEC + 1e-9) this.tripped = frame.t;
    return this.tripped !== null;
  }
  get report(): BleedReport {
    return {
      bleed: this.tripped !== null,
      heardSec: this.heard,
      playbackOnlySec: this.only,
      at: this.tripped,
    };
  }
  reset(): void {
    this.heard = 0;
    this.only = 0;
    this.tripped = null;
  }
}

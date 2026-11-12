// What a take sounded like as a whole, beside the per-frame gate (contracts §8.1 step 1): a voice Oak can
// grade, nothing at all, a voice it cannot hear for the room ("too noisy"), or only blips shorter than a
// held note ("too short"). The voicing gate itself is unchanged: this only names WHY nothing could be
// graded, so the learner hears the right advice (move somewhere quieter, hold each note, check the mic).
// Plus a clipping flag when the input hits full scale. Pure.
import type { LearnerProfile } from "@oak/content-kit";
import { median, rmsDb } from "./math.ts";
import { hopSecOf, TRACKER_DEFAULTS, trackerOptionsFor } from "./tracker.ts";
import type { PitchFrame, TrackerOptions } from "./types.ts";

/** A held note: the shortest voiced stretch that counts as singing rather than a blip. */
export const HOLD_SEC = 0.25;
/** Below the gate, a frame is voice-like with a pitch in range and this clarity (noise has none). */
export const VOICE_LIKE_CLARITY = 0.6;
/** … and this far above the stored room level. */
export const VOICE_LIKE_ABOVE_FLOOR_DB = 3;
/** A room counts as too loud when unpitched sound passes the level gate for half the take and this long. */
export const LOUD_ROOM_SEC = 1;
/** A sample at or above this magnitude is at full scale. */
export const CLIP_LEVEL = 0.999;
/** Frames at full scale before a take counts as clipped. */
export const CLIP_MIN_FRAMES = 3;

export type TakeHeard = "voice" | "no-voice" | "too-noisy" | "too-short";

export interface TakeQuality {
  /**
   * `voice`: at least one held, gated note. `too-short`: voiced sound, but no stretch as long as
   * `HOLD_SEC` (hold each note). `too-noisy`: a voice-like pitch the gate could not separate from the
   * room, or a room loud enough to pass the level gate with no pitch in it. `no-voice`: nothing.
   */
  heard: TakeHeard;
  /** Frames that passed the voicing gate. */
  voicedFrames: number;
  /** Longest run of gated frames, seconds. */
  longestVoicedSec: number;
  /** Frames with a voice-like pitch (above the room, clarity ≥ 0.6) that the gate refused. */
  unclearVoiceSec: number;
  /** Median level of the frames above the room, dBFS; null when there were none. */
  levelDb: number | null;
  /** The room level the gate used (stored noise floor), dBFS. */
  floorDb: number;
  /** The input reached full scale on at least `CLIP_MIN_FRAMES` frames: the take is distorted. */
  clipped: boolean;
  /** Frames at full scale. */
  clippedFrames: number;
}

/** Whether a frame hit full scale: its window peak when the analyser reports it, else its RMS. */
function atFullScale(f: PitchFrame): boolean {
  return f.peak !== undefined ? f.peak >= CLIP_LEVEL : f.rms >= 0.6;
}

/**
 * Reads a whole take: why nothing could be graded, if nothing could, and whether the input clipped.
 * `profile` gives the same gate as the graders (`trackerOptionsFor`); `options` overrides it.
 */
export function takeQuality(
  frames: readonly PitchFrame[],
  profile: Pick<LearnerProfile, "rangeLow" | "noiseFloorDb">,
  options: Pick<TrackerOptions, "clarityMin" | "rmsMinDb" | "minHz" | "maxHz"> = {},
): TakeQuality {
  const gate = { ...TRACKER_DEFAULTS, ...trackerOptionsFor(profile), ...defined(options) };
  const floorDb = Number.isFinite(profile.noiseFloorDb) ? profile.noiseFloorDb : gate.rmsMinDb - 12;
  const hop = frames.length > 1 ? hopSecOf(frames) : 512 / 48000;
  const inRange = (f: PitchFrame) => f.hz >= gate.minHz && f.hz <= gate.maxHz;
  let voicedFrames = 0;
  let run = 0;
  let longest = 0;
  let voiceLike = 0;
  let loudNoPitch = 0;
  let clippedFrames = 0;
  const above: number[] = [];
  for (const f of frames) {
    const db = rmsDb(f.rms);
    const voiced = f.clarity >= gate.clarityMin && db >= gate.rmsMinDb && inRange(f);
    if (voiced) {
      voicedFrames++;
      run++;
      longest = Math.max(longest, run);
    } else run = 0;
    if (db >= floorDb + VOICE_LIKE_ABOVE_FLOOR_DB) {
      above.push(f.rms);
      if (!voiced && inRange(f) && f.clarity >= VOICE_LIKE_CLARITY) voiceLike++;
    }
    if (!voiced && db >= gate.rmsMinDb && !(inRange(f) && f.clarity >= VOICE_LIKE_CLARITY)) loudNoPitch++;
    if (atFullScale(f)) clippedFrames++;
  }
  const longestVoicedSec = longest * hop;
  const unclearVoiceSec = voiceLike * hop;
  let heard: TakeHeard;
  if (longestVoicedSec >= HOLD_SEC - 1e-9) heard = "voice";
  else if (unclearVoiceSec >= HOLD_SEC && voicedFrames < 0.5 * voiceLike) heard = "too-noisy";
  else if (voicedFrames >= 3) heard = "too-short";
  else if (frames.length > 0 && loudNoPitch >= 0.5 * frames.length && loudNoPitch * hop >= LOUD_ROOM_SEC)
    heard = "too-noisy";
  else heard = "no-voice";
  return {
    heard,
    voicedFrames,
    longestVoicedSec,
    unclearVoiceSec,
    levelDb: above.length > 0 ? Math.round(rmsDb(median(above)) * 10) / 10 : null,
    floorDb,
    clipped: clippedFrames >= CLIP_MIN_FRAMES,
    clippedFrames,
  };
}

function defined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

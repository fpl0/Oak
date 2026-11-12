// "Mic sounds noisy today — re-check?" (ux §4.7) and the Wave 2 gap 9: a learner who hummed through the quiet
// check got a noise floor at their own voice, and every later take said "Oak didn't hear a voice" with no way
// out. A take that heard no voice, or a take that was mostly noise, leaves one calm suggestion behind: re-run the
// quiet check. Any sing surface (lesson steps, drills, the set-up parts) reports its finished take with
// `reportTake`; Settings › Voice and the set-up parts show the suggestion with `RecheckHint`.
import type { PitchFrame } from "@oak/pitch";
import { rmsDb } from "@oak/pitch";
import { useSyncExternalStore } from "react";

/** ux §4.7: more than 40 % of the loud frames of a take with low clarity. */
export const NOISY_SHARE = 0.4;
/** A noise floor at or above this (dBFS) is too high to sing over (the quiet check's own line, −45). */
export const HIGH_FLOOR_DB = -45;

export type RecheckKind = "no-voice" | "high-floor" | "noisy";
export interface RecheckAdvice {
  kind: RecheckKind;
  title: string;
  body: string;
}

/** Of the frames loud enough to be a voice, the share the detector could not hear a pitch in. */
export function noisyShare(frames: readonly PitchFrame[], floorDb: number | null): number {
  const gate = Math.max(-45, (floorDb ?? -60) + 12);
  let loud = 0;
  let unclear = 0;
  for (const f of frames) {
    if (rmsDb(f.rms) < gate) continue;
    loud++;
    if (f.clarity < 0.9 || !(f.hz > 0)) unclear++;
  }
  return loud >= 20 ? unclear / loud : 0;
}

/**
 * What a finished take suggests. `diagnostics` are the grader's (`sing.no-voice` when nothing was voiced);
 * `frames` the take itself; `floorDb` the stored noise floor.
 */
export function takeAdvice(take: {
  diagnostics: readonly { id: string; params?: Record<string, unknown> }[];
  frames?: readonly PitchFrame[];
  floorDb: number | null;
}): RecheckAdvice | null {
  const nv = take.diagnostics.find((d) => d.id === "sing.no-voice");
  // @oak/pitch says why nothing could be graded (`reason`): only short blips are a matter of holding each note,
  // not of the mic or the room, so they leave no re-check behind; a voice the room drowned is the noisy advice.
  const reason = nv?.params?.reason;
  if (reason === "short") return null;
  if (reason === "noisy")
    return {
      kind: "noisy",
      title: "The mic sounds noisy today",
      body: "Oak heard sound but could not follow a pitch in it. A quieter spot helps; re-running the quiet check lets Oak tell your voice from the room.",
    };
  const noVoice = nv !== undefined;
  if (noVoice && take.floorDb !== null && take.floorDb >= HIGH_FLOOR_DB) {
    return {
      kind: "high-floor",
      title: "Oak heard no voice: the quiet check may be off",
      body: `The last quiet check measured the room at ${Math.round(take.floorDb)} dBFS, loud enough to hide a voice. If someone was talking or humming then, or the room is quieter now, run the quiet check again.`,
    };
  }
  if (noVoice) {
    return {
      kind: "no-voice",
      title: "Oak heard no voice",
      body: "Check that the microphone Oak listens on is the one you sing into, then run the quiet check again. Or switch on Quiet mode for today.",
    };
  }
  if (take.frames && noisyShare(take.frames, take.floorDb) > NOISY_SHARE) {
    return {
      kind: "noisy",
      title: "The mic sounds noisy today",
      body: "Much of what it heard had no clear pitch. A quieter spot helps; re-running the quiet check lets Oak tell your voice from the room.",
    };
  }
  return null;
}

// --- the suggestion, kept for this browser until the learner re-checks or dismisses it ----------------

const KEY = "oak.voice.recheck";
type Stored = RecheckAdvice & { at: number };
let current: Stored | null = read();
const subs = new Set<() => void>();

function read(): Stored | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Stored;
    // A day-old suggestion is stale: the room has changed since.
    return typeof v?.at === "number" && Date.now() - v.at < 24 * 3600 * 1000 ? v : null;
  } catch {
    return null;
  }
}
function write(v: Stored | null): void {
  current = v;
  try {
    if (v) globalThis.localStorage?.setItem(KEY, JSON.stringify(v));
    else globalThis.localStorage?.removeItem(KEY);
  } catch {
    // Storage blocked: the suggestion lives for this page only.
  }
  for (const cb of subs) cb();
}

/** A sing surface reports its finished take; returns the advice it left behind, if any. */
export function reportTake(take: Parameters<typeof takeAdvice>[0]): RecheckAdvice | null {
  const advice = takeAdvice(take);
  if (advice) write({ ...advice, at: Date.now() });
  return advice;
}
/** The quiet check was run again, or the learner dismissed the suggestion. */
export function clearRecheck(): void {
  write(null);
}
export function recheckNow(): RecheckAdvice | null {
  return current;
}
export function useRecheck(): RecheckAdvice | null {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
    () => null,
  );
}

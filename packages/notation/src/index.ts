// @oak/notation: events in, NotationModel out, ABC text out. Notation is always rendered from code by
// this engine; nobody hand-writes ABC. Isomorphic: abcjs itself is only touched by the app's StaffView
// (the optional browser helper lives in ./render.dom.ts, entry "@oak/notation/render").
// Promoted from spikes/s4-notation (quantize.ts, abc.ts) with its recorded gotchas fixed.
import { toAbc } from "./abc.ts";
import { buildScore } from "./build.ts";
import { drumStaffPosition as drumPos } from "./drums.ts";
import type { AbcOptions, AbcResult, NotationInput, Score } from "./types.ts";

export { abcLength, abcPitchLetter, toAbc } from "./abc.ts";
export { barBeat, buildScore, estimateKey, straightenSwing } from "./build.ts";
export { DRUM_NAMES } from "./drums.ts";
export {
  applyEdit,
  editStaff,
  nudgePitch,
  pitchToStep,
  type StaffEdit,
  staffStepAtY,
  stepToPitch,
  writtenToCycles,
  xToOnset,
} from "./edit.ts";
export { type Grid, gridOf } from "./meter.ts";
export { activeNotes, scoreToEvents } from "./model.ts";
export { eventIdBase, parseNoteList, toNoteList, withIds } from "./notelist.ts";
export * from "./types.ts";

/** `buildScore` + `toAbc`. */
export function notate(input: NotationInput, opts?: AbcOptions): { score: Score; abc: AbcResult } {
  const score = buildScore(input);
  return { score, abc: toAbc(score, opts) };
}
/** Where a drum sound sits on the percussion staff and which notehead it takes (bd F4, sd C5, hh G5 with x heads). */
export function drumStaffPosition(s: string): { pitch: string; head: "normal" | "x" } | null {
  return drumPos(s);
}

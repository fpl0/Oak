// @oak/notation: events in, NotationModel out, ABC text out. Notation is always rendered from code by
// this engine; nobody hand-writes ABC. Isomorphic: abcjs itself is only touched by the app's StaffView
// (the optional browser helper lives in ./render.dom.ts, entry "@oak/notation/render").
// Promoted from spikes/s4-notation (quantize.ts, abc.ts) with its recorded gotchas fixed.
import { toAbc } from "./abc.ts";
import { buildScore } from "./build.ts";
import { drumStaffPosition as drumPos } from "./drums.ts";
import type { AbcOptions, AbcResult, NotationInput, Score } from "./types.ts";

export { abcLength, abcPitchLetter, toAbc } from "./abc.ts";
export {
  annotationsOn,
  barBeat,
  buildScore,
  clefOfTrack,
  estimateKey,
  keyAtBar,
  keyAtOnset,
  straightenSwing,
} from "./build.ts";
export { DRUM_NAMES } from "./drums.ts";
export {
  applyEdit,
  type EditRefusal,
  editNoteList,
  editStaff,
  type NoteListContext,
  type NoteListEditResult,
  noteListInput,
  nudgePitch,
  pitchToStep,
  plainNoteList,
  type StaffEdit,
  slicedNoteList,
  staffStepAtY,
  stepToPitch,
  writtenToCycles,
  xToOnset,
} from "./edit.ts";
export {
  type BarGeometry,
  type Box,
  barFraction,
  barPoints,
  type HitContext,
  headAt,
  hitTest,
  NotationNotBuiltError,
  type NoteGeometry,
  noteAt,
  onsetX,
  type StaffBandGeometry,
  type StaffGeometry,
  type StaffHit,
  staffAt,
  stepY,
} from "./geometry.ts";
// Wave 4 seam (docs/design/wave4.md §3.3): chord labels and the lead-sheet layout.
export {
  CHORD_LABEL_CLASSES,
  type ChordLabel,
  type ChordLabelSet,
  chordLabelInput,
  chordLabelTexts,
  LEAD_SHEET_BAR_PX,
  type LeadSheetInput,
  type LeadSheetLayout,
  type LeadSheetPage,
  leadSheetInput,
  leadSheetLayout,
  leadSheetPages,
  stepStaffInput,
} from "./lead-sheet.ts";
export { ABCJS_LIMITS, type AbcjsLimit, abcjsLimitWarnings } from "./limits.ts";
export { type Grid, gridOf } from "./meter.ts";
export { activeNotes, scoreToEvents } from "./model.ts";
export { eventIdBase, parseNoteList, toNoteList, withIds } from "./notelist.ts";
export {
  ANNOTATION_CLASSES,
  type AnnotationSet,
  CLEFS,
  type Clef,
  type KeySignatureOption,
  labelSpelled,
  type NoteAnnotation,
  noteAnnotations,
  resolveKeySignature,
} from "./options.ts";
export {
  chordDisplay as chordSymbolDisplay,
  romanDisplay as numeralDisplay,
} from "./theory-port.ts";
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

// @oak/notation: events in, NotationModel out, ABC text out. Notation is always rendered from code by
// this engine; nobody hand-writes ABC. Isomorphic: abcjs itself is only touched by the app's StaffView
// (the optional browser helper lives in ./render.dom.ts, entry "@oak/notation/render").
// Promoted from spikes/s4-notation (quantize.ts, abc.ts) with its recorded gotchas fixed.
import { toAbc } from "./abc.ts";
import { buildScore } from "./build.ts";
import { drumStaffPosition as drumPos } from "./drums.ts";
import type { AbcOptions, AbcResult, NotationInput, Score } from "./types.ts";

export { abcLength, abcPitchLetter, padLine, toAbc } from "./abc.ts";
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
  tripletTokens,
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
  pageSections,
  restateChords,
  stepStaffInput,
} from "./lead-sheet.ts";
export { ABCJS_LIMITS, type AbcjsLimit, abcjsLimitWarnings } from "./limits.ts";
export { type Grid, gridOf } from "./meter.ts";
export { activeNotes, scoreToEvents, spelledByEvent } from "./model.ts";
export { eventIdBase, parseNoteList, toNoteList, withIds } from "./notelist.ts";
export {
  ANNOTATION_CLASSES,
  ANNOTATION_FONT_PX,
  type AnnotationSet,
  barTextPx,
  CLEFS,
  type Clef,
  type KeySignatureOption,
  labelSpelled,
  type NoteAnnotation,
  noteAnnotations,
  noteNameText,
  resolveKeySignature,
  type StaffTextLayout,
  staffTextLayout,
  textWidthPx,
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
// Wave 6 (guide.ts): the 3rd and 7th of each chord on the staff, for the guide-tone lens.
export { GUIDE_TONE_CLASSES, type GuideToneMark, guideToneMarks } from "./guide.ts";
// Wave 6 carry-over d5 (host.ts): what every staff host engraves and how it names the notes it drew.
export {
  alteredStepName,
  alteredSteps,
  type DrawnLabel,
  drawnLabels,
  drawnLabelsOf,
  type StaffHostOptions,
  staffHostInput,
  staffSwingOf,
  swingTextOf,
  type TrackSwingInput,
} from "./host.ts";
// Wave 5 (docs/design/wave5.md §3.3): section marks, the 12-bar chart (layout and engraved).
export {
  type ChartAbc,
  type ChartAbcOptions,
  type ChartBar,
  type ChartChord,
  type ChartInput,
  type ChartLayout,
  chartAbc,
  chartBarText,
  chartChordText,
  chartLayout,
  type SectionSpanInput,
  sectionMarks,
} from "./wave5.ts";
// Wave 6 (docs/design/wave6.md §3.3): what a host passes for key plans, modal pieces, chord and numeral labels;
// the rhythm a Score writes (ties, dots, tuplets).
export {
  type HarmonyLabelInput,
  harmonyLabels,
  type KeySpanInput,
  keyChangesOf,
  MODAL_SIGNATURE_DEFAULT,
  MODAL_SIGNATURE_STYLES,
  type ModalSignatureStyle,
  modalSignatureKey,
  type ScoreRhythm,
  scoreRhythm,
} from "./wave6.ts";

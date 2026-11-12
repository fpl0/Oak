// @oak/theory: music theory behind normalization. tonal 6.5.1 is only a test oracle here; nothing in this
// package returns a raw tonal string. Isomorphic: no DOM, no Bun (the CLI host lives in cli.bun.ts).
//
// Modules: pitch (spelled-pitch arithmetic, internal), notes, intervals, scales (keys, degrees, steps,
// spelling), chord-table + chords (the single spelling table and the three dialects), roman (numerals,
// function, cadences), schemas, rhythm (bar positions, Euclid, timelines), meters, text (answer normalizers).

export {
  ALIAS_DICTS,
  DICT_CODE,
} from "./chord-table.ts";
export {
  bassName,
  CHORD_TABLE,
  chordFamilyOf,
  chordInDict,
  chordNotes,
  chordOf,
  chordPcs,
  chordSpelling,
  defaultPcName,
  identifyChord,
  isCanonicalCode,
  normSuffix,
  parseChordSymbol,
  parseChordWithBass,
  qualityOf,
  respellRoot,
  SEVENTH_CORE,
  sameChord,
  toAbcChord,
  toCode,
  toJazzGlyph,
  toLeadSheet,
  triadCore,
  triadQuality,
} from "./chords.ts";
export {
  intervalBetween,
  intervalName,
  intervalSemitones,
  invertInterval,
  parseInterval,
} from "./intervals.ts";
export {
  type FifthsNeighbours,
  FLAT_ORDER,
  fifthsNeighbours,
  fifthsOfKey,
  type IntervalInfo,
  intervalInKey,
  intervalOf,
  type KeyInput,
  keyFromFifths,
  keyOf,
  labelPitch,
  type PitchLabel,
  parseStrudelInterval,
  SHARP_ORDER,
  type SignatureInfo,
  type StrudelIntervalInfo,
  signatureOf,
  strudelInterval,
} from "./keys.ts";
export * from "./meters.ts";
export { freqToMidi, midiToFreq, midiToPc, normalizeNoteName, noteToMidi, parseNote, pcOf } from "./notes.ts";
export {
  barPosition,
  bjorklund,
  euclid,
  gridOnsets,
  gridSteps,
  gridToMini,
  onsetsOf,
  RHYTHM_GRIDS,
  type RhythmGrid,
  rhythmGrid,
} from "./rhythm.ts";
export {
  classifyCadence,
  diatonicChords,
  displayRN,
  formatRN,
  functionOf,
  isMinorRef,
  parseRN,
  rnToChord,
  romanOf,
} from "./roman.ts";
export {
  characteristicTones,
  circleOfFifths,
  degreeLabelIn,
  degreeOf,
  degreeSemitones,
  diatonicChordTones,
  displayName,
  formatScaleName,
  isMinorish,
  keyFromScaleCtx,
  keySignature,
  keysWithSignature,
  MODES,
  parallelKey,
  parseScaleArg,
  parseScaleName,
  relativeKey,
  SCALES,
  type ScaleDef,
  scaleDefByName,
  scaleDefOf,
  scaleNotes,
  scalePcs,
  spellMidi,
  stepToMidi,
  strudelStep,
  syllableOf,
  transposeKey,
} from "./scales.ts";
export { SCHEMAS, schemaKey, schemaMatch, schemaSignature } from "./schemas.ts";
export { normalizeText, parseKeyText } from "./text.ts";
export * from "./types.ts";

import type { ScaleId, ScaleMode } from "@oak/content-kit";

/** The unlock-table ID of a scale name: "harmonic minor" → `scale.harmonic-minor`. */
export function scaleIdOf(mode: ScaleMode): ScaleId {
  return `scale.${mode.replace(/ /g, "-")}`;
}

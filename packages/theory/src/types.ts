// Public types of @oak/theory. Raw tonal strings never leak out of this package.
import type {
  ChordFamilyId,
  ChordQuality,
  Degree,
  KeySpec,
  Rat,
  ScaleMode,
  SchemaId,
} from "@oak/content-kit";

/** Pitch class, 0 = C. */
export type Pc = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface ParsedNote {
  /** Integer MIDI (60 = C4 = Strudel "c4"). */
  midi: number;
  /** Upper-case letter. */
  letter: string;
  /** −2 to 2. */
  alt: number;
  oct: number;
  /** True when the source had no octave and Strudel's default (3) was applied. */
  defaultedOctave: boolean;
}

export interface SpelledPitch {
  midi: number;
  /** Scientific name: "E#5", "Bb3". */
  name: string;
  letter: string;
  alt: number;
  oct: number;
}

export interface DegreeInfo {
  /** Relative to the major scale: "b3", "#4". */
  degree: Degree;
  /** 1 to 7. */
  num: number;
  alt: number;
  /** Semitones above the tonic, 0 to 11. */
  semitones: number;
  /** Movable do, do-based minor: do ra re me mi fa fi sol le la te ti. */
  syllable: string;
  /** `n` for `.scale()` in the key's own scale, as written in code: 4, or a chromatic step string like "3#". */
  step: number | string;
}

/** `.scale("C4:major")` argument, taken apart. */
export interface ScaleRef {
  tonic: string;
  /** `null` when the code wrote no octave ("C:major", which Strudel plays in octave 3). */
  octave: number | null;
  mode: ScaleMode;
  /** The name as Strudel takes it: "major", "harmonic:minor". */
  strudelName: string;
}

/** One chord, however it was written. Identity is root pitch class + quality (+ bass). */
export interface ChordId {
  rootPc: Pc;
  /** Spelled root: "Eb". */
  root: string;
  quality: ChordQuality;
  /** Equals `rootPc` in root position. Slash chords exist only as display strings and in analysis. */
  bassPc: Pc;
  bass?: string;
  /** Extensions and alterations beyond the quality, as written: ["b9"]. */
  ext: string[];
}

/** Dictionaries of `voicing()` in Strudel 1.2.6. */
export const VOICING_DICTS = ["ireal", "ireal-ext", "triads", "lefthand", "guidetones", "legacy"] as const;
export type VoicingDict = (typeof VOICING_DICTS)[number];

/**
 * One row of the single chord-spelling table (STYLE §5.1; contracts §6.7 rule 7): quality ↔ code
 * spelling ↔ lead-sheet display ↔ jazz glyph. `parseChordSymbol`, `toLeadSheet`, `toCode` and the lint's
 * chord-family map all derive from it; no other package spells a chord.
 */
export interface ChordSpelling {
  quality: ChordQuality;
  /** Suffix written in `chord("…")`: "", "m", "o", "aug", "^7", "7", "m7", "m7b5", "o7". The only spelling for its quality. */
  code: string;
  /** Suffixes Strudel also resolves but Oak forbids in content ("-", "+", "-7", "h7", "M", "M7"). */
  forbidden: string[];
  /** Lead-sheet suffix: "", "m", "°", "+", "maj7", "7", "m7", "m7♭5", "°7". */
  leadSheet: string;
  /** Jazz glyph suffix: "", "–", "°", "+", "∆7", "7", "–7", "ø7", "°7". */
  jazz: string;
  /** What abcjs prints correctly ("h7" must be emitted as "ø7"). */
  abc: string;
  family: ChordFamilyId;
  /** Intervals above the root, in semitones. */
  intervals: number[];
  /** Per dictionary: resolves correctly, is absent, or sounds wrong (`Caug` in `triads`, `C69` in `lefthand`). */
  dicts: Record<VoicingDict, "ok" | "missing" | "wrong">;
}

export interface RomanNumeral {
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** −1 = ♭ (bVII), 1 = ♯. */
  alt: -1 | 0 | 1;
  quality: ChordQuality;
  inversion: 0 | 1 | 2 | 3;
  /** Applied chord: V7/V. */
  of?: RomanNumeral;
}
export type HarmonicFunction = "T" | "PD" | "D" | "chromatic";

/** One entry of the schema library (exercises §3.5). */
export interface SchemaDef {
  id: SchemaId;
  title: string;
  mode: "major" | "minor" | "mixolydian" | "dorian" | "blues";
  /** Roman numerals in Oak's dialect, one per slot. */
  rn: string[];
  /** Bars per slot when not 1. */
  slotBars?: number[];
  /** Whether a rotation still counts as the same loop (`harmony.schema-rotation`). */
  rotations: boolean;
}

export interface KeySignature {
  /** Positive = sharps, negative = flats. */
  accidentals: number;
  /** In signature order: ["F#", "C#"]. */
  notes: string[];
  /** abcjs `K:` value: "Eb", "Am", "Ddor". */
  abcK: string;
}

export interface BarPosition {
  /** 1-based; 0 is the pickup bar when the piece declares a pickup. */
  bar: number;
  /** 1-based, in tempo units; fractional inside a beat. */
  beat: number;
  /** "1", "1e", "1&", "1a"; triplets "1t", "1l"; compound "1la", "1li"; odd meters: group counts. */
  label: string;
  /** Position inside the bar, in cycles. */
  inBar: Rat;
  pickup: boolean;
}

export type NoteTextKind = "note" | "chord" | "rn" | "interval" | "key";

export type { ChordFamilyId, ChordQuality, Degree, KeySpec, ScaleMode };

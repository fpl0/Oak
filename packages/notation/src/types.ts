// Public types of @oak/notation: the NotationModel (`Score`) and what goes in and out of it.
import type { CodeRange, KeySpec, MeterSpec, NEvent, PickupSpec, Rat, SwingSpec } from "@oak/content-kit";
import type { SpelledPitch } from "@oak/theory";

export type StaffKind = "auto" | "treble" | "bass" | "grand" | "percussion" | "rhythm" | "lead";

export interface NotationInput {
  /** Normalized events of the tracks to notate, sorted by (onset, midi). */
  events: NEvent[];
  meter: MeterSpec;
  /**
   * The declared key wins; otherwise the events' `scaleCtx`; otherwise a conservative key estimate
   * (at least 7 pitched notes whose pitch classes all fit one key); otherwise none.
   */
  key: KeySpec | null;
  /** Cycles to engrave, from `startBar`. */
  bars: number;
  /** 0-based first cycle. Default 0. */
  startBar?: number;
  staff: StaffKind;
  /** Grand staff: split by register at `splitMidi` (default 60) or by track. */
  split?: "register" | "track";
  splitMidi?: number;
  /**
   * Lead-sheet chords above the staff, in code spelling; they are translated for display.
   * `bar` is the 0-based cycle, `beat` is 1-based in tempo units (1.5 = the "&" of beat 1).
   * When absent on a `lead` staff, the symbols are taken from the events' `chordSymbol`.
   */
  chords?: { bar: number; beat: number; symbol: string }[];
  /** Roman numerals under the staff (same `bar`/`beat` convention as `chords`). */
  romans?: { bar: number; beat: number; rn: string }[];
  /**
   * Lyric line under the notes: scale degrees (1-based, "b3"), movable-do syllables, or rhythm
   * counts ("1 e & a", "1 la li") for the percussion and rhythm staves.
   */
  labels?: "none" | "degree" | "solfege" | "counts";
  tempoBpm?: number;
  /**
   * A declared swing: onsets on the swung subdivision are mapped back to the straight grid before
   * quantizing, and "Swing 8ths" / "Swing 16ths" is printed above the first bar (contracts §6.10).
   */
  swing?: SwingSpec;
  /** Bar 0 is engraved as a partial measure holding only the pickup (contracts §6.11). */
  pickup?: PickupSpec;
  title?: string;
}

export interface TupletMark {
  /** `(p:q:r`: p notes in the time of q, over r written items. Single digits only (abcjs). */
  p: number;
  q: number;
  r: number;
}

export interface NoteItem {
  kind: "note" | "chord" | "rest";
  /** Index in the render's `idMap`: the abcjs class is `oak-e{n}`. `null` for rests. Tied pieces share it. */
  n: number | null;
  /** `NEvent.id`s this item engraves, low to high (aligned with `pitches`). */
  eventIds: string[];
  pitches: SpelledPitch[];
  /** Onset and sounding length in cycles. */
  onset: Rat;
  dur: Rat;
  /** Written value: 1 = whole … 32 = thirty-second. */
  written: { base: 1 | 2 | 4 | 8 | 16 | 32; dots: 0 | 1 | 2 };
  tieToNext: boolean;
  tieFromPrev: boolean;
  /** Set on the first item of a tuplet group. */
  tupletStart?: TupletMark;
  inTuplet: boolean;
  /** A beam group ends before this item (ABC: a space). */
  breakBefore: boolean;
  /** Drum staff: the notehead style and position come from the sound (aligned with `pitches`). */
  drum?: { s: string; head: "normal" | "x" };
  /** Per-pitch drum sounds of a drum chord (hi-hat + snare), aligned with `pitches`. */
  drums?: { s: string; head: "normal" | "x" }[];
  /** An invisible rest (ABC `x`): a second voice that is silent for the whole bar. */
  hidden?: true;
  /** Union of the engraved events' code locations (feeds `IdMapEntry.locs`). */
  locs?: CodeRange[];
  /** Lyric syllable under this item (first piece of a note only). */
  lyric?: string;
}
export interface Voice {
  id: string;
  bars: { index: number; partial: boolean; items: NoteItem[] }[];
}
export interface Staff {
  id: "S1" | "RH" | "LH" | "DR";
  clef: "treble" | "bass" | "perc";
  lines: 1 | 5;
  voices: Voice[];
}
export interface NotationWarning {
  code:
    | "tuplet-too-long"
    | "mixed-tuplets"
    | "overlap-cut"
    | "snapped-to-grid"
    | "unpitched-dropped"
    | "out-of-range";
  /** 0-based cycle. */
  bar: number;
  message: string;
}
/** A chord symbol or Roman numeral placed in the score, already translated for display. */
export interface ScoreAnnotation {
  /** 0-based cycle. */
  bar: number;
  /** Absolute position in cycles. */
  at: Rat;
  /** Code spelling as given ("Cm7b5", "V7/V"). */
  source: string;
  /** What is printed ("Cm7♭5" is written as "Cm7b5", which abcjs renders with a flat glyph). */
  text: string;
}
/** The NotationModel. Everything a staff view needs, with no abcjs in it. */
export interface Score {
  meter: MeterSpec;
  key: KeySpec | null;
  tempoBpm?: number;
  /** "Swing 8ths" or "Swing 16ths" when the input declared a swing. */
  swingText?: string;
  staves: Staff[];
  bars: number;
  startBar: number;
  pickup: boolean;
  /**
   * True when the music could not be notated exactly and was snapped (`.fast(1.1)`, tuplets over 9,
   * polymeters crossing bars). Content may notate only what renders with `approximate = false`.
   */
  approximate: boolean;
  warnings: NotationWarning[];
  /** Chord symbols above the top staff. */
  chords?: ScoreAnnotation[];
  /** Roman numerals under the bottom pitched staff. */
  romans?: ScoreAnnotation[];
  title?: string;
}
export type NotationModel = Score;

export interface AbcOptions {
  barsPerLine?: number;
  /** Class prefix; default "oak-e". */
  classPrefix?: string;
}
export interface IdMapEntry {
  n: number;
  eventIds: string[];
  /** Union of the events' code locations. */
  locs: CodeRange[];
  /** Spelled pitches, low to high. */
  pitches: string[];
  /** Display bar: 1-based (`floor(onset) + 1`); with a declared pickup, cycle 0 is bar 0. */
  bar: number;
  /** 1-based beat in tempo units inside the bar (fractional inside a beat). */
  beat: number;
  onset: Rat;
  dur: Rat;
}
export interface AbcResult {
  abc: string;
  /** Index = the `n` of class `oak-e{n}`. The link bus resolves a clicked note through it. */
  idMap: IdMapEntry[];
  /** `NEvent.id` → `n`. */
  byEvent: Map<string, number>;
}

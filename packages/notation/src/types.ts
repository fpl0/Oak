// Public types of @oak/notation: the NotationModel (`Score`) and what goes in and out of it.
import type { CodeRange, KeySpec, MeterSpec, NEvent, PickupSpec, Rat, SwingSpec } from "@oak/content-kit";
import type { SpelledPitch } from "@oak/theory";

export type StaffKind = "auto" | "treble" | "bass" | "grand" | "percussion" | "rhythm" | "lead";

export interface NotationInput {
  /** Normalized events of the tracks to notate, sorted by (onset, midi). */
  events: NEvent[];
  meter: MeterSpec;
  /** The declared key wins; otherwise the events' `scaleCtx`; otherwise a key estimate; otherwise none. */
  key: KeySpec | null;
  /** Cycles to engrave, from `startBar`. */
  bars: number;
  /** 0-based first cycle. Default 0. */
  startBar?: number;
  staff: StaffKind;
  /** Grand staff: split by register at `splitMidi` (default 60) or by track. */
  split?: "register" | "track";
  splitMidi?: number;
  /** Lead-sheet chords above the staff, in code spelling; they are translated for display. */
  chords?: { bar: number; beat: number; symbol: string }[];
  /** Roman numerals under the staff. */
  romans?: { bar: number; beat: number; rn: string }[];
  /** Lyric line under the notes. */
  labels?: "none" | "degree" | "solfege";
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
  /** Drum staff: the notehead style and position come from the sound. */
  drum?: { s: string; head: "normal" | "x" };
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
  bar: number;
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

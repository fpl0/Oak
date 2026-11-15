// Public types of @oak/notation: the NotationModel (`Score`) and what goes in and out of it.
import type { CodeRange, KeySpec, MeterSpec, NEvent, PickupSpec, Rat, SwingSpec } from "@oak/content-kit";
import type { SpelledPitch } from "@oak/theory";
import type { AnnotationSet } from "./options.ts";

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
  /**
   * Key changes inside the engraved bars (Wave 3: a patterned `.scale("<C4:major G4:major>")`): from `bar`
   * (absolute 0-based cycle) on, notes are spelled in `key` and the staff shows its signature (`[K:…]` at that
   * bar line). `key` above is the signature at the start. A change to the key already in force is ignored.
   */
  keyChanges?: readonly KeyChange[];
  /**
   * A track's own key plan, when it differs from the piece's (two tracks in different keys on a grand staff:
   * a melody in C over a bass in G-flat). A staff whose notes all come from tracks with the same entry here is
   * spelled in that plan and shows its own signature; a staff mixing tracks, or a track with no entry, follows
   * `key`/`keyChanges`. Give only keys the code states (`.scale()`), never estimates.
   */
  trackKeys?: Readonly<Record<string, { key: KeySpec; keyChanges?: readonly KeyChange[] }>>;
  /** Cycles to engrave, from `startBar`. */
  bars: number;
  /** 0-based first cycle. Default 0. */
  startBar?: number;
  staff: StaffKind;
  /**
   * Grand staff: split by register at `splitMidi` (default 60: middle C and up on the treble staff) or by
   * track (each track whole on one staff). Default: by track when there are two or more pitched tracks and
   * they divide into low and high ones (`clefOfTrack`), otherwise by register.
   */
  split?: "register" | "track";
  splitMidi?: number;
  /**
   * Per-track clef: a track named here goes to that staff of a grand staff (`bass` → the lower one), and on a
   * single `auto` staff decides the clef when every pitched track agrees. Unnamed tracks follow
   * `clefOfTrack` (a track called bass/lh/left/low, or one whose median is below `splitMidi`, reads in bass).
   */
  trackClefs?: Record<string, "treble" | "bass">;
  /**
   * Lead-sheet chords above the staff, in code spelling; they are translated for display.
   * `bar` is the 0-based cycle, `beat` is 1-based in tempo units (1.5 = the "&" of beat 1).
   * When absent on a `lead` staff, the symbols are taken from the events' `chordSymbol`.
   */
  chords?: { bar: number; beat: number; symbol: string }[];
  /**
   * Wave 7 (docs/design/wave7.md §3.3): how `chords` print — `lead-sheet` (default: `Cmaj7`, `Cm7♭5`) or `jazz`
   * glyphs (`C∆7`, `Cø7`, `C–7`), both from the one chord table (`chordSymbolText`). Pass `chords` in code spelling.
   */
  chordStyle?: "lead-sheet" | "jazz";
  /** Roman numerals under the staff (same `bar`/`beat` convention as `chords`). */
  romans?: { bar: number; beat: number; rn: string }[];
  /**
   * Lyric line under the notes: scale degrees (1-based, "b3"), movable-do syllables, or rhythm
   * counts ("1 e & a", "1 la li") for the percussion and rhythm staves.
   */
  labels?: "none" | "degree" | "solfege" | "counts";
  /**
   * Wave 3 lenses (docs/design/wave3.md §3.1): up to three annotation lines at once (degree, solfège, note
   * name), under the notes (abcjs lyric lines, one per kind, in that order) or over them (stacked text
   * annotations), on every pitched staff. When any kind is on it replaces `labels`. The texts are
   * `noteAnnotations(score, set)`; the DOM layer (`placeAnnotations`) gives them the stable classes of
   * `ANNOTATION_CLASSES`. Degree and solfège need a key (the declared, `.scale()` or estimated one); without
   * one only names are written.
   */
  annotations?: AnnotationSet;
  tempoBpm?: number;
  /**
   * A declared swing: onsets on the swung subdivision are mapped back to the straight grid before
   * quantizing, and "Swing 8ths" / "Swing 16ths" is printed above the first bar (contracts §6.10).
   */
  swing?: SwingSpec;
  /**
   * Wave 6 (U13): the grid the lesson declares, in steps per bar (8, 12, 16, 24: the unit of a `grid` answer's
   * `stepsPerBar`). Every onset and end is moved to the nearest step before the bar is written, so a push or a
   * lazy hit made with `.early()` / `.late()` is engraved where a reader would write it: `.late(1/32)` on a
   * sixteen-step grid stays on its sixteenth, `.early(.02)` on its beat. A note exactly between two steps goes to
   * the metrically stronger one (the step with the smaller denominator; the earlier one when they tie); a note never
   * becomes shorter than one step. The Score is exact on that grid (`approximate` stays false) unless two notes of
   * one track land on the same step: then it warns (`snapped-to-grid`) and is approximate. Absent: no snapping; a
   * rhythm finer than a 32nd is snapped to 1/16 and reported, as before.
   */
  grid?: number;
  /**
   * The piece declares a pickup (contracts §6.11): cycle 0 is "the pickup bar" (bar 0) and bar numbers start at 1
   * on cycle 1. With `startBar` 0 bar 0 is engraved as a partial measure holding only the pickup (leading rests in
   * bar 0 are not drawn, a drum count-in before the pickup is left out); a later page (`startBar` > 0) only takes
   * the numbering from it.
   */
  pickup?: PickupSpec;
  /**
   * The last engraved bar is the piece's last bar (default true). With a pickup that bar loses trailing rests as
   * long as the pickup (contracts §6.11 item 4); a page that stops before the end passes false.
   */
  endsPiece?: boolean;
  title?: string;
  /**
   * Wave 5 (docs/design/wave5.md §3.3): section labels over the staff and a double barline before each new
   * section, from the per-track `arrange()` (`sectionMarks`). Drawn as an ABC part label (`[P:Chorus]`) over the
   * section's first bar, on the top staff, with `||` closing the bar before it. Marks outside the engraved bars are
   * dropped (a page shows only its own).
   */
  sections?: readonly SectionMark[];
  /**
   * Wave 5: spell blue notes as blues players read them: ♭3 and ♭7 always as flats (E♭ and B♭ in C, also when the
   * line climbs through them to 3 or 1), ♭5 by direction (F♯ going up, G♭ going down). Default: on when the key is a
   * blues key (`.scale("C4:blues")`), an event's scale is a blues scale, or every chord symbol given is a dominant
   * seventh on two or more roots (a 12-bar blues); `false` turns it off.
   */
  blues?: boolean;
  // --- Wave 7 (docs/design/wave7.md §3.3) -------------------------------------------------------------------
  /**
   * Slash notation (a rhythm staff, `staff: "rhythm"`): every stroke takes a slash notehead (abcjs
   * `!style=rhythm!`), as comping is written under chord symbols (`compingInput` sets it). Ignored on other staves.
   */
  slashes?: boolean;
  /**
   * Print the meter's grouping in the time signature, as an additive signature ("3+2" over 4, "2+2+3" over 8,
   * "2+2+2+3" over 8: ABC `M:2+2+3/8`), for a meter whose bar divides into unequal groups (5/4, 5/8, 7/8, 9/8i).
   * The beaming follows the grouping either way.
   */
  showGrouping?: boolean;
  /**
   * Brackets over spans of the top staff (a hemiola's "3 × 2", a polyrhythm's "3:2", a polymeter's "3 over 4"):
   * the text is printed over the note or rest that starts the span (abcjs cannot draw a bracket that is not a
   * tuplet's: `ABCJS_LIMITS` "rhythm-bracket"); a tuplet inside the span draws its own bracket.
   */
  brackets?: readonly RhythmBracketInput[];
  /**
   * A track whose notes divide every bar into `p` equal parts is written as one bar-wide tuplet of `p` in the time of
   * `q` (`(4:3:4` four quarters over a 3/4 bar), instead of the plain values that would also fit (dotted eighths). A
   * bar of the track that does not fall on the `p` grid is written as usual. 3:2 over a 4/4 bar needs nothing here:
   * the quantizer finds it.
   */
  polyTuplets?: readonly { track: string; p: number; q: number }[];
  /**
   * A polymeter in one meter (Oak draws it with accents, not as two meters: `ABCJS_LIMITS` "polymeter"): every note
   * of `track` that starts a cycle of the shorter pattern (each `every` cycles from cycle 0: `[3, 4]` for three
   * quarter-note steps a bar) is accented (`!>!`).
   */
  cycleAccents?: readonly { track: string; every: Rat }[];
  /**
   * Ghost notes on the percussion and rhythm staves: a stroke whose effective gain is at most `GHOST_MAX_GAIN`
   * while the loudest stroke of its track in the engraved bars is at least twice as loud is listed by
   * `ghostMarks` (`NoteItem.ghosts`); `markGhostNotes` (render.dom.ts) draws its head in parentheses.
   */
  ghosts?: boolean;
  /**
   * Every track of a staff keeps its own voice (stems up for the higher line), also where its notes fall in the
   * other track's rhythm and would otherwise be merged into chords: a counter-melody against the tune (A2.L03).
   * At most four voices a staff (more keeps the usual lines).
   */
  trackVoices?: boolean;
}

/** Wave 7: a bracket over a span of one bar (`NotationInput.brackets`); `RhythmBracket` of wave7.ts. */
export interface RhythmBracketInput {
  /** 0-based cycle (absolute) where the span starts. */
  bar: number;
  /** Start and end inside the piece, in cycles from `bar` (`to` may pass the bar line: a hemiola). */
  from: Rat;
  to: Rat;
  text: string;
  /**
   * The bars the span covers whole are written in this many quarter-note beats (6/8 heard in three: `3`), so a
   * hemiola's quarters are not tied over the dotted-quarter beat. Only for /8 meters whose bar holds that many
   * quarters (6/8: 3, 12/8: 6); ignored otherwise.
   */
  beatsPerBar?: number;
}
/** Wave 7: a bracket placed in the Score (`Score.brackets`). */
export interface ScoreBracket {
  /** 0-based cycle of the start. */
  bar: number;
  /** Absolute start and end in cycles. */
  at: Rat;
  to: Rat;
  /** Where the text stands when no item starts at `at` (inside a tuplet): the item sounding there. */
  drawnAt?: Rat;
  text: string;
}

/** Wave 5: a section label on the staff (`sectionMarks` of `@oak/notation`). */
export interface SectionMark {
  /** 0-based cycle (absolute) where the section starts. */
  bar: number;
  /** "Verse", "Chorus 2": the text over the staff. */
  text: string;
  /** The tagged name as the code writes it ("chorus2"). */
  tag: string;
  /** A double barline before this bar (every section but the first). */
  doubleBar: boolean;
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
  /**
   * `NEvent.id`s this item engraves, low to high (aligned with `pitches`). Wave 5 (c5): events in unison with a
   * head follow the heads; `doubled[k]` is the index in `pitches` of the head that `eventIds[pitches.length + k]`
   * doubles.
   */
  eventIds: string[];
  doubled?: number[];
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
  /** Wave 7: the heads (indices in `pitches`) that are ghost notes (`NotationInput.ghosts`). */
  ghosts?: number[];
  /** Wave 7: an accent (`!>!`) on the first piece (`NotationInput.cycleAccents`). */
  accent?: true;
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
  /** This staff's own signature (`NotationInput.trackKeys`); absent: the score's `key`/`keyChanges`. */
  key?: KeySpec | null;
  keyChanges?: KeyChange[];
}
export interface NotationWarning {
  code:
    | "tuplet-too-long"
    | "mixed-tuplets"
    | "overlap-cut"
    | "snapped-to-grid"
    | "unpitched-dropped"
    | "out-of-range"
    /** Something abcjs 6.7.2 cannot draw as written (see `ABCJS_LIMITS`); the ABC uses the stated fallback. */
    | "abcjs-limit"
    /**
     * Wave 5: a declared swing the staff cannot carry (contracts §6.10 item 1: swing is not used in compound
     * meters, so a swung 6/8 is engraved as played and snapped); content must not declare it.
     */
    | "swing-unsupported";
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
  /**
   * Where it is drawn when no note or rest of its staff starts at `at` (a label inside a tuplet): the onset of the
   * item sounding there. The Score then carries an `abcjs-limit` warning ("label-off-grid").
   */
  drawnAt?: Rat;
  /** Code spelling as given ("Cm7b5", "V7/V"). */
  source: string;
  /** What is printed ("Cm7♭5" is written as "Cm7b5", which abcjs renders with a flat glyph). */
  text: string;
}
/**
 * A key signature change: at the start of a bar, or (Wave 4, `beat` > 1) inside it, where the new signature is
 * written in the bar (abcjs has no mid-bar double barline: `ABCJS_LIMITS` "mid-bar-key-change").
 */
export interface KeyChange {
  /** 0-based cycle (absolute, like `ScoreAnnotation.bar`). */
  bar: number;
  /** 1-based beat in tempo units where the new key starts (1.5 = the "&" of beat 1). Default 1: the bar line. */
  beat?: number;
  key: KeySpec;
}
/** The NotationModel. Everything a staff view needs, with no abcjs in it. */
export interface Score {
  meter: MeterSpec;
  /** The signature at the start (every bar, without `keyChanges`). */
  key: KeySpec | null;
  /** Signature changes at bar lines inside the score, in order (absent: one key throughout). */
  keyChanges?: KeyChange[];
  tempoBpm?: number;
  /** "Swing 8ths" or "Swing 16ths" when the input declared a swing. */
  swingText?: string;
  /** The declared grid the notes were moved to (`NotationInput.grid`), in steps per bar. */
  grid?: number;
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
  /** The annotation lines asked for (`NotationInput.annotations`), when any kind is on. */
  annotations?: AnnotationSet;
  title?: string;
  /**
   * The piece declares a pickup (`NotationInput.pickup`): bar numbers count cycle 0 as bar 0, also on a page that
   * does not engrave it (`startBar` > 0). `pickup` above says whether bar 0 is engraved short here.
   */
  pickupNumbering?: true;
  /** A lead sheet (`staff: "lead"`): `toAbc` numbers the first bar of every system unless told otherwise. */
  lead?: true;
  /**
   * Wave 5: the section marks inside the engraved bars (`NotationInput.sections`), in order: a part label over the
   * first bar of each and a double barline before each one that asks for it.
   */
  sections?: SectionMark[];
  /** Wave 5: blue notes were spelled as blues (`NotationInput.blues`). */
  blues?: true;
  /** Wave 7: the strokes of the rhythm staff take slash noteheads (`NotationInput.slashes`). */
  slashes?: true;
  /** Wave 7: the meter's grouping as the additive signature prints it ("2+2+3"), when asked for and unequal. */
  groupingText?: string;
  /** Wave 7: bracket texts over spans of the top staff (`NotationInput.brackets`), in time order. */
  brackets?: ScoreBracket[];
}
export type NotationModel = Score;

export interface AbcOptions {
  barsPerLine?: number;
  /**
   * End the last bar with the final barline `|]` (default). False for a page of a longer piece: a page that is
   * not the piece's end closes with a plain barline.
   */
  finalBar?: boolean;
  /** Class prefix; default "oak-e". */
  classPrefix?: string;
  /**
   * Print the bar number at the start of every system after the first bar (with a pickup, cycle 0 is bar 0 and the
   * first full bar is 1). Default: true for a lead sheet (`Score.lead`), false otherwise.
   */
  barNumbers?: boolean;
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

// What a rubric rule can read besides the events (contracts §5.6, §6.3–§6.6).
import type { KeySpec, LearnerProfile, NEvent, ParamValues, Reference } from "@oak/content-kit";
import type { NormalizeContext, Normalized } from "../types.ts";

export interface RubricContext extends NormalizeContext {
  code: string;
  params: ParamValues;
  /** Bars actually queried; default: through the last event. */
  bars?: number;
  /** The `arrange()` total from the AST, else `periodOf` (contracts §6.4); `null` when unknown. */
  totalBars?: number | null;
  /** Maps code to toolbox IDs (`toolsUsed` of the lint). Without it `uses` falls back to a source scan. */
  toolsUsed?: (code: string) => { id: string }[];
  /** A toolbox entry's code form, so details name a tool as it is written (`toolText`). */
  toolCode?: (id: string) => string | null;
  /** For `range: 'learner-voice'`. */
  profile?: LearnerProfile;
  /** Evaluated reference for a `matches` rule; the grade pipeline evaluates it before the rubric runs. */
  resolveReference?: (ref: Reference) => Normalized | null;
  /** Every solution of a reference, evaluated (a `matches` rule passes on the closest). */
  resolveReferences?: (ref: Reference) => Normalized[];
  /**
   * Wave 6. The key in force at each bar (index = 0-based cycle of the events the rule reads): set by `evalRule`
   * for a rule scoped to a section, so a lifted last chorus is read in its own key. Absent: `ruleKeys` reads it
   * from the piece (`keysByBar`).
   */
  keyByBar?: KeySpec[];
  /**
   * Wave 6. The sections of the song a transcription capstone arranges, in order (`SongDef.answerKey.sections`):
   * what the `form` pattern `@song` compares with (CF-T.S4). `bars` is the section's length.
   */
  songForm?: readonly { label: string; bars: number; chords?: readonly (readonly string[])[] }[];
  /**
   * Wave 7 (carry f4; docs/design/wave7.md §3.2): the song's own melody, note by note, for the rules that keep a
   * tune (CF-T.S4's arrangement, JC4's reharmonisation, AC1's two versions; `song-melody-kept`). Onsets in bars from
   * the first full bar (a pickup's notes are negative), MIDI as the answer key writes it. The capstone host fills it
   * from `SongDef.answerKey` (the song the learner picked); absent, those rules fail "not built yet" or name it.
   */
  songMelody?: readonly import("../types.ts").SongMelodyNote[];
  /** Wave 7 (AC1): the other version of a two-version capstone, evaluated (`GradeContext.otherVersion`). */
  otherVersion?: { id: "a" | "b"; n: Normalized };
}

/** The learner tracks a rubric reads; Band tracks are never counted (contracts §6.2 item 5). */
export const learnerEvents = (n: Normalized): NEvent[] => n.all;

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
  songForm?: readonly { label: string; bars: number }[];
}

/** The learner tracks a rubric reads; Band tracks are never counted (contracts §6.2 item 5). */
export const learnerEvents = (n: Normalized): NEvent[] => n.all;

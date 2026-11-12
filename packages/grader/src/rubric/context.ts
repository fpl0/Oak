// What a rubric rule can read besides the events (contracts §5.6, §6.3–§6.6).
import type { LearnerProfile, NEvent, ParamValues, Reference } from "@oak/content-kit";
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
}

/** The learner tracks a rubric reads; Band tracks are never counted (contracts §6.2 item 5). */
export const learnerEvents = (n: Normalized): NEvent[] => n.all;

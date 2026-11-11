// Session budget and authoring caps (contracts §9.1, §9.2, §9.4).
import type { LessonDef, StepDef } from "./schema/lesson.ts";

export type TargetMinutes = 15 | 20 | 25;

/** Every `step.minutes` is an expert estimate; CI multiplies by this. */
export const BEGINNER_FACTOR = 1.4;

/** Minutes per target (§9.1). `contentCap` = New + Make. */
export const SESSION_BUDGET: Readonly<
  Record<
    TargetMinutes,
    {
      warmup: number;
      new: number;
      make: number;
      coda: number;
      contentCap: number;
      capstoneWork: number;
      gymWork: number;
    }
  >
> = {
  15: { warmup: 4, new: 7, make: 3, coda: 1, contentCap: 10, capstoneWork: 11, gymWork: 10 },
  20: { warmup: 5, new: 9, make: 4, coda: 1, contentCap: 13, capstoneWork: 15, gymWork: 14 },
  25: { warmup: 6, new: 13, make: 5, coda: 1, contentCap: 18, capstoneWork: 20, gymWork: 19 },
};
/** Checkpoint day at every target: warm-up 3, checkpoint 12, Make 4, Coda 1. */
export const CHECKPOINT_DAY = { warmup: 3, checkpoint: 12, make: 4, coda: 1 } as const;

export const AUTHORING_CAPS = {
  /** Scaled minutes over all non-optional steps, Make included. */
  lessonScaledMinutes: 13,
  maxSteps: 12,
  maxGradedChecks: 3,
  maxTerms: 3,
  /** In U00 to U04 a step may enable at most this many of {roll, staff, keyboard}. */
  earlyPanels: 2,
  earlyPanelUnits: ["U00", "U01", "U02", "U03", "U04"],
  /** Optional stretch steps, scaled, in total. */
  optionalScaledMinutes: 5,
  splitPartAScaled: 8.5,
  splitPartBScaled: 9.5,
  /** The Quick sketch that ends part A is budgeted at this many minutes. */
  quickSketchMinutes: 1.5,
  promptWords: 60,
  conceptWords: 120,
} as const;

export interface LessonBudget {
  /** Σ minutes of non-optional steps. */
  expertMinutes: number;
  scaledMinutes: number;
  optionalScaledMinutes: number;
  partAScaled: number;
  partBScaled: number;
  gradedChecks: number;
  steps: number;
  /** Whether the 15-minute target splits this lesson at `wrapAt` (scaled content over 10 minutes). */
  splitsAt15: boolean;
}

const scaled = (steps: readonly StepDef[]): number =>
  steps.reduce((sum, s) => sum + s.minutes, 0) * BEGINNER_FACTOR;

export function lessonBudget(def: Pick<LessonDef, "steps" | "wrapAt">): LessonBudget {
  const required = def.steps.filter((s) => !s.optional);
  const wrapIndex = required.findIndex((s) => s.id === def.wrapAt);
  const partA = wrapIndex >= 0 ? required.slice(0, wrapIndex + 1) : required;
  const partB = wrapIndex >= 0 ? required.slice(wrapIndex + 1) : [];
  const total = scaled(required);
  return {
    expertMinutes: required.reduce((sum, s) => sum + s.minutes, 0),
    scaledMinutes: total,
    optionalScaledMinutes: scaled(def.steps.filter((s) => s.optional)),
    partAScaled: scaled(partA),
    partBScaled: scaled(partB),
    gradedChecks: def.steps.filter((s) => s.graded).length,
    steps: def.steps.length,
    splitsAt15: total > SESSION_BUDGET[15].contentCap,
  };
}

// zod schemas for tool inputs. The tools are `strict`, but inputs are validated here anyway:
// strict schemas cannot express ranges, and an eager-streamed or truncated input can arrive with
// a required field silently missing (spike S6, "SDK tolerant JSON parser").
//
// Out-of-range numbers are clamped, not rejected: the contract says "numeric ranges clamped on
// the server", and a hint should not fail because the model asked for 32 bars.
import { z } from "zod";
import { CapstoneReviewSchema, TranscriptionReviewSchema } from "../reviews.ts";
import type { ToolName } from "./defs.ts";

/** Longest code the tutor may pass or propose. Anything longer is not a hint. */
export const MAX_CODE_CHARS = 8_000;
export const MAX_BARS = 16;
/** A card is validated with a fixed 4-bar evaluation that must not be silent (contracts §10.3). */
export const CARD_EVAL_BARS = 4;
export const MAX_EVENTS_PER_TRACK = 64;

const code = z.string().min(1).max(MAX_CODE_CHARS);
const id = z.string().min(1).max(200);
const int = z.number().int();

export function clampBars(n: number): number {
  return Math.min(MAX_BARS, Math.max(1, n));
}

export function clampFromBar(n: number): number {
  return Math.min(10_000, Math.max(1, n));
}

export const ToolSchemas = {
  evaluate_strudel: z.strictObject({
    code,
    from_bar: int,
    bars: int,
    key: z.string().max(60).nullable(),
  }),
  compare_haps: z.strictObject({
    learner_code: code.nullable(),
    target: z.strictObject({
      kind: z.enum(["exercise", "code"]),
      ref: z.string().min(1).max(MAX_CODE_CHARS),
    }),
    from_bar: int,
    bars: int,
    mode: z.enum(["auto", "events", "rhythm", "melody", "harmony", "pcset"]),
  }),
  get_learner_progress: z.strictObject({}),
  get_lesson_context: z.strictObject({ lesson_id: id, step_id: id.nullable() }),
  propose_code: z.strictObject({
    kind: z.enum(["hint", "fix", "variation", "example", "next_step"]),
    title: z.string().min(1).max(120),
    code,
    explanation: z.string().max(2_000),
    bars: int,
  }),
  // Counts and word limits of the reviews are checked by reviews.ts, with messages the model can act on.
  submit_capstone_review: CapstoneReviewSchema,
  submit_transcription_review: TranscriptionReviewSchema,
} satisfies Record<ToolName, z.ZodType>;

export type ToolInput<N extends ToolName> = z.infer<(typeof ToolSchemas)[N]>;

export function inputProblems(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`);
}

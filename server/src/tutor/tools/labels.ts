// The status line a tool call shows in the panel while it runs. One wording for both backends,
// so the panel reads the same whichever one answered.
import type { ToolName } from "./defs.ts";

const LABELS: Record<ToolName, string> = {
  compare_haps: "Comparing with the target",
  evaluate_strudel: "Running the code",
  get_learner_progress: "Looking at your progress",
  get_lesson_context: "Reading the lesson",
  propose_code: "Writing a code card",
  submit_capstone_review: "Writing the review",
  submit_transcription_review: "Writing the review",
};

/** `name` is whatever the model's stream says, so an unknown name gets a neutral label. */
export function toolStatusLabel(name: string): string {
  return (LABELS as Record<string, string>)[name] ?? "Working";
}

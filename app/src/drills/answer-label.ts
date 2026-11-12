// Accessible names of the answer group, per kind ("Your answer: which degree?").
import type { AnswerSpec } from "../answers/types.ts";

export function answerWidgetLabel(spec: AnswerSpec): string {
  switch (spec.ui) {
    case "degree-pad":
      return (spec.sequenceLen ?? 1) > 1
        ? "Your answer: the degrees, in order"
        : "Your answer: which degree?";
    case "quality-pad":
      return "Your answer: which chord quality?";
    case "rn-palette":
      return "Your answer: Roman numerals";
    case "text":
      return "Your answer";
    case "number":
      return "Your answer: a number";
    case "grid":
      return "Your answer: the hits on the grid";
    case "code":
      return "Your answer: the code";
    case "staff-input":
      return "Your answer: the notes on the staff";
    default:
      return "Your answer";
  }
}

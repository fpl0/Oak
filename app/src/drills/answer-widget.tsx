// Answer widgets for drill trials: the answers registry (app/src/answers/registry.tsx). Taps and singing use the
// drills' own TapPanel and SingPanel (a drill's response window, count-in and grading are tied to @oak/drills
// params); every other answer surface comes from the registry.
import type { ComponentType } from "react";
import { answerWidgetFor } from "../answers/registry.tsx";
import type { AnswerSpec, AnswerWidgetProps } from "../answers/types.ts";

type AnyWidget = ComponentType<AnswerWidgetProps>;

/** The widget for a drill answer, or null when the registry has none for its kind (staff input, Wave 3). */
export function drillWidgetFor(spec: AnswerSpec): AnyWidget | null {
  return answerWidgetFor(spec as never) as AnyWidget | null;
}

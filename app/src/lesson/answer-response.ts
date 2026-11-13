// The response an answer widget's value becomes in a lesson or checkpoint step (pure: no React, no worker). Most
// kinds are the answers area's own `responseOf`; the lesson host adds what depends on the exercise kind.
import type { AttemptResponse } from "@oak/api";
import { responseOf } from "../answers/response.ts";
import type { AnswerSpec, AnswerValue } from "../answers/types.ts";

/** The bar picked on the bar buttons as the answer to a question: `{ answer: { number } }`. */
export function barAnswer(bars: readonly number[]): AttemptResponse {
  const last = bars.at(-1);
  return last === undefined ? { skipped: true } : { answer: { number: last } };
}

/**
 * A widget's value as the step sends it. "Which bar?" asked as a question (an identify or a fact: U09.L01 S6,
 * U09.L05 S6, U11.L08 S5) is graded as `answer.number`; the widget's own `click` stays the error hunt's bar click.
 */
export function answerResponse(exerciseKind: string, spec: AnswerSpec, value: AnswerValue): AttemptResponse {
  if (spec.ui === "bar-buttons" && exerciseKind !== "error-hunt") return barAnswer(value as number[]);
  return responseOf(spec, value);
}

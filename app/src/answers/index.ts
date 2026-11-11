// The answers area: every answer widget behind the AnswerWidget contract (docs/design/wave2.md §3.1), the registry,
// the environment some widgets read, and the pure helpers hosts use to grade taps and sung notes the same way.
export {
  type AnswerAudio,
  type AnswerEnv,
  AnswerEnvProvider,
  appAudio,
  NEUTRAL_PROFILE,
  type QuietEvidence,
  type SingEnv,
  type SingTake,
  type TapEnv,
  type TapTake,
  useAnswerEnv,
} from "./env.tsx";
export { ANSWER_WIDGETS, AnswerUnavailable, AnswerView, answerWidgetFor } from "./registry.tsx";
export { emptyValue, gridSteps, isComplete, responseOf, slotCount } from "./response.ts";
export { DEFAULT_SING_TOL, fitNotes, gradeTake, type SingNote, singFeedback, summarize } from "./sing.ts";
export { DEFAULT_TAP_TOL, type TapReport, tapReport, targetSeconds } from "./tap.ts";
export * from "./types.ts";

// The answers area: every answer widget behind the AnswerWidget contract (docs/design/wave2.md §3.1), the registry,
// the environment some widgets read, and the pure helpers hosts use to grade taps and sung notes the same way.

export {
  StagedDictation,
  type StagedDictationProps,
  type StagedListen,
} from "./dictation/StagedDictation.tsx";
export {
  chordCount,
  currentStage,
  emptyStaged,
  STAGE_TEXT,
  type StagedFeedback,
  type StagedSpec,
  type StagedValue,
  type StageStatus,
  stageComplete,
  stagedResponse,
  stageStatuses,
  stageWidget,
} from "./dictation/stages.ts";
export type { HarmonyEnv } from "./env.tsx";
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
export {
  buildChord,
  chordParts,
  composeChord,
  describeBuilt,
  progressionHits,
  rnMidis,
  rnSymbol,
  voiceChord,
} from "./harmony.ts";
export { ANSWER_WIDGETS, AnswerUnavailable, AnswerView, answerWidgetFor } from "./registry.tsx";
export { emptyValue, gridSteps, isComplete, responseOf, slotCount } from "./response.ts";
export {
  cadenceChords,
  DEFAULT_SING_TOL,
  degreeNotes,
  fitNotes,
  gradeTake,
  type SingNote,
  singFeedback,
  summarize,
  takeNotes,
  targetLabel,
  voiceSing,
} from "./sing.ts";
export { DEFAULT_TAP_TOL, type TapReport, tapReport, targetSeconds } from "./tap.ts";
export * from "./types.ts";

// The answers area: every answer widget behind the AnswerWidget contract (docs/design/wave2.md §3.1), the registry,
// the environment some widgets read, and the pure helpers hosts use to grade taps and sung notes the same way.

export { barGridStart, entryText as barGridEntryText } from "./bar-grid.ts";
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
export type { CompareEnv, HarmonyEnv, KeyChangeEnv, SliderEnv, TensionEnv } from "./env.tsx";
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
  guideToneFacts,
  isBarChoice,
  isModeChoice,
  keyChangeFact,
  modeFact,
  pivotFact,
  scaleMove,
} from "./facts.ts";
export { readsAsLetters, sectionText } from "./form.ts";
export {
  EMPTY_FORM_MAP,
  type FormMapGrade,
  formMapAnswer,
  formMapComplete,
  formMapMarks,
  formMapMarksFromSlots,
  formMapOf,
  formMapSections,
  formMapValue,
  type MapSection,
  mapBlocks,
  mapLetters,
} from "./form-map.ts";
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
// Wave 7 (wave7.md §11): the tracks' answer logic, for hosts that grade, name or draw beside a widget.
export {
  type ChordStyle,
  jazzReading,
  jazzRnButtons,
  type RnBracket,
  rnBrackets,
  staffChordMidis,
  styledSymbol,
  type TensionReading,
  tensionOf,
  VOICING_SHAPE_TEXT,
  type VoicingReadout,
  voicedChordOf,
  voicingReadout,
} from "./jazz.ts";
export { appliedTargetsOf, applyOf, gridLayout, isModalKey, rnModeOf } from "./keys.ts";
export { chordTyped } from "./normalize.ts";
export { ANSWER_WIDGETS, AnswerUnavailable, AnswerView, answerWidgetFor } from "./registry.tsx";
export {
  emptyValue,
  gridSteps,
  incompleteReason,
  isComplete,
  responseOf,
  scaleStart,
  slotCount,
} from "./response.ts";
export {
  claveCells,
  claveParts,
  euclidCells,
  euclidMini,
  euclidOf,
  groupingComplete,
  groupingUnits,
  isClaveChoice,
  type LaneSetup,
  type LanesReport,
  lanesReport,
  laybackHits,
  laybackWords,
  sameEuclid,
  splitLanes,
  swingHits,
  swingWords,
} from "./rhythm7.ts";
export { spellDegreeName, valueDegrees } from "./scale.ts";
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
export {
  COMPARE_AXES,
  type ComparePair,
  comparePairOf,
  isRegisterChoice,
  type RegisterBand,
  registerBands,
} from "./sound7.ts";
export {
  applyRhythmEdit,
  type RhythmEdit,
  type RhythmPalette,
  type RhythmToken,
  rhythmPalette,
  rhythmTokens,
  tripletGroupsOfValue,
} from "./staff/rhythm.ts";
export {
  DEFAULT_TAP_TOL,
  padGrid,
  type TapReport,
  tapReport,
  targetPlace,
  targetSeconds,
} from "./tap.ts";
export * from "./types.ts";
export { isTensionChoice } from "./widgets/TensionPick.tsx";

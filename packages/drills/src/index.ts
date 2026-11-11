// @oak/drills: generators, set planning, trial grading and AudioPlans. Pure and isomorphic: the same
// code plans a set in the browser and re-checks it on the server. Trials are generated as events, never
// by evaluating Strudel code; the shown `code` evaluates to the same events (property-tested).

export { clickPlan, eventsToAudioPlan, trialAudio } from "./audio.ts";
export { DECKS, FAMILIES } from "./catalog/families.ts";
export {
  bindDeck,
  bindFamily,
  categoryWeight,
  createRegistry,
  DEFAULT_PROFILE,
  type DrillRegistry,
  factOutcome,
  GENERATORS,
  generateSet,
  generateTrial,
  gradeFactCard,
  gradeTrial,
  isCompositeGenerator,
  isPendingGenerator,
  levelAfterSet,
  levelAtDifficulty,
  listenBlock,
  maxOpenLevel,
  openCategoriesOf,
  planCompositeSet,
  planSet,
  type SetReviewOutcome,
  setOutcome,
  setPreload,
  staircaseStep,
  summarizeSet,
} from "./engine.ts";
export { gradeSungResolution } from "./gen/degree.ts";
export { type DrillTrialResult, gradeAnswer, normalizeAnswerText } from "./grade.ts";
export { generateLadderPiece } from "./ladder.ts";
export { parseMini, parseMiniCode } from "./mini.ts";
export { BASS, CLICKS, KEYS1, KEYS2, KEYS3, KITS, LEAD, soundName } from "./pools.ts";
export { createRng, hashString, trialSeed } from "./rng.ts";
export * from "./types.ts";

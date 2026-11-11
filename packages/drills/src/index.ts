// @oak/drills: generators, set planning, trial grading and AudioPlans. Pure and isomorphic: the same
// code plans a set in the browser and re-checks it on the server. Trials are generated as events, never
// by evaluating Strudel code.
import type {
  Answer,
  DeckId,
  FactDeck,
  FamilyDef,
  FamilyId,
  LearnerProfile,
  LevelParams,
  NEvent,
  Trial,
  TrialResult,
} from "@oak/content-kit";
import type {
  AudioPlan,
  DrillFamilyRuntime,
  FactDeckRuntime,
  Rng,
  SetPlan,
  SetPlanInput,
  SetSummary,
  StaircaseState,
  TrialResponse,
  TrialSpec,
} from "./types.ts";

export * from "./types.ts";

function todo(name: string): never {
  throw new Error(`@oak/drills: ${name} is not implemented yet`);
}

/** `mulberry32(hash(familyId, setId, trialIndex))` wrapped with the helpers generators need. */
export function createRng(seed: number): Rng {
  return todo(`createRng(${seed})`);
}
/** The seed of trial `index` of a set. Stored per trial, so a trial is reproducible for the tutor and for bug reports. */
export function trialSeed(family: FamilyId, setId: string, index: number): number {
  return todo(`trialSeed(${family}, ${setId}, ${index})`);
}

// --- registry -----------------------------------------------------------------------------------

/** Binds a content `FamilyDef` to the generator its `generator` field names. Throws for an unknown generator. */
export function bindFamily<L extends LevelParams = LevelParams>(def: FamilyDef<L>): DrillFamilyRuntime<L> {
  return todo(`bindFamily(${def.id})`);
}
export function bindDeck(def: FactDeck): FactDeckRuntime {
  return todo(`bindDeck(${def.id})`);
}
export interface DrillRegistry {
  family(id: FamilyId): DrillFamilyRuntime;
  deck(id: DeckId): FactDeckRuntime;
  families(): DrillFamilyRuntime[];
  decks(): FactDeckRuntime[];
}
/** The registry over `content/families.ts` and the fact decks. */
export function createRegistry(families: readonly FamilyDef[], decks: readonly FactDeck[]): DrillRegistry {
  return todo(`createRegistry(${families.length}, ${decks.length})`);
}
/** Names of the generators this package implements (`degree-id`, `rhythm-echo`, …): what `FamilyDef.generator` may say. */
export const GENERATORS: readonly string[] = [];

// --- sets ---------------------------------------------------------------------------------------

/**
 * Plans one set of 5 to 8 trials: level mix (75% / 25%), category sampling by weakness, no category more
 * than twice in a row, no identical (key, category) pair, sung resolutions on 2 to 3 trials at most.
 */
export function planSet(family: DrillFamilyRuntime, input: SetPlanInput): SetPlan {
  return todo(`planSet(${family.def.id}, ${input.setId})`);
}
/** A composite review: up to 10 trials, 2 per member, weighted toward the lowest recent accuracy, at most one sung member. */
export function planCompositeSet(
  members: readonly { family: DrillFamilyRuntime; input: SetPlanInput; recentAccuracy: number }[],
  setId: string,
  quiet: boolean,
): SetPlan[] {
  return todo(`planCompositeSet(${members.length}, ${setId}, ${quiet})`);
}
export function generateTrial<E = Answer>(
  family: DrillFamilyRuntime<LevelParams, E>,
  spec: TrialSpec,
  profile: LearnerProfile,
  openCategories: readonly string[],
  previous?: Trial<E>,
): Trial<E> {
  return todo(
    `generateTrial(${family.def.id}, ${spec.index}, ${profile.comfLow}, ${openCategories.length}, ${previous?.seed})`,
  );
}
export function gradeTrial<E = Answer>(
  family: DrillFamilyRuntime<LevelParams, E>,
  trial: Trial<E>,
  response: TrialResponse,
  profile: LearnerProfile,
): TrialResult {
  return todo(`gradeTrial(${family.def.id}, ${trial.seed}, ${response.rtMs}, ${profile.comfLow})`);
}
/** Folds a set's trial results into what the SRS grade map and `family_state` need. */
export function summarizeSet(
  plan: SetPlan,
  trials: readonly Trial<unknown>[],
  results: readonly TrialResult[],
): SetSummary {
  return todo(`summarizeSet(${plan.setId}, ${trials.length}, ${results.length})`);
}
/**
 * The level staircase of SRS sets: promote after two sets with mean credit ≥ 0.90 on two different days,
 * demote after a set below 0.60; a family is promoted past a level only when every category of that level is open.
 */
export function levelAfterSet(
  state: { level: number; promoDay: string | null; maxOpenLevel: number },
  summary: SetSummary,
  day: string,
): { level: number; promoDay: string | null; change: "promoted" | "demoted" | null } {
  return todo(`levelAfterSet(${state.level}, ${summary.meanCredit}, ${day})`);
}
/** Free practice and in-lesson generator steps: correct → d += 0.10; error → d −= 0.567. */
export function staircaseStep(state: StaircaseState, correct: boolean): StaircaseState {
  return todo(`staircaseStep(${state.d}, ${correct})`);
}

// --- playback and stimuli -----------------------------------------------------------------------

/** Events to an AudioPlan at `cps`, with internal superdough control names. */
export function eventsToAudioPlan(
  events: readonly NEvent[],
  cps: number,
  opts?: { gain?: number; rate?: number; transpose?: number; fromBar?: number; bars?: number },
): AudioPlan {
  return todo(`eventsToAudioPlan(${events.length}, ${cps}, ${opts?.rate})`);
}
/** The parts of a trial as plans: the cue (cadence, count-in), the stimulus, and the resolution or contrast replay. */
export function trialAudio(
  trial: Trial<unknown>,
  key?: { tonic: string; mode: string },
): { cue: AudioPlan | null; stimulus: AudioPlan; resolution: AudioPlan | null } {
  return todo(`trialAudio(${trial.seed}, ${key?.tonic})`);
}
/** A click track: `bars` of the meter's tempo units, accented on beat 1. */
export function clickPlan(bars: number, cps: number, unitsPerBar: number): AudioPlan {
  return todo(`clickPlan(${bars}, ${cps}, ${unitsPerBar})`);
}
/**
 * Generated ladder material L1 to L4 (drum loops, bass lines, four-chord loops, short melodies) at a
 * realism level R0 to R4. Returns the hidden reference code and its events; never authored by hand.
 */
export function generateLadderPiece(
  level: 1 | 2 | 3 | 4,
  realism: 0 | 1 | 2 | 3 | 4,
  seed: number,
  profile: LearnerProfile,
): { code: string; events: NEvent[]; cps: number; bars: number; preload: string[] } {
  return todo(`generateLadderPiece(${level}, ${realism}, ${seed}, ${profile.comfLow})`);
}

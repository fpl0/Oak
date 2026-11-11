// Where the trials of a set come from (pure; the machine asks `source.at(i, outcomes)`): a planned SRS set
// fixed by the session's setId, a composite review interleaving its members, or the free-practice staircase.
// Deterministic for a given session, so a reload regenerates the very same trials.
import type { DrillSession, FamilyDef, FamilyState, LearnerProfile, Trial } from "@oak/api";
import {
  type DrillFamilyRuntime,
  type DrillRegistry,
  generateSet,
  generateTrial,
  planCompositeSet,
  staircaseStep,
  trialSeed,
} from "@oak/drills";
import type { TrialSource } from "./machine.ts";
import { type PlannedTrial, planDrillSet, type TrialOutcome } from "./model.ts";

export interface SourceEnv {
  registry: DrillRegistry;
  defs?: ReadonlyMap<string, FamilyDef>;
  states: ReadonlyMap<string, FamilyState>;
  profile: LearnerProfile;
  easyFirst: boolean;
  sungResolutions: number;
}

/** Planned single-family set: the trials are fixed by the session's setId. */
export function plannedSource(
  env: SourceEnv,
  family: DrillFamilyRuntime,
  session: DrillSession,
): TrialSource {
  const { trials } = planDrillSet(family, session, env.states.get(family.def.id) ?? null, env.profile, {
    easyFirst: env.easyFirst,
    sungResolutions: env.sungResolutions,
  });
  return { total: trials.length, at: (i) => trials[i] as PlannedTrial };
}

/** A composite review: one plan per member, interleaved round-robin. */
export function compositeSource(env: SourceEnv, session: DrillSession): TrialSource {
  const members = session.familyIds.map((id) => {
    const family = env.registry.family(id);
    const st = env.states.get(id);
    const stats = Object.values(st?.categoryStats ?? {});
    const n = stats.reduce((a, s) => a + s.n, 0);
    return {
      family,
      input: {
        family: id,
        setId: session.setId,
        level: session.levels[id] ?? 1,
        openCategories: session.openCategories[id] ?? [],
        categoryStats: st?.categoryStats ?? {},
        blockedRemaining: 0,
        quiet: env.profile.quiet,
      },
      recentAccuracy: n === 0 ? 0.5 : stats.reduce((a, s) => a + s.hits, 0) / n,
    };
  });
  const plans = planCompositeSet(members, session.setId, env.profile.quiet);
  const lists = plans.map((plan) => {
    const family = env.registry.family(plan.family);
    const trials = generateSet(family, plan, env.profile, session.openCategories[plan.family] ?? []);
    return plan.trials.map((spec, i) => ({ spec, trial: trials[i] as Trial }));
  });
  const out: PlannedTrial[] = [];
  for (let round = 0; out.length < lists.reduce((a, l) => a + l.length, 0); round++)
    for (const l of lists) if (l[round]) out.push(l[round] as PlannedTrial);
  return { total: out.length, at: (i) => out[i] as PlannedTrial };
}

/**
 * Free practice: Kaernbach's weighted up-down on continuous difficulty (correct +0.10, error −0.567, converging
 * on about 85% success). The level of trial i follows from the answers before it, so the source stays
 * deterministic and a reload regenerates the same trials.
 */
export function staircaseSource(
  family: DrillFamilyRuntime,
  session: DrillSession,
  profile: LearnerProfile,
  startLevel: number,
  maxLevel: number,
): TrialSource & { levelAt(outcomes: readonly TrialOutcome[]): number } {
  const id = family.def.id;
  const levels = family.def.levels.length;
  const levelAt = (outcomes: readonly TrialOutcome[]): number => {
    let st = { d: Math.max(1, Math.min(maxLevel, startLevel)), levels };
    for (const o of outcomes) if (o && o.result.skipped !== true) st = staircaseStep(st, o.result.correct);
    return Math.max(1, Math.min(maxLevel, Math.floor(st.d)));
  };
  const cache = new Map<string, PlannedTrial>();
  return {
    total: family.def.trialsPerSet,
    levelAt,
    at(i, outcomes) {
      const level = levelAt(outcomes.slice(0, i));
      const key = `${i}|${level}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const spec = { index: i, family: id, level, category: "", seed: trialSeed(id, session.setId, i) };
      const previous = i > 0 ? cache.get(`${i - 1}|${levelAt(outcomes.slice(0, i - 1))}`)?.trial : undefined;
      const trial = generateTrial(family, spec, profile, session.openCategories[id] ?? [], previous) as Trial;
      const planned = { spec: { ...spec, category: trial.category }, trial };
      cache.set(key, planned);
      return planned;
    },
  };
}

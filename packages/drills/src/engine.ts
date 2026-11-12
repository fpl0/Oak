// The drill engine: binding families to generators, set planning (level mix, category sampling by
// weakness, blocked introductions, composites, sung resolutions), trial generation and grading, set
// summaries, the level staircase (SRS sets) and the Kaernbach staircase (free practice), and the
// outcome handed to the SRS grade map.
import type {
  Answer,
  DeckId,
  FactCardDef,
  FactDeck,
  FamilyDef,
  FamilyId,
  HintRung,
  KeySpec,
  LearnerProfile,
  LevelParams,
  Md,
  SkillRef,
  SoundId,
  Trial,
  TrialResult,
} from "@oak/content-kit";
import { trialAudio } from "./audio.ts";
import type { GenCtx, Generator } from "./gen/common.ts";
import { GENERATOR_NAMES, generatorFor } from "./gen/index.ts";
import { type DrillTrialResult, gradeAnswer, gradeDefault } from "./grade.ts";
import { sameKey } from "./kernel.ts";
import { CADENCE_SOUNDS, soundName } from "./pools.ts";
import { createRng, hashString, trialSeed } from "./rng.ts";
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

export const GENERATORS: readonly string[] = GENERATOR_NAMES;

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/#/g, "s")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "x";

/** Categories of a level that are open; the level's own list when none is (lesson steps, previews). */
export function openCategoriesOf(level: LevelParams, open: readonly string[]): string[] {
  const cats = level.categories.filter((c) => open.includes(c));
  return cats.length > 0 ? cats : [...level.categories];
}

// --- registry -----------------------------------------------------------------------------------

/** Binds a content `FamilyDef` to the generator its `generator` field names. Throws for an unknown generator. */
export function bindFamily<L extends LevelParams = LevelParams>(def: FamilyDef<L>): DrillFamilyRuntime<L> {
  const gen = generatorFor<L>(def.generator);
  if (!gen) throw new Error(`@oak/drills: family ${def.id} names an unknown generator "${def.generator}"`);
  const runtime: DrillFamilyRuntime<L> = {
    def,
    generate(rng, level, levelNo, profile, opts) {
      const open = openCategoriesOf(level, opts.openCategories);
      const category =
        opts.category && level.categories.includes(opts.category) ? opts.category : rng.pick(open);
      const ctx: GenCtx<L> = {
        rng,
        level,
        levelNo,
        levels: def.levels.length,
        profile,
        category,
        openCategories: opts.openCategories,
        previous: opts.previous as Trial<Answer> | undefined,
        def,
      };
      const body = gen.generate(ctx);
      return { seed: rng.seed, family: def.id, level: levelNo, category, ...body } as Trial<Answer>;
    },
    grade(trial, response, profile) {
      return gen.grade
        ? gen.grade(trial as Trial<Answer>, response, profile, def)
        : gradeDefault(trial as Trial<Answer>, response, profile, def);
    },
    exposure(rng, level) {
      if (gen.exposure) return gen.exposure(rng, level, def);
      return defaultExposure(gen, def, rng, level);
    },
    categorySkill(category) {
      if (gen.categorySkill) return gen.categorySkill(category, def);
      const declared = def.categories.find((c) => c.id === category)?.skill;
      if (declared) return declared;
      const node = String(def.skills[0]?.skill ?? "").split("/")[0];
      return `${node}/${slug(category)}` as SkillRef;
    },
  };
  return runtime;
}

/** Three labelled examples, one per category of the level (the listen block of a blocked introduction). */
function defaultExposure<L extends LevelParams>(
  gen: Generator<L>,
  def: FamilyDef<L>,
  rng: Rng,
  level: L,
): { code: string; caption: Md; bars: number }[] {
  const profile = DEFAULT_PROFILE;
  return level.categories.slice(0, 3).map((category) => {
    const body = gen.generate({
      rng,
      level,
      levelNo: def.levels.indexOf(level) + 1,
      levels: def.levels.length,
      profile,
      category,
      openCategories: level.categories,
      previous: undefined,
      def,
    });
    return { code: body.code, caption: category, bars: Number(body.params.bars ?? 1) };
  });
}

/** A neutral learner profile for exposure blocks and previews (comfortable range around A3–E4). */
export const DEFAULT_PROFILE: LearnerProfile = {
  rangeLow: 48,
  rangeHigh: 72,
  comfLow: 52,
  comfHigh: 67,
  tapLatencyMs: 0,
  tapJitterMs: 10,
  singLatencyMs: 0,
  singTolCents: 70,
  singTolMode: "auto",
  noiseFloorDb: -60,
  outputKind: "wired",
  inputKind: "builtin",
  quiet: false,
};

/** A fact card as a silent trial with one answer key (note names: the letter's case is free). */
const factTrial = (card: FactCardDef, expected: Answer): Trial<Answer> => ({
  seed: 0,
  family: "fam.fact.deck" as FamilyId,
  level: 1,
  category: card.id,
  params: { textKind: "note" },
  code: "",
  events: [],
  cps: 0.5,
  preload: [],
  cue: { context: "none", countInBars: 0, click: false, replays: -1 },
  expected,
});
/**
 * Grades a fact card answer: text, choice and number answers, with the card's own answer key and the other
 * answers it accepts (`accept`, Wave 3): the best match counts; when none matches, the diagnostics name the
 * card's own answer.
 */
export function gradeFactCard(card: FactCardDef, answer: Answer, rtMs: number): TrialResult {
  const response = { answer, rtMs, replays: 0 };
  const own = gradeAnswer(factTrial(card, card.answer), response);
  if (own.correct) return own;
  let credit = own.credit;
  for (const alt of card.accept ?? []) {
    const r = gradeAnswer(factTrial(card, alt), response);
    if (r.correct) return r;
    credit = Math.max(credit, r.credit);
  }
  return { ...own, credit };
}
export function bindDeck(def: FactDeck): FactDeckRuntime {
  return { def, grade: (card, answer, rtMs) => gradeFactCard(card, answer, rtMs) };
}

export interface DrillRegistry {
  family(id: FamilyId): DrillFamilyRuntime;
  deck(id: DeckId): FactDeckRuntime;
  families(): DrillFamilyRuntime[];
  decks(): FactDeckRuntime[];
}
/** Generator names that are declared by the catalog but not implemented yet (prefix `pending:`). */
export const isPendingGenerator = (name: string): boolean => name.startsWith("pending:");

/**
 * The registry over the family catalog and the fact decks. Families whose generator is `pending:` are
 * left out of `families()` and throw a clear error from `family(id)`; any other unknown generator throws here.
 */
/** Composite reviews (`fam.mix.*`, generator `mix.<group>`) have no generator: planCompositeSet draws from their members. */
export const isCompositeGenerator = (name: string): boolean => name.startsWith("mix.");

export function createRegistry(families: readonly FamilyDef[], decks: readonly FactDeck[]): DrillRegistry {
  const fams = new Map<FamilyId, DrillFamilyRuntime>();
  const pending = new Set<FamilyId>();
  const composites = new Set<FamilyId>();
  for (const f of families) {
    if (isPendingGenerator(f.generator)) pending.add(f.id);
    else if (isCompositeGenerator(f.generator)) composites.add(f.id);
    else fams.set(f.id, bindFamily(f));
  }
  const dks = new Map<DeckId, FactDeckRuntime>(decks.map((d) => [d.id, bindDeck(d)]));
  return {
    family(id) {
      const f = fams.get(id);
      if (f) return f;
      if (pending.has(id)) throw new Error(`@oak/drills: the generator of ${id} is not implemented yet`);
      if (composites.has(id))
        throw new Error(`@oak/drills: ${id} is a composite review; plan it with planCompositeSet`);
      throw new Error(`@oak/drills: unknown family ${id}`);
    },
    deck(id) {
      const d = dks.get(id);
      if (!d) throw new Error(`@oak/drills: unknown deck ${id}`);
      return d;
    },
    families: () => [...fams.values()],
    decks: () => [...dks.values()],
  };
}

// --- set planning -------------------------------------------------------------------------------

/** Sampling weight of a category: (1 − a_c) + 0.15 with a_c = (hits + 1) / (n + 2). */
export function categoryWeight(stat: { n: number; hits: number } | undefined): number {
  const n = stat?.n ?? 0;
  const hits = stat?.hits ?? 0;
  return 1 - (hits + 1) / (n + 2) + 0.15;
}

function levelParams(def: FamilyDef, level: number): LevelParams {
  return def.levels[Math.max(0, Math.min(def.levels.length, level) - 1)] as LevelParams;
}
function preloadOf(def: FamilyDef, levels: number[]): string[] {
  const out = new Set<string>();
  for (const l of new Set(levels)) {
    const p = levelParams(def, l);
    if (p.instruments === "drums") for (const s of ["bd", "sd", "hh", "rim", "cp"]) out.add(s);
    else for (const id of p.instruments as SoundId[]) out.add(soundName(id));
  }
  if (["degree", "interval", "melody", "harmony"].includes(def.domain))
    for (const s of CADENCE_SOUNDS) out.add(s);
  return [...out].sort();
}

/**
 * Plans one set of 5 to 8 trials: level mix (75% / 25%), category sampling by weakness, no category more
 * than twice in a row, blocked introductions (new categories against their contrast neighbours), sung
 * resolutions on 2 to 3 trials of an FET set (never in Quiet mode).
 */
export function planSet(family: DrillFamilyRuntime, input: SetPlanInput): SetPlan {
  const def = family.def;
  const rng = createRng(hashString(`${def.id}|${input.setId}|plan`));
  const n = Math.max(1, input.trials ?? def.trialsPerSet);
  const level = Math.max(1, Math.min(def.levels.length, input.level));
  // 25% one level down (none at level 1, none in a 4-trial anchor set which is already one down).
  const down = level > 1 && input.trials !== 4 ? Math.round(n * 0.25) : 0;
  const downAt = new Set(rng.shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, down));
  const trialLevels = Array.from({ length: n }, (_, i) => (downAt.has(i) ? level - 1 : level));

  const cur = levelParams(def, level);
  const prev = level > 1 ? levelParams(def, level - 1) : null;
  const staged = introStage(cur, input.openCategories, input.blockedRemaining);
  const curOpen = staged?.open ?? openCategoriesOf(cur, input.openCategories);
  const newCats = staged?.fresh ?? curOpen.filter((c) => !prev?.categories.includes(c));
  const blocked =
    staged !== null
      ? staged.fresh.length < staged.open.length
      : input.blockedRemaining > 0 && newCats.length > 0 && newCats.length < curOpen.length;
  const neighbours = blocked
    ? (() => {
        const declared = new Set(
          def.categories.filter((c) => newCats.includes(c.id)).flatMap((c) => c.contrastOf ?? []),
        );
        const ok = curOpen.filter((c) => declared.has(c) && !newCats.includes(c));
        return ok.length > 0 ? ok : curOpen.filter((c) => !newCats.includes(c));
      })()
    : [];

  const trials: TrialSpec[] = [];
  const picked: string[] = [];
  for (let i = 0; i < n; i++) {
    const lvl = trialLevels[i] as number;
    let pool = openCategoriesOf(levelParams(def, lvl), input.openCategories);
    if (staged && lvl === level) pool = curOpen;
    if (blocked && lvl === level) pool = i % 2 === 0 ? newCats : neighbours.length > 0 ? neighbours : pool;
    // No category more than twice in a row.
    const last2 = picked.slice(-2);
    if (last2.length === 2 && last2[0] === last2[1]) {
      const others = pool.filter((c) => c !== last2[0]);
      if (others.length > 0) pool = others;
    }
    const category = rng.weighted(
      pool,
      pool.map((c) => categoryWeight(input.categoryStats[c])),
    );
    picked.push(category);
    trials.push({ index: i, family: def.id, level: lvl, category, seed: trialSeed(def.id, input.setId, i) });
  }

  // Sung resolutions: FET sets only, 2–3 per set and never every trial, none in Quiet mode; they cover the
  // degrees with the lowest sung accuracy first (contracts §8.3), one trial per degree, and the tonic (a
  // path of one note) only when nothing else is left.
  if (def.generator === "degree-id" && !input.quiet) {
    const want = Math.max(0, Math.min(3, input.sungResolutions ?? 2, n - 1));
    for (const t of sungResolutionTrials(trials, input.sungStats ?? input.categoryStats, want))
      t.sungResolution = true;
  }
  return {
    setId: input.setId,
    family: def.id,
    level,
    trials,
    estSec: n * def.estTrialSec,
    preload: preloadOf(def, trialLevels),
    blockedIntro: blocked,
  };
}

/**
 * The blocked introduction of a level that declares `intro` (groups of its categories in teaching order,
 * e.g. fet-major level 1: 1 against 5, then 3): the first blocked-intro set plays the first group only, the
 * next one brings the following group in against the earlier ones, and so on. `null` when the level has no
 * `intro` or the introduction is over (`blockedRemaining` 0).
 */
export function introStage(
  level: LevelParams,
  openCategories: readonly string[],
  blockedRemaining: number,
): { open: string[]; fresh: string[] } | null {
  const groups = Array.isArray(level.intro) ? (level.intro as string[][]) : null;
  if (!groups || groups.length === 0 || blockedRemaining <= 0) return null;
  const open = openCategoriesOf(level, openCategories);
  const stage = Math.max(0, Math.min(groups.length - 1, groups.length - blockedRemaining));
  const seen = groups.slice(0, stage + 1).flat();
  const inStage = open.filter((c) => seen.includes(c));
  const fresh = inStage.filter((c) => (groups[stage] as string[]).includes(c));
  if (inStage.length === 0 || fresh.length === 0) return null;
  return { open: inStage, fresh };
}

/**
 * The trials of an FET set that ask for a sung resolution: the weakest sung degrees first (`stats`: hits
 * per category, Laplace-smoothed as in `categoryWeight`), each degree once, the tonic last, never more than
 * `want`.
 */
export function sungResolutionTrials<T extends { index: number; category: string }>(
  trials: readonly T[],
  stats: Readonly<Record<string, { n: number; hits: number }>>,
  want: number,
): T[] {
  const tonic = (t: T) => t.category === "deg.1";
  const order = [...trials].sort(
    (a, b) =>
      Number(tonic(a)) - Number(tonic(b)) ||
      categoryWeight(stats[b.category]) - categoryWeight(stats[a.category]) ||
      a.index - b.index,
  );
  const out: T[] = [];
  const used = new Set<string>();
  const take = (pass: (t: T) => boolean) => {
    for (const t of order) {
      if (out.length >= want) return;
      if (out.includes(t) || !pass(t)) continue;
      used.add(t.category);
      out.push(t);
    }
  };
  // Distinct degrees other than the tonic, then repeats of them, then the tonic.
  take((t) => !tonic(t) && !used.has(t.category));
  take((t) => !tonic(t));
  take(() => true);
  return out.sort((a, b) => a.index - b.index);
}

/**
 * A composite review: up to 10 trials, 2 per member, members rotated when there are more than 5 (the
 * lowest recent accuracy first), at most one sung member, none in Quiet mode. One plan per member.
 */
export function planCompositeSet(
  members: readonly { family: DrillFamilyRuntime; input: SetPlanInput; recentAccuracy: number }[],
  setId: string,
  quiet: boolean,
): SetPlan[] {
  const isSung = (m: { family: DrillFamilyRuntime }): boolean =>
    m.family.def.mic === true || m.family.def.answer === "mic";
  const rng = createRng(hashString(`composite|${setId}`));
  const eligible = members.filter((m) => !(quiet && isSung(m)));
  const sorted = [...eligible].sort(
    (a, b) => a.recentAccuracy - b.recentAccuracy || (rng.next() < 0.5 ? -1 : 1),
  );
  const chosen: typeof sorted = [];
  let sung = 0;
  for (const m of sorted) {
    if (chosen.length >= 5) break;
    if (isSung(m)) {
      if (sung >= 1) continue;
      sung++;
    }
    chosen.push(m);
  }
  return chosen.map((m) =>
    planSet(m.family, {
      ...m.input,
      setId: `${setId}:${m.family.def.id}`,
      trials: 2,
      blockedRemaining: 0,
      quiet,
      sungResolutions: 0,
    }),
  );
}

// --- trials -------------------------------------------------------------------------------------

export function generateTrial<E = Answer>(
  family: DrillFamilyRuntime<LevelParams, E>,
  spec: TrialSpec,
  profile: LearnerProfile,
  openCategories: readonly string[],
  previous?: Trial<E>,
): Trial<E> {
  const def = family.def;
  const level = levelParams(def, spec.level);
  const trial = family.generate(
    createRng(spec.seed),
    level,
    Math.max(1, Math.min(def.levels.length, spec.level)),
    profile,
    {
      category: spec.category,
      openCategories,
      ...(previous ? { previous } : {}),
    },
  );
  if (spec.sungResolution) trial.params = { ...trial.params, sungResolution: true };
  return trial;
}

/**
 * Generates every trial of a planned set in order. A trial that repeats an earlier (key, category) pair is
 * regenerated from a derived seed (up to 6 times), so no set asks the same thing in the same key twice.
 */
export function generateSet(
  family: DrillFamilyRuntime,
  plan: SetPlan,
  profile: LearnerProfile,
  openCategories: readonly string[],
): Trial[] {
  const out: Trial[] = [];
  for (const spec of plan.trials) {
    let trial: Trial | null = null;
    for (let attempt = 0; attempt < 7; attempt++) {
      const s = attempt === 0 ? spec : { ...spec, seed: hashString(`${spec.seed}|${attempt}`) };
      const t = generateTrial(family, s, profile, openCategories, out[out.length - 1]);
      trial = t;
      const key = t.params.key as KeySpec | undefined;
      if (!key) break;
      if (!out.some((o) => o.category === t.category && sameKey(o.params.key as KeySpec | undefined, key)))
        break;
    }
    out.push(trial as Trial);
  }
  return out;
}
/** Every sound of a generated set: preload before trial 1. */
export function setPreload(trials: readonly Trial<unknown>[]): string[] {
  const out = new Set<string>();
  for (const t of trials) {
    for (const p of t.preload) out.add(p);
    const audio = trialAudio(t);
    for (const plan of [audio.cue, audio.stimulus, audio.resolution])
      for (const p of plan?.preload ?? []) out.add(p);
  }
  return [...out].sort();
}

export function gradeTrial<E = Answer>(
  family: DrillFamilyRuntime<LevelParams, E>,
  trial: Trial<E>,
  response: TrialResponse,
  profile: LearnerProfile,
): TrialResult {
  return family.grade(trial, response, profile);
}

// --- summaries and staircases -------------------------------------------------------------------

const median = (xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

/** Folds a set's trial results into what the SRS grade map and `family_state` need. Skipped trials are left out. */
export function summarizeSet(
  plan: SetPlan,
  trials: readonly Trial<unknown>[],
  results: readonly TrialResult[],
): SetSummary {
  const pairs = trials
    .map((t, i) => ({ t, r: results[i] as DrillTrialResult | undefined, i }))
    .filter(
      (p): p is { t: Trial<unknown>; r: DrillTrialResult; i: number } =>
        p.r !== undefined && p.r.skipped !== true,
    );
  const perCategory: Record<string, { n: number; hits: number }> = {};
  const confusions: Record<string, number> = {};
  let extraReplays = 0;
  const cents: number[] = [];
  const diagnostics: SetSummary["diagnostics"] = [];
  for (const { t, r, i } of pairs) {
    const c = perCategory[t.category] ?? { n: 0, hits: 0 };
    perCategory[t.category] = c;
    c.n++;
    if (r.correct) c.hits++;
    if (r.confusion) {
      const k = `${r.confusion[0]}|${r.confusion[1]}`;
      confusions[k] = (confusions[k] ?? 0) + 1;
    }
    if (t.cue.replays >= 0) extraReplays += Math.max(0, r.replays - t.cue.replays);
    if (typeof r.centsError === "number") cents.push(r.centsError);
    for (const d of r.diagnostics) diagnostics.push({ ...d, where: { ...(d.where ?? {}), trial: i } });
  }
  const credits = pairs.map((p) => p.r.credit);
  const levels = pairs.map((p) => p.t.level);
  return {
    family: plan.family,
    trials: pairs.length,
    meanCredit: credits.length === 0 ? 0 : credits.reduce((s, x) => s + x, 0) / credits.length,
    medianRtMs: median(pairs.map((p) => p.r.rtMs)),
    extraReplays,
    meanAbsCents: cents.length === 0 ? null : cents.reduce((s, x) => s + x, 0) / cents.length,
    // The set counts as played at the card's level when most trials were (75/25 mix).
    playedLevel:
      levels.length === 0
        ? plan.level
        : median(levels) >= plan.level
          ? plan.level
          : Math.floor(median(levels)),
    perCategory,
    confusions,
    diagnostics,
  };
}

/** The SRS outcome of a set (structurally `ReviewOutcome` of @oak/srs, which this package does not import). */
export interface SetReviewOutcome {
  meanCredit: number;
  medianRtMs: number;
  fastRtMs: number;
  extraReplays: number;
  hintRung: HintRung;
  revealed: boolean;
  atOrAboveLevel: boolean;
  meanAbsCents?: number;
  tolCents?: number;
}
/** Maps a set summary to the SRS outcome; production families carry the sung accuracy and tolerance. */
export function setOutcome(
  family: DrillFamilyRuntime,
  summary: SetSummary,
  opts: {
    cardLevel: number;
    hintRung?: HintRung;
    revealed?: boolean;
    profile?: Pick<LearnerProfile, "singTolCents">;
  },
): SetReviewOutcome {
  const production = family.def.kind === "production" && family.def.mic === true;
  return {
    meanCredit: summary.meanCredit,
    medianRtMs: summary.medianRtMs,
    fastRtMs: family.def.fastRtMs,
    extraReplays: summary.extraReplays,
    hintRung: opts.hintRung ?? 0,
    revealed: opts.revealed ?? false,
    atOrAboveLevel: summary.playedLevel >= opts.cardLevel,
    ...(production && summary.meanAbsCents !== null ? { meanAbsCents: summary.meanAbsCents } : {}),
    ...(production && opts.profile ? { tolCents: opts.profile.singTolCents } : {}),
  };
}
/** A fact card's outcome: credit 0 or 1, the deck's fastRt. */
export function factOutcome(deck: FactDeck, result: TrialResult, hinted = false): SetReviewOutcome {
  return {
    meanCredit: result.correct ? 1 : 0,
    medianRtMs: result.rtMs,
    fastRtMs: deck.fastRtMs,
    extraReplays: 0,
    hintRung: hinted ? 1 : 0,
    revealed: false,
    atOrAboveLevel: true,
  };
}

/**
 * The level staircase of SRS sets: promote after two sets with mean credit ≥ 0.90 on two different days,
 * demote after a set below 0.60; a family is promoted past a level only when every category of that level
 * is open (`maxOpenLevel`). A set in between resets the pending promotion.
 */
export function levelAfterSet(
  state: { level: number; promoDay: string | null; maxOpenLevel: number },
  summary: SetSummary,
  day: string,
): { level: number; promoDay: string | null; change: "promoted" | "demoted" | null } {
  if (summary.trials === 0) return { level: state.level, promoDay: state.promoDay, change: null };
  if (summary.meanCredit < 0.6) {
    const level = Math.max(1, state.level - 1);
    return { level, promoDay: null, change: level < state.level ? "demoted" : null };
  }
  if (summary.meanCredit >= 0.9 && summary.playedLevel >= state.level) {
    if (state.promoDay !== null && state.promoDay !== day) {
      if (state.level < state.maxOpenLevel)
        return { level: state.level + 1, promoDay: null, change: "promoted" };
      return { level: state.level, promoDay: state.promoDay, change: null };
    }
    return { level: state.level, promoDay: state.promoDay ?? day, change: null };
  }
  return { level: state.level, promoDay: summary.meanCredit >= 0.9 ? state.promoDay : null, change: null };
}

/** The highest level whose categories are all open (and whose gate lessons are completed). */
export function maxOpenLevel(
  def: FamilyDef,
  openCategories: readonly string[],
  completedLessons?: readonly string[],
): number {
  let max = 1;
  for (let i = 0; i < def.levels.length; i++) {
    const l = def.levels[i] as LevelParams;
    const gate = def.unlock.levelGates?.[i + 1];
    const gates = gate === undefined ? [] : Array.isArray(gate) ? gate : [gate];
    const gateOk = !completedLessons || gates.every((g) => completedLessons.includes(g));
    if (!gateOk || !l.categories.every((c) => openCategories.includes(c))) break;
    max = i + 1;
  }
  return max;
}

/** Free practice and in-lesson generator steps: correct → d += 0.10; error → d −= 0.567 (Kaernbach, ≈ 85%). */
export function staircaseStep(state: StaircaseState, correct: boolean): StaircaseState {
  const d = state.d + (correct ? 0.1 : -0.567);
  return { d: Math.min(state.levels + 0.99, Math.max(1, Math.round(d * 1000) / 1000)), levels: state.levels };
}
/**
 * The level params at a continuous difficulty: level = floor(d); tempo and replays interpolate on
 * frac(d) toward the next level's values.
 */
export function levelAtDifficulty(def: FamilyDef, d: number): { level: number; params: LevelParams } {
  const level = Math.max(1, Math.min(def.levels.length, Math.floor(d)));
  const cur = levelParams(def, level);
  const next = level < def.levels.length ? levelParams(def, level + 1) : cur;
  const f = Math.max(0, Math.min(0.99, d - level));
  const lerp = (a: number, b: number): number => Math.round(a + (b - a) * f);
  const params: LevelParams = {
    ...cur,
    tempo: [lerp(cur.tempo[0], next.tempo[0]), lerp(cur.tempo[1], next.tempo[1])],
    replays: cur.replays < 0 || next.replays < 0 ? cur.replays : lerp(cur.replays, next.replays),
  };
  return { level, params };
}

/**
 * The trial order of a passive-listen block (`ListenEx.passive`, U04.L04): `items` trials at `level`, its open
 * categories dealt in shuffled rounds so every one is heard equally often, never the same category twice in a
 * row. Deterministic for a seed; generate each with `generateTrial`. No evidence and no SRS come from it.
 */
export function passiveSequence(
  family: DrillFamilyRuntime,
  level: number,
  items: number,
  seed: number,
  openCategories: readonly string[],
): TrialSpec[] {
  const def = family.def;
  const lvl = Math.max(1, Math.min(def.levels.length, level));
  const cats = openCategoriesOf(levelParams(def, lvl), openCategories);
  const rng = createRng(hashString(`${def.id}|passive|${seed}`));
  const n = Math.max(1, Math.min(40, Math.round(items)));
  const order: string[] = [];
  while (order.length < n) {
    let round = rng.shuffle(cats);
    if (round.length > 1 && round[0] === order[order.length - 1])
      round = [...round.slice(1), round[0] as string];
    order.push(...round);
  }
  return order.slice(0, n).map((category, index) => ({
    index,
    family: def.id,
    level: lvl,
    category,
    seed: trialSeed(def.id, `passive:${seed}`, index),
  }));
}

/** A passive listen block of about `maxSec` seconds: labelled examples of a family's categories, as plans. */
export function listenBlock(
  family: DrillFamilyRuntime,
  level: number,
  seed: number,
  openCategories: readonly string[],
  maxSec = 18,
): { caption: string; code: string; plan: AudioPlan }[] {
  const def = family.def;
  const params = levelParams(def, level);
  const cats = openCategoriesOf(params, openCategories);
  const rng = createRng(seed);
  const out: { caption: string; code: string; plan: AudioPlan }[] = [];
  let total = 0;
  for (let i = 0; i < 8 && total < maxSec; i++) {
    const category = cats[i % cats.length] as string;
    const trial = family.generate(createRng(rng.int(0, 2 ** 31)), params, level, DEFAULT_PROFILE, {
      category,
      openCategories,
      ...(out.length > 0 ? {} : {}),
    });
    if (trial.events.length === 0) break;
    const audio = trialAudio(trial);
    const plan = audio.cue ? concatPlans(audio.cue, audio.stimulus) : audio.stimulus;
    if (total + plan.durationSec > maxSec + 4 && out.length > 0) break;
    out.push({ caption: category, code: trial.code, plan });
    total += plan.durationSec;
  }
  return out;
}
function concatPlans(a: AudioPlan, b: AudioPlan): AudioPlan {
  return {
    events: [...a.events, ...b.events.map((e) => ({ ...e, at: e.at + a.durationSec }))],
    durationSec: a.durationSec + b.durationSec,
    preload: [...new Set([...a.preload, ...b.preload])].sort(),
  };
}

// Grading one step in the browser (contracts §6.1: deterministic graders alone decide; the server stores the
// browser's result): the wire response an attempt stores (`AttemptResponse`) becomes the grader's
// `ExerciseResponse` (staff text → events, taps and sung notes → a measured performance), the context carries
// the lesson's key, meter and tempo, the series' params and the learner's unlocked tools (locked tools are
// errors in graded steps), and a generator stimulus is drawn as a drill trial whose expected answer is the
// step's correct one. The host functions are injected, so the same code runs in `bun test` with the real
// grader realm and in the app with the browser GraderHost.

import { decks } from "@content/families.ts";
import type {
  AttemptResponse,
  Exercise,
  GradeResult,
  HintRung,
  KeySpec,
  LearnerProfile,
  LintContext,
  MeterId,
  ParamValues,
  PickupSpec,
  SingEx,
  SwingSpec,
  TapEx,
  Trial,
  UnlockableId,
} from "@oak/api";
import { createRegistry, type DrillRegistry, FAMILIES, generateTrial } from "@oak/drills";
import type { EvalResult, ExerciseResponse, GradeRequest, MatchResult } from "@oak/grader";
import { normalize, singTargets, tapTargets } from "@oak/grader";
import { parseNoteList } from "@oak/notation";
import { gradeTaps } from "@oak/pitch";
import { METERS } from "@oak/theory";
import type { SungSummary } from "../answers/types.ts";
import { globalExerciseId, withParams } from "./model.ts";

/** The two host calls grading needs: the browser GraderHost in the app, the realm itself in tests. */
export interface GraderDeps {
  grade(req: GradeRequest): Promise<GradeResult>;
  /** Evaluates authored code (a tap stimulus) without a lint: `{ mode: 'lesson', bars, lint: null, meter }`. */
  evaluate(code: string, bars: number, meter: MeterId): Promise<EvalResult>;
}

/** Where an exercise is graded: its owner (lesson or checkpoint), defaults and the learner. */
export interface GradeEnv {
  ownerId: string;
  key: KeySpec;
  meter: MeterId;
  bpm: number;
  swing?: SwingSpec;
  pickup?: PickupSpec;
  unlocked: ReadonlySet<UnlockableId>;
  /** U00.L01/L02 run on the onboarding loop, a preview context (contracts §3.1 rule 5a). */
  allowPreview: boolean;
  profile: LearnerProfile;
}

export const NEUTRAL_PROFILE: LearnerProfile = {
  rangeLow: 48,
  rangeHigh: 72,
  comfLow: 52,
  comfHigh: 67,
  tapLatencyMs: 0,
  tapJitterMs: 15,
  singLatencyMs: 0,
  singTolCents: 50,
  singTolMode: "auto",
  noiseFloorDb: -60,
  outputKind: "wired",
  inputKind: "builtin",
  quiet: false,
};

/** The lint every graded editor and check uses: locked tools are errors (contracts §3.3). */
export function gradedLint(env: Pick<GradeEnv, "unlocked" | "allowPreview" | "meter" | "key">): LintContext {
  return {
    profile: "graded",
    unlocked: env.unlocked,
    allowPreview: env.allowPreview,
    meter: env.meter,
    key: env.key,
  };
}

// --- generator stimuli ------------------------------------------------------------------------------

let registry: DrillRegistry | null = null;
function drills(): DrillRegistry {
  registry ??= createRegistry(FAMILIES, decks);
  return registry;
}

/** Categories of a family the learner has met by `lessonId` (`before` = lessons guaranteed done earlier). */
export function openCategories(
  familyId: string,
  lessonId: string,
  before: (lessonId: string) => boolean,
): string[] {
  const fam = drills().family(familyId as never);
  const open = fam.def.categories
    .filter((c) => c.unlockAt === lessonId || before(c.unlockAt))
    .map((c) => c.id);
  return open.length > 0 ? open : fam.def.categories.slice(0, 1).map((c) => c.id);
}

/**
 * The trial a generator stimulus plays for one attempt series: seeded by the exercise and the series, so a
 * retry hears the same question and "Try a new one" a new one.
 */
export function stimulusTrial(
  ex: Exercise,
  ownerId: string,
  seriesNo: number,
  profile: LearnerProfile,
  categories: readonly string[],
): Trial | null {
  if (!("stimulus" in ex) || !ex.stimulus || ex.stimulus.src !== "generator") return null;
  const st = ex.stimulus;
  const fam = drills().family(st.family);
  const seed = st.seed ?? hash(`${globalExerciseId(ownerId, ex)}#${seriesNo}`);
  const category = categories[seed % Math.max(1, categories.length)] ?? fam.def.categories[0]?.id ?? "";
  return generateTrial(
    fam,
    { index: 0, family: st.family, level: st.level, category, seed },
    profile,
    categories,
  );
}

/** A checkpoint family item: one trial of `familyId` at `level` from the server's seed. */
export function familyTrial(
  familyId: string,
  level: number,
  category: string | null,
  seed: number,
  profile: LearnerProfile,
): Trial {
  const fam = drills().family(familyId as never);
  const cats = fam.def.categories.map((c) => c.id);
  const cat = category ?? cats[seed % Math.max(1, cats.length)] ?? "";
  return generateTrial(fam, { index: 0, family: fam.def.id, level, category: cat, seed }, profile, cats);
}

export function familyAnswerKind(familyId: string): string {
  return drills().family(familyId as never).def.answer;
}

/** FNV-1a: a stable seed from a string (a passive block's examples, a generator stimulus's series). */
export function hashSeed(s: string): number {
  return hash(s);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The key a drawn trial plays in (`params.key`), when it says. */
function trialKey(trial: Trial): KeySpec | null {
  const k = trial.params.key as { tonic?: unknown; mode?: unknown } | undefined;
  return k && typeof k.tonic === "string" && typeof k.mode === "string" ? (k as KeySpec) : null;
}

/** Every part of an `all` step against its own drawn trial (`trials[i]`, `null` for parts without one). */
export function withTrials<E extends Exercise>(ex: E, trials: readonly (Trial | null)[]): E {
  if (ex.kind !== "all") return withTrial(ex, trials[0] ?? null);
  return { ...ex, parts: ex.parts.map((p, i) => withTrial(p, trials[i] ?? null)) } as E;
}

/** The exercise as graded against a drawn trial: the trial's expected answer is the correct one. */
export function withTrial<E extends Exercise>(ex: E, trial: Trial | null): E {
  if (!trial) return ex;
  if (ex.kind === "identify") return { ...ex, correct: trial.expected } as E;
  if (ex.kind === "dictation" && ex.answer.ui === "degree-pad" && trial.expected.degrees) {
    // A drawn melody written on the degree pad is checked against the trial's own answer, as the drills check
    // it: reading the degrees back from the trial's code took the chords that set home for the tune (U03.L10
    // S2 always failed). The step keeps its prompt, hints, feedback and the trial's key.
    const key = trialKey(trial);
    return {
      ...ex,
      kind: "identify",
      correct: trial.expected,
      ...(key ? { key } : {}),
    } as unknown as E;
  }
  if (ex.kind === "dictation") {
    // The drawn tune is in the trial's own key (a dictation trial moves round the keys the learner has met):
    // its degrees are read in that key, not the lesson's (U03.L10 S2 heard in G was read in C).
    const key = trialKey(trial);
    return {
      ...ex,
      ...(key ? { key } : {}),
      reference: { ...ex.reference, solutions: [trial.code] },
    } as E;
  }
  return ex;
}

// --- performances ------------------------------------------------------------------------------------

/** Cents between a sung note and its target; octave-free unless `exact`. */
function centsOff(sung: SungSummary, target: number, octave: SingEx["tol"]["octave"]): number | null {
  if (sung.midi === null) return null;
  let d = (sung.midi - target) * 100 + (sung.cents ?? 0);
  if (octave !== "exact") {
    d = ((((d + 600) % 1200) + 1200) % 1200) - 600;
  }
  return d;
}

/**
 * Sung notes (the mic widget's summaries) against the step's targets: full credit within the tolerance,
 * half within twice it. Nothing voiced at all is `sing.no-voice`, which grades as an error (not an attempt).
 * Each note carries what the grader reads from @oak/pitch's per-note result (the target, the folded sung
 * pitch, the signed error), so a lenient first sing and a sung degree pattern are judged as the grader does.
 */
export function sungPerformance(
  sung: readonly SungSummary[],
  targets: readonly number[],
  tolCents: number,
  octave: SingEx["tol"]["octave"],
): MatchResult & {
  notes: {
    credit: number;
    feedback: string | null;
    index: number;
    targetMidi: number;
    sungMidi: number | null;
    cents: number | null;
    coverage: number;
  }[];
} {
  if (sung.length === 0 || sung.every((s) => s.midi === null))
    return {
      score: 0,
      dims: {},
      diagnostics: [{ id: "sing.no-voice", severity: "error", params: { db: -60 } } as never],
      notes: [],
    };
  const notes = targets.map((t, i) => {
    const s = sung[i];
    const off = s ? centsOff(s, t, octave) : null;
    if (off === null)
      return {
        credit: 0,
        feedback: "sing.missed",
        index: i,
        targetMidi: t,
        sungMidi: null,
        cents: null,
        coverage: 0,
      };
    const a = Math.abs(off);
    return {
      credit: a <= tolCents ? 1 : a <= 2 * tolCents ? 0.5 : 0,
      feedback: null,
      index: i,
      targetMidi: t,
      sungMidi: t + off / 100,
      cents: off,
      coverage: 1,
    };
  });
  const score = notes.length ? notes.reduce((a, n) => a + n.credit, 0) / notes.length : 0;
  return { score, dims: { pitch: { score, weight: 1, n: notes.length } }, diagnostics: [], notes };
}

async function tapPerformance(
  deps: GraderDeps,
  env: GradeEnv,
  ex: TapEx,
  taps: number[],
): Promise<MatchResult> {
  const meter = ex.meter ?? env.meter;
  if (ex.stimulus.src !== "code") return { score: 0, dims: {}, diagnostics: [] };
  const res = await deps.evaluate(ex.stimulus.code, ex.bars, meter);
  if (!res.ok) return { score: 0, dims: {}, diagnostics: [] };
  const n = normalize(res, { meter, key: ex.key ?? env.key });
  const targets = tapTargets(ex.target, n, ex.bars, meter);
  return gradeTaps(taps, targets, ex.tol, env.profile) as unknown as MatchResult;
}

async function singPerformance(
  deps: GraderDeps,
  env: GradeEnv,
  ex: SingEx,
  sung: SungSummary[],
): Promise<MatchResult> {
  const meter = ex.meter ?? env.meter;
  const key = ex.key ?? env.key;
  let n = null;
  let cps = env.bpm / 60 / METERS[meter].unitsPerBar;
  const src =
    ex.target.from === "reference"
      ? (ex.target.reference.solutions[0] ?? null)
      : ex.stimulus.src === "code"
        ? ex.stimulus.code
        : null;
  if (ex.target.from !== "degrees" && src) {
    // The stimulus loops: read only its own bars, or a one-bar call would ask for its note four times.
    const bars =
      ex.target.from === "reference"
        ? ex.target.reference.bars
        : ex.stimulus.src === "code"
          ? (ex.stimulus.bars ?? 4)
          : 4;
    const res = await deps.evaluate(src, bars, meter);
    if (res.ok) {
      n = normalize(res, { meter, key });
      cps = n.cps;
    }
  }
  const targets = singTargets(ex.target, n, key, meter, cps).map((t) => t.midi);
  // The lenient first sing (contracts §8.1 item 8): ±100¢ after per-note folding, whatever the ladder says.
  if (ex.tol.lenient) return sungPerformance(sung, targets, 100, "per-note");
  const tol = ex.tol.cents === "learner" ? env.profile.singTolCents : ex.tol.cents;
  return sungPerformance(sung, targets, tol, ex.tol.octave);
}

// --- responses -----------------------------------------------------------------------------------------

/** The grader's reading of a stored response. */
export async function toGraderResponse(
  deps: GraderDeps,
  env: GradeEnv,
  ex: Exercise,
  r: AttemptResponse,
  takeOf?: TakeLookup,
): Promise<ExerciseResponse> {
  if ("parts" in r) {
    const parts = ex.kind === "all" ? ex.parts : null;
    if (!parts) {
      // run-investigate: one response per question, each already in its wire shape.
      return { parts: r.parts as ExerciseResponse[] };
    }
    const out: ExerciseResponse[] = [];
    for (const [i, part] of parts.entries()) {
      const pr = (r.parts[i] ?? { skipped: true }) as AttemptResponse;
      out.push(await toGraderResponse(deps, env, part, pr, takeOf));
    }
    return { parts: out };
  }
  if ("staff" in r) return { staff: parseNoteList(r.staff, { meter: METERS[ex.meter ?? env.meter] }) };
  if ("taps" in r) {
    if (ex.kind !== "tap") return { skipped: true };
    return { performance: await tapPerformance(deps, env, ex, r.taps) };
  }
  if ("sung" in r) {
    if (ex.kind === "predict") return { answer: {} };
    if (ex.kind !== "sing") return { skipped: true };
    // The take the widget just measured, when this response is its summary: @oak/pitch's whole result (per-note
    // targets, folded pitch, why nothing was heard, clipping), which the grader reads the pattern from.
    const take = takeOf?.(ex.id, r.sung);
    if (take) return { performance: take };
    return { performance: await singPerformance(deps, env, ex, r.sung) };
  }
  if ("answer" in r) return { ...r, answer: splitTypedParts(ex, r.answer) } as ExerciseResponse;
  // A bar picked on the bar buttons and stored as a click (before the host sent `answer.number`): a question
  // reads it as the bar's number; only the error hunt reads clicks.
  if ("click" in r && typeof r.click === "string" && ex.kind !== "error-hunt" && /^\d+$/.test(r.click))
    return { answer: { number: Number(r.click) } };
  return r as ExerciseResponse;
}

/**
 * A text field sends what was typed as one string. When the answer has several parts (a scale spelled
 * `D E F# G A B C#`, a key signature typed `F# C#`), the string is split on spaces and commas into those parts
 * before grading, as the drills do; a one-part answer is left whole (U03.L01 S7, wave3 integration).
 */
export function splitTypedParts<A extends { text?: string[] | undefined }>(ex: Exercise, answer: A): A {
  const typed = answer.text;
  if (typed?.length !== 1) return answer;
  const correct = "correct" in ex && ex.correct && typeof ex.correct === "object" ? ex.correct : null;
  const want = correct && "text" in correct && Array.isArray(correct.text) ? correct.text.length : 1;
  if (want <= 1) return answer;
  const parts = (typed[0] ?? "").split(/[\s,]+/).filter((s) => s !== "");
  return parts.length > 1 ? { ...answer, text: parts } : answer;
}

/** The measured take behind a sung response (`{ performance }`), or null to re-read the summary. */
export type TakeLookup = (exerciseId: string, sung: readonly SungSummary[]) => MatchResult | null;

export interface GradeOptions {
  params: ParamValues;
  attemptNo: number;
  rung: HintRung;
  extraReplays: number;
  tutorHints?: number;
  trial?: Trial | null;
  /** One trial per part of an `all` step. */
  trials?: readonly (Trial | null)[];
  /** The exercise's own global ID when it differs from `${ownerId}/${id}`. */
  globalId?: string;
  /** The widget's measured takes (`lessonTakes` in inputs.tsx). */
  takeOf?: TakeLookup;
}

/** Grades one response to one exercise. Failures in the learner's code come back as `status: 'error'`. */
export async function gradeStep(
  deps: GraderDeps,
  env: GradeEnv,
  exercise: Exercise,
  response: AttemptResponse,
  o: GradeOptions,
): Promise<GradeResult> {
  const base = withParams(exercise, o.params);
  const ex = o.trials ? withTrials(base, o.trials) : withTrial(base, o.trial ?? null);
  const graderResponse = await toGraderResponse(deps, env, ex, response, o.takeOf);
  const key = ex.key ?? env.key;
  const meter = ex.meter ?? env.meter;
  return deps.grade({
    exercise: ex,
    response: graderResponse,
    ctx: {
      exerciseGlobalId: o.globalId ?? globalExerciseId(env.ownerId, ex),
      mode: "lesson",
      key,
      meter,
      bpm: typeof ex.bpm === "number" ? ex.bpm : env.bpm,
      ...((ex.swing ?? env.swing) ? { swing: (ex.swing ?? env.swing) as SwingSpec } : {}),
      ...((ex.pickup ?? env.pickup) ? { pickup: (ex.pickup ?? env.pickup) as PickupSpec } : {}),
      params: o.params,
      attemptNo: o.attemptNo,
      firstAttempt: o.attemptNo === 1,
      rung: o.rung,
      tutorHints: o.tutorHints ?? 0,
      extraReplays: o.extraReplays,
      lint: gradedLint({ ...env, meter, key }),
      profile: env.profile,
    },
  });
}

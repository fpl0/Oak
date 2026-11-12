// The drill runner's pure core: which answer surface a generated trial needs, how a widget value becomes a
// `TrialResponse`, the wire record of a trial, set planning with an easy first trial, what the set summary says,
// and the Practice hub's grouping and states. No DOM, no audio, no API: everything here is unit-tested.
import type {
  Answer,
  AnswerUi,
  ChordQuality,
  Degree,
  DrillFinish,
  DrillSession,
  DrillTrialRecord,
  FamilyDef,
  FamilyId,
  FamilyState,
  KeySpec,
  LearnerProfile,
  SingTolCents,
  SrsCard,
  SrsReviewResult,
  SungResolution,
  Trial,
  TrialResult,
} from "@oak/api";
import {
  type DrillFamilyRuntime,
  type DrillTrialResult,
  generateSet,
  isCompositeGenerator,
  isPendingGenerator,
  planSet,
  type SetPlan,
  type SetSummary,
  summarizeSet,
  type TrialSpec,
} from "@oak/drills";
import { gradeFor } from "@oak/srs";
import { degreeSemitones, syllableOf } from "@oak/theory";
import type { AnswerSpec, AnswerValue, SungSummary } from "../answers/types.ts";
import { isResting, RESTING_LINE } from "./resting.ts";
import { staffSpecOf } from "./staff.ts";

// --- answer surfaces -----------------------------------------------------------------------------

/** How a trial is answered: the tap pad, the microphone, or an answers widget (app/src/answers). */
export type Surface =
  | { kind: "tap"; twoVoices: boolean }
  | { kind: "sing" }
  | { kind: "widget"; spec: AnswerSpec };

const MAJOR_DEGREES: Degree[] = ["1", "2", "3", "4", "5", "6", "7"];
const MINOR_DEGREES: Degree[] = ["1", "2", "b3", "4", "5", "b6", "b7"];
const DEGREE_RE = /^(?:deg\.)?([#b]?[1-7])$/;

/** Learner-facing labels of category and option IDs that are not self-explanatory. */
const OPTION_LABELS: Record<string, string> = {
  higher: "Higher",
  lower: "Lower",
  same: "Same",
  up: "Goes up",
  down: "Goes down",
  arch: "Up, then down",
  valley: "Down, then up",
  straight: "Straight",
  swung: "Swung",
  triplets: "Triplets",
  half: "Half step",
  whole: "Whole step",
  PAC: "Perfect authentic (V–I)",
  IAC: "Imperfect authentic",
  HC: "Half cadence (ends on V)",
  plagal: "Plagal (IV–I)",
  deceptive: "Deceptive (V–vi)",
  axis: "I–V–vi–IV",
  "three-chord": "I–IV–V",
  "axis-vi": "vi–IV–I–V",
  "doo-wop": "I–vi–IV–V",
  aeolian: "i–♭VI–♭VII–i",
  andalusian: "Andalusian (i–♭VII–♭VI–V)",
  blues12: "12-bar blues",
  first: "First inversion",
  second: "Second inversion",
  root: "Root position",
  PD: "Predominant",
  T: "Tonic",
  D: "Dominant",
};

export function optionLabel(id: string): string {
  // Degree categories ("deg.5", "deg.b6") read as the learner's word for them, never as an ID.
  const deg = /^deg\.([#b]?[1-7])$/.exec(id);
  if (deg) return `Degree ${(deg[1] as string).replace("b", "♭").replace("#", "♯")}`;
  return OPTION_LABELS[id] ?? id.replace(/b(?=\d)/g, "♭").replace(/#(?=\d)/g, "♯");
}

function keyOf(trial: Trial<unknown>): KeySpec | null {
  const k = trial.params.key as KeySpec | undefined;
  return k && typeof k.tonic === "string" ? k : null;
}

/** The degree pad's contrast set: the level's own degree categories, else the key's diatonic degrees. */
export function degreeSetOf(trial: Trial<unknown>, def: FamilyDef): Degree[] {
  const level = def.levels[Math.max(0, Math.min(def.levels.length, trial.level) - 1)];
  const cats = (level?.categories ?? []).map((c) => DEGREE_RE.exec(c)?.[1] ?? null);
  const expected = ((trial.expected as Answer).degrees ?? []) as Degree[];
  if (cats.length > 0 && cats.every((c) => c !== null)) {
    const set = [...new Set([...(cats as Degree[]), ...expected])];
    return set.sort((a, b) => degreeSemitones(a) - degreeSemitones(b));
  }
  const key = keyOf(trial);
  const base = key && /minor|aeolian|dorian|phrygian/.test(key.mode) ? MINOR_DEGREES : MAJOR_DEGREES;
  const extra = expected.filter((d) => !base.includes(d));
  return [...base, ...extra].sort((a, b) => degreeSemitones(a) - degreeSemitones(b));
}

function levelCategories(trial: Trial<unknown>, def: FamilyDef): string[] {
  return [...(def.levels[Math.max(0, Math.min(def.levels.length, trial.level) - 1)]?.categories ?? [])];
}

/** Choice options: the trial's own `options`, else the categories of the level it was played at. */
export function choiceOptionsOf(trial: Trial<unknown>, def: FamilyDef): string[] {
  const own = trial.params.options;
  if (Array.isArray(own) && own.every((o) => typeof o === "string")) return own as string[];
  const expected = (trial.expected as Answer).choice ?? [];
  const cats = levelCategories(trial, def);
  for (const e of expected) if (!cats.includes(e)) cats.push(e);
  return cats;
}

/** Strudel audition code of each option, when the generator offers it (`choiceAudio`). */
function choiceAudioOf(trial: Trial<unknown>): Map<string, string> {
  const raw = trial.params.choiceAudio;
  const out = new Map<string, string>();
  if (Array.isArray(raw))
    for (const r of raw)
      if (r && typeof r === "object" && typeof r.id === "string" && typeof r.audio === "string")
        out.set(r.id, r.audio);
  return out;
}

/** The answer surface of a trial (`params.mode` and `params.ui` as the generators set them). */
export function surfaceOf(
  trial: Trial<unknown>,
  def: FamilyDef,
  opts: { solfege?: "numbers" | "syllables" } = {},
): Surface {
  const p = trial.params;
  const expected = trial.expected as Answer;
  if (p.mode === "tap") return { kind: "tap", twoVoices: p.twoVoices === true };
  if (p.mode === "sing") return { kind: "sing" };
  const ui = typeof p.ui === "string" ? p.ui : null;
  // Written on the staff (dictation's top levels): the answers registry's staff widget; graded as code.
  if (ui === "staff-input") return { kind: "widget", spec: staffSpecOf(trial) };
  if (p.mode === "code" || ui === "code")
    return { kind: "widget", spec: { ui: "code", starter: codeStarterOf(trial) } };
  if (ui === "bar-buttons") {
    const bars = Math.max(1, Number(p.bars ?? 4));
    const multi = (expected.choice?.length ?? 0) > 1 || p.multi === true;
    // The generator names its own options (some bars only, or "No key change"), or several bars are asked
    // (where each phrase starts): buttons labelled by bar, one or more picks.
    if (Array.isArray(p.options) || multi) {
      const labels =
        p.optionLabels && typeof p.optionLabels === "object"
          ? (p.optionLabels as Record<string, unknown>)
          : {};
      const ids = Array.isArray(p.options)
        ? (p.options as unknown[]).map(String)
        : Array.from({ length: bars }, (_, i) => String(i + 1));
      const options = ids.map((id) => ({
        id,
        label: typeof labels[id] === "string" ? (labels[id] as string) : `Bar ${id}`,
      }));
      return {
        kind: "widget",
        spec: { ui: "choice", options, layout: "buttons", ...(multi ? { multi: true } : {}) },
      };
    }
    return { kind: "widget", spec: { ui: "bar-buttons", bars } };
  }
  if (ui === "grid") {
    const steps = Number(p.stepsPerBar ?? 8);
    const stepsPerBar = (steps === 12 || steps === 16 ? steps : 8) as 8 | 12 | 16;
    return {
      kind: "widget",
      spec: { ui: "grid", rows: ["hit"], stepsPerBar, bars: Number(p.gridBars ?? p.bars ?? 1) },
    };
  }
  if (ui === "text" || expected.text) {
    const kind = String(p.textKind ?? "free");
    const normalize = (["note", "chord", "rn", "interval", "key"].includes(kind) ? kind : "free") as Extract<
      AnswerUi,
      { ui: "text" }
    >["normalize"];
    return { kind: "widget", spec: { ui: "text", normalize } };
  }
  if (ui === "number" || expected.number !== undefined) return { kind: "widget", spec: { ui: "number" } };
  if (ui === "rn-palette" || expected.rn)
    return {
      kind: "widget",
      spec: {
        ui: "rn-palette",
        slots: Math.max(1, typeof p.slots === "number" ? p.slots : (expected.rn?.length ?? 1)),
        allow: rnAllowOf(p.rnAllow),
      },
    };
  if (expected.degrees) {
    const len = Number(p.sequenceLen ?? expected.degrees.length);
    return {
      kind: "widget",
      spec: {
        ui: "degree-pad",
        set: degreeSetOf(trial, def),
        ...(len > 1 ? { sequenceLen: len } : {}),
        syllables: opts.solfege === "syllables",
      },
    };
  }
  if (expected.qualities) {
    const set = [...new Set([...levelCategories(trial, def), ...expected.qualities])] as ChordQuality[];
    return { kind: "widget", spec: { ui: "quality-pad", set } };
  }
  if (ui === "click-cell") {
    // One pick among the cells of the loop, labelled by count ("2 &").
    const per = Number(p.stepsPerBar ?? 16);
    const bars = Number(p.bars ?? 1);
    const names = per === 16 ? ["", "e", "&", "a"] : per === 8 ? ["", "&"] : [""];
    const sub = Math.max(1, names.length);
    const options = Array.from({ length: per * bars }, (_, i) => {
      const inBar = i % per;
      const beat = Math.floor(inBar / sub) + 1;
      const part = names[inBar % sub] ?? "";
      const bar = Math.floor(i / per) + 1;
      return { id: `c${i}`, label: `${bars > 1 ? `bar ${bar} · ` : ""}${beat}${part ? ` ${part}` : ""}` };
    });
    return { kind: "widget", spec: { ui: "choice", options, layout: "buttons" } };
  }
  const audio = choiceAudioOf(trial);
  // Generators that answer in code strings or named forms give readable labels (`params.optionLabels`).
  const labels =
    p.optionLabels && typeof p.optionLabels === "object" ? (p.optionLabels as Record<string, unknown>) : {};
  const options = choiceOptionsOf(trial, def).map((id) => ({
    id,
    label: typeof labels[id] === "string" ? (labels[id] as string) : optionLabel(id),
    ...(audio.has(id) ? { audio: audio.get(id) as string } : {}),
  }));
  return {
    kind: "widget",
    spec: {
      ui: "choice",
      options,
      layout: audio.size > 0 ? "audio-cards" : "buttons",
      ...(p.multi === true ? { multi: true } : {}),
    },
  };
}

/**
 * The editor's starting text of a code trial: the generator's own `starter`, else (melodic dictation in code)
 * an empty `n("")` already in the trial's key and octave, so the learner writes only the steps (degree − 1).
 */
export function codeStarterOf(trial: Trial<unknown>): string {
  const p = trial.params;
  if (typeof p.starter === "string") return p.starter;
  const ak = p.answerKey as { key?: KeySpec; octave?: number } | undefined;
  if (ak?.key && typeof ak.key.tonic === "string" && typeof ak.octave === "number")
    return `n("").scale("${ak.key.tonic}${ak.octave}:${ak.key.mode.replace(/ /g, ":")}").s("piano")`;
  return "";
}

const RN_ALLOW = ["triads", "sevenths", "inversions", "secondary", "borrowed"] as const;
type RnAllow = (typeof RN_ALLOW)[number];
/** The Roman-numeral palette a generator asks for (`params.rnAllow`), triads when it says nothing. */
function rnAllowOf(raw: unknown): RnAllow[] {
  const ok = Array.isArray(raw) ? raw.filter((x): x is RnAllow => RN_ALLOW.includes(x as RnAllow)) : [];
  return ok.length > 0 ? ok : ["triads"];
}

/**
 * The grader `Answer` of a widget value (code goes out as text: `@oak/drills` parses it with the mini model).
 * A typed answer with several parts ("Spell B major": B D♯ F♯) is split on spaces and commas when the trial
 * expects more than one part (`textParts`), since the grader compares parts by position.
 */
export function answerOf(
  spec: AnswerSpec,
  value: AnswerValue,
  textParts = 1,
  expected: Answer | null = null,
): Answer | null {
  switch (spec.ui) {
    case "choice":
      return { choice: value as string[] };
    case "bar-buttons": {
      // A bar is asked either as a number (which bar holds the inversion) or as a choice ID ("3").
      const bars = value as number[];
      if (bars.length === 0) return null;
      return expected?.number !== undefined ? { number: bars[0] as number } : { choice: bars.map(String) };
    }
    case "degree-pad":
      return { degrees: value as Degree[] };
    case "quality-pad":
      return { qualities: value as ChordQuality[] };
    case "rn-palette":
      return { rn: value as string[] };
    case "text": {
      const typed = (value as string).trim();
      return { text: textParts > 1 ? typed.split(/[\s,]+/).filter(Boolean) : [typed] };
    }
    case "code":
      return { text: [(value as string).trim()] };
    case "number":
      return value === null ? null : { number: value as number };
    case "keyboard":
      return { midi: value as number[] };
    case "grid": {
      const rows = value as boolean[][];
      const one = rows.length === 1;
      return {
        choice: rows.flatMap((row, r) =>
          row.flatMap((on, c) => (on ? [one ? String(c) : `${spec.rows[r] ?? r}:${c}`] : [])),
        ),
      };
    }
    default:
      return null;
  }
}

/** The expected answer in the widget's value shape, for the "it was …" side of the feedback. */
export function expectedValueOf(spec: AnswerSpec, expected: Answer): AnswerValue | null {
  switch (spec.ui) {
    case "choice":
      return expected.choice ?? null;
    case "bar-buttons":
      return expected.number !== undefined
        ? [expected.number]
        : expected.choice
          ? expected.choice.map(Number).filter(Number.isFinite)
          : null;
    case "degree-pad":
      return expected.degrees ?? null;
    case "quality-pad":
      return expected.qualities ?? null;
    case "rn-palette":
      return expected.rn ?? null;
    case "text":
      return expected.text ? expected.text.join(" ") : null;
    case "number":
      return expected.number ?? null;
    case "grid": {
      const cells = new Set(expected.choice ?? []);
      const n = spec.stepsPerBar * spec.bars;
      return [Array.from({ length: n }, (_, i) => cells.has(String(i)))];
    }
    default:
      return null;
  }
}

/**
 * The learner's own parts of a wrong answer, marked against the expected value, so the pick they made reads
 * "not this one" next to the outlined answer (ux §4.2 step 4). Degree pads mark by slot; choices by option ID.
 * Other widgets mark nothing (their revealed answer speaks for itself).
 */
export function wrongMarks(
  spec: AnswerSpec,
  value: AnswerValue | null,
  expected: AnswerValue | null,
): { part: number | string; ok: boolean }[] {
  if (!Array.isArray(value) || !Array.isArray(expected)) return [];
  if (spec.ui === "degree-pad") {
    return (value as unknown[]).map((v, i) => ({ part: i, ok: v === (expected as unknown[])[i] }));
  }
  if (spec.ui === "choice") {
    const want = new Set((expected as unknown[]).map(String));
    return (value as unknown[]).map((v) => ({ part: String(v), ok: want.has(String(v)) }));
  }
  return [];
}

/** A short spoken form of the expected answer ("3 · mi", "Lower", "B D♯ F♯"). */
export function expectedText(spec: AnswerSpec | null, expected: Answer, solfege = false): string | null {
  if (spec?.ui === "bar-buttons") {
    const bars = expectedValueOf(spec, expected) as number[] | null;
    return bars && bars.length > 0 ? `bar ${bars.join(", ")}` : null;
  }
  if (expected.degrees)
    return expected.degrees
      .map((d) => (solfege ? `${optionLabel(d)} · ${syllableOf(d)}` : optionLabel(d)))
      .join(" ");
  if (expected.choice && spec?.ui === "choice")
    return expected.choice
      .map((id) => spec.options.find((o) => o.id === id)?.label ?? optionLabel(id))
      .join(", ");
  if (expected.choice) return expected.choice.map(optionLabel).join(", ");
  if (expected.qualities) return expected.qualities.join(", ");
  if (expected.rn) return expected.rn.join(" ");
  if (expected.text) return expected.text.map((t) => t.replace(/b/g, "♭").replace(/#/g, "♯")).join(" ");
  if (expected.number !== undefined) return String(expected.number);
  return null;
}

// --- results and wire records --------------------------------------------------------------------

export interface TrialOutcome {
  index: number;
  familyId: FamilyId;
  result: DrillTrialResult;
  /** The learner chose "Show me" before answering: credit 0, and the set counts as revealed (Again). */
  revealed: boolean;
  /** Sung part of the trial (a sing trial, or the sung resolution of an FET trial), never audio. */
  sung: SungSummary[] | null;
  /** Credit of a sung resolution; feeds `fam.deg.resolve`, never the identification credit. */
  resolutionCredit: number | null;
  /** The FET resolution as asked and taken (sung, skipped or, in Quiet mode, heard), or null when none was asked. */
  sungResolution?: SungResolution | null;
}

/** How a trial was taken (wave3.md §5.3): a sung part heard in Quiet mode is `quiet` (no voice evidence). */
export type Modality = NonNullable<DrillTrialRecord["modality"]>;

/** One `drill_trials` row (contracts §7.1: the trial is regenerable from seed and params). */
export function trialRecord(
  trial: Trial<unknown>,
  index: number,
  outcome: { result: TrialResult & { centsError?: number | null; skipped?: boolean }; answer: Answer | null },
  extra: {
    taps?: number[] | null;
    sung?: SungSummary[] | null;
    at: string;
    revealed?: boolean;
    modality?: Modality;
    sungResolution?: SungResolution | null;
  },
): DrillTrialRecord {
  const r = outcome.result;
  return {
    idx: index,
    familyId: trial.family,
    seed: trial.seed,
    level: trial.level,
    category: trial.category,
    params: JSON.parse(JSON.stringify(trial.params)) as Record<string, unknown>,
    response: {
      answer: outcome.answer,
      taps: extra.taps ?? null,
      sung: extra.sung ?? null,
      skipped: r.skipped === true,
    },
    credit: Math.max(0, Math.min(1, Number.isFinite(r.credit) ? r.credit : 0)),
    correct: r.correct,
    rtMs: Math.max(0, Math.round(r.rtMs)),
    replays: Math.max(0, Math.round(r.replays)),
    confusion: r.confusion ? [r.confusion[0], r.confusion[1]] : null,
    centsError: typeof r.centsError === "number" && Number.isFinite(r.centsError) ? r.centsError : null,
    at: extra.at,
    revealed: extra.revealed === true,
    modality: extra.modality ?? "normal",
    sungResolution: extra.sungResolution ?? null,
  };
}

/** The nearest rung of the tolerance ladder (contracts §8.2) for a tolerance in cents. */
export function ladderCents(cents: number): SingTolCents {
  const rungs: SingTolCents[] = [70, 50, 35, 25];
  return rungs.reduce((best, r) => (Math.abs(r - cents) < Math.abs(best - cents) ? r : best), 70);
}

/**
 * The wire form of an FET trial's resolution (`SungResolutionSchema`): sung (graded notes), skipped
 * (`Shift+S`), or heard in Quiet mode (self-report, no notes, no voice evidence). It never touches the
 * identification credit.
 */
export function sungResolutionOf(
  path: readonly Degree[],
  playFirst: boolean,
  taken:
    | { kind: "sung"; notes: SungSummary[]; credit: number; passed: boolean }
    | { kind: "skipped" }
    | { kind: "quiet" },
  tolCents: number,
): SungResolution | null {
  if (path.length === 0) return null;
  const base = {
    path: path.slice(0, 8) as Degree[],
    order: playFirst ? ("play-first" as const) : ("sing-first" as const),
    tolCents: ladderCents(tolCents),
  };
  if (taken.kind === "sung")
    return {
      ...base,
      notes: taken.notes.map((n) => ({ midi: n.midi, cents: n.cents, credit: n.credit })),
      credit: Math.max(0, Math.min(1, Number.isFinite(taken.credit) ? taken.credit : 0)),
      passed: taken.passed,
      skipped: false,
      quiet: false,
    };
  return {
    ...base,
    notes: [],
    credit: 0,
    passed: false,
    skipped: taken.kind === "skipped",
    quiet: taken.kind === "quiet",
  };
}

/** A revealed trial: no credit, never skipped (contracts §7.2: revealed → Again). */
export function revealedResult(rtMs: number, replays: number): DrillTrialResult {
  return { credit: 0, correct: false, rtMs, replays, diagnostics: [] };
}

/** A skipped sung part (`Shift+S`): logged, no evidence, no penalty. */
export function skippedResult(rtMs: number, replays: number): DrillTrialResult {
  return { credit: 0, correct: false, rtMs, replays, diagnostics: [], skipped: true };
}

// --- set planning ---------------------------------------------------------------------------------

export interface PlannedTrial {
  spec: TrialSpec;
  trial: Trial;
}

/**
 * The trials of one server-started set, generated in the browser from the session's seed material (same
 * setId → same trials, so a reload resumes the very same set). With `easyFirst` a trial one level down moves to
 * the front: the warm-up opens with an easy win.
 */
export function planDrillSet(
  family: DrillFamilyRuntime,
  session: Pick<DrillSession, "setId" | "levels" | "openCategories" | "trialsPlanned">,
  state: Pick<FamilyState, "categoryStats" | "blockedRemaining"> | null,
  profile: LearnerProfile,
  opts: { easyFirst?: boolean; sungResolutions?: number; trials?: number } = {},
): { plan: SetPlan; trials: PlannedTrial[] } {
  const id = family.def.id;
  const open = session.openCategories[id] ?? [];
  // An FET set keeps its 2–3 resolutions in Quiet mode: they are heard instead of sung (contracts §8.5,
  // "sung resolutions: replaced by listening to the resolution"). FET trials themselves need no mic.
  const fet = family.def.generator === "degree-id";
  const plan = planSet(family, {
    family: id,
    setId: session.setId,
    level: session.levels[id] ?? 1,
    openCategories: open,
    categoryStats: state?.categoryStats ?? {},
    blockedRemaining: state?.blockedRemaining ?? 0,
    trials: opts.trials ?? session.trialsPlanned,
    sungResolutions: opts.sungResolutions ?? 2,
    quiet: profile.quiet && !fet,
  });
  if (opts.easyFirst) {
    const easy = plan.trials.findIndex((t) => t.level < plan.level);
    if (easy > 0) {
      const [t] = plan.trials.splice(easy, 1);
      plan.trials.unshift(t as TrialSpec);
    }
  }
  const trials = generateSet(family, plan, profile, open);
  return { plan, trials: plan.trials.map((spec, i) => ({ spec, trial: trials[i] as Trial })) };
}

// --- set summary ----------------------------------------------------------------------------------

export function pctText(x: number): string {
  return `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`;
}

/** The set's word for how it went: never a raw rating, never shaming (ux §4.1). */
export function setWord(meanCredit: number): string {
  if (meanCredit >= 0.9) return "strong";
  if (meanCredit >= 0.75) return "steady";
  if (meanCredit >= 0.6) return "getting there";
  return "worth another listen";
}

/** "Next review in about 3 days": relative words, never a count of cards. */
export function nextDueText(dueAt: string, now: Date = new Date()): string {
  const ms = new Date(dueAt).getTime() - now.getTime();
  const days = ms / 86_400_000;
  if (days < 0.5) return "Comes back later today";
  if (days < 1.5) return "Comes back tomorrow";
  if (days < 13.5) return `Comes back in about ${Math.round(days)} days`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `Comes back in about ${weeks} weeks`;
  return `Comes back in about ${Math.round(days / 30)} months`;
}

/** Calm level-change copy (ux §7.11: no blame, no hype). */
export function levelChangeText(
  change: "promoted" | "demoted" | null,
  level: number,
  of: number,
): string | null {
  if (change === "promoted") return `Level ${level} of ${of} opens next time: a little more to tell apart.`;
  if (change === "demoted")
    return `Next time starts at level ${level} of ${of}. The ear settles faster there, then climbs again.`;
  return null;
}

export interface SummaryView {
  title: string;
  accuracy: string;
  word: string;
  /** What moved: level, categories that improved, the confusion worth a listen. */
  moved: string[];
  /** When this family comes back (SRS), or the free-practice note. */
  next: string | null;
  /** The rating the grade map gives (shown only as a word), for tests and the dev tooltip. */
  rating: "Again" | "Hard" | "Good" | "Easy" | null;
}

const RATING_NAMES = ["Again", "Hard", "Good", "Easy"] as const;

/** Everything the set summary shows, from the local summary and the server's finish. */
export function summaryView(input: {
  def: FamilyDef;
  summary: SetSummary;
  outcomes: readonly TrialOutcome[];
  finish: DrillFinish | null;
  purpose: DrillSession["purpose"];
  cardLevel: number;
  before: Pick<FamilyState, "categoryStats"> | null;
  profile: Pick<LearnerProfile, "singTolCents">;
  now?: Date;
}): SummaryView {
  const { def, summary, finish } = input;
  const answered = input.outcomes.filter((o) => o.result.skipped !== true);
  const hits = answered.filter((o) => o.result.correct).length;
  const revealed = input.outcomes.some((o) => o.revealed);
  const review: SrsReviewResult | undefined = finish?.reviews.find((r) => r.cardId === def.id);
  const moved: string[] = [];
  const level = review?.familyState?.level ?? input.cardLevel;
  const change = levelChangeText(review?.levelChange ?? null, level, def.levels.length);
  if (change) moved.push(change);
  // Categories that went up against their running accuracy.
  for (const [cat, s] of Object.entries(summary.perCategory)) {
    const prev = input.before?.categoryStats[cat];
    if (!prev || prev.n < 2 || s.n < 2) continue;
    const was = prev.hits / prev.n;
    const now = s.hits / s.n;
    if (now - was >= 0.15) moved.push(`${optionLabel(cat)}: ${pctText(now)} today, up from ${pctText(was)}.`);
  }
  const top = Object.entries(summary.confusions).sort((a, b) => b[1] - a[1])[0];
  if (top) {
    const [expected, got] = top[0].split("|");
    const tip = def.confusionTips?.[top[0]];
    moved.push(
      `${optionLabel(got ?? "")} when it was ${optionLabel(expected ?? "")}: ${top[1] === 1 ? "once" : `${top[1]} times`}${tip ? `. ${tip}` : "."}`,
    );
  }
  let next: string | null = null;
  if (review) next = nextDueText(review.dueAt, input.now);
  else if (input.purpose === "practice") next = "Free practice: your schedule stays as it is.";
  else if (input.purpose === "anchor") next = "A warm-up anchor: it counts as practice, not as a review.";
  const local = gradeFor({
    meanCredit: summary.meanCredit,
    medianRtMs: summary.medianRtMs,
    fastRtMs: def.fastRtMs,
    extraReplays: summary.extraReplays,
    hintRung: 0,
    revealed,
    atOrAboveLevel: summary.playedLevel >= input.cardLevel,
    ...(def.kind === "production" && def.mic === true && summary.meanAbsCents !== null
      ? { meanAbsCents: summary.meanAbsCents, tolCents: input.profile.singTolCents }
      : {}),
  });
  const rating = review?.rating ?? (answered.length > 0 ? RATING_NAMES[local - 1] : null) ?? null;
  return {
    title: def.title,
    accuracy: answered.length === 0 ? "No answers" : `${hits} of ${answered.length}`,
    word: answered.length === 0 ? "skipped" : setWord(summary.meanCredit),
    moved,
    next,
    rating,
  };
}

/** Summarizes the outcomes of a single-family set. */
export function summarize(
  plan: SetPlan,
  trials: readonly Trial<unknown>[],
  outcomes: readonly TrialOutcome[],
): SetSummary {
  return summarizeSet(
    plan,
    trials,
    outcomes.map((o) => o.result),
  );
}

// --- Practice hub ----------------------------------------------------------------------------------

/**
 * `resting`: a family that left its own card for mixed practice before its mastery level (decision 27: the
 * first-review bound makes room by letting the most stable family rest in its composite). It is still practised
 * there, keeps its level and comes back to its own card where it left off — never "mastered", never lost.
 */
export type FamilyStatus = "pending" | "locked" | "unlocked" | "resting" | "mastered";

/** The lesson unit of a lesson ID ("U04.L01" → "U04"). */
export const unitOf = (lessonId: string): string => lessonId.split(".")[0] ?? lessonId;

export { isResting, RESTING_LINE };

export function familyStatus(
  def: FamilyDef,
  state: FamilyState | undefined,
  completed: ReadonlySet<string>,
): FamilyStatus {
  if (isPendingGenerator(def.generator)) return "pending";
  if (!completed.has(def.unlock.lesson) && !state) return "locked";
  if (state && state.level >= def.masteryLevel) return "mastered";
  if (state && isResting(def, state)) return "resting";
  if (state && state.graduatedAt !== null) return "mastered";
  return "unlocked";
}

/** Composite reviews are not practised by hand: they appear only through the warm-up. */
export const isCompositeFamily = (def: FamilyDef): boolean => isCompositeGenerator(def.generator);

export type StageKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
export const STAGE_TITLES: Record<StageKey | "concepts", { title: string; sub: string }> = {
  A: {
    title: "Stage A · Pulse and pitch",
    sub: "Feel the beat, match a note, hear higher and lower, find home.",
  },
  B: {
    title: "Stage B · Degrees in major",
    sub: "Hear each note's pull against the key, then sing it home.",
  },
  C: { title: "Stage C · Intervals and melody", sub: "Two notes in a key, short tunes by ear and voice." },
  D: {
    title: "Stage D · Chords and progressions",
    sub: "Chord colours, bass lines, cadences and common loops.",
  },
  E: { title: "Stage E · Minor, sevenths and modes", sub: "The darker and richer colours." },
  F: { title: "Stage F · Chromatic colour", sub: "Notes and chords from outside the key." },
  G: { title: "Stage G · Jazz harmony", sub: "ii–V–I, guide tones, extensions, substitutions." },
  H: { title: "Stage H · Groove and feel", sub: "Syncopation, swing, clave and odd groupings." },
  concepts: { title: "Reading and facts", sub: "Counting, reading rhythm and notes, spelling, keys." },
};

export interface StageGroup {
  key: StageKey | "concepts";
  title: string;
  sub: string;
  families: FamilyDef[];
}

/** Families grouped by ear-training stage (contracts §7.3), concept families after them. */
export function groupByStage(
  defs: readonly FamilyDef[],
  stages: Readonly<Record<StageKey, readonly string[]>>,
): StageGroup[] {
  const stageOf = new Map<string, StageKey>();
  for (const [k, ids] of Object.entries(stages) as [StageKey, readonly string[]][])
    for (const id of ids) stageOf.set(id, k);
  const groups = new Map<StageKey | "concepts", FamilyDef[]>();
  for (const d of defs) {
    if (isCompositeFamily(d)) continue;
    const k = stageOf.get(d.id) ?? "concepts";
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const order: (StageKey | "concepts")[] = ["A", "B", "C", "D", "E", "F", "G", "H", "concepts"];
  return order
    .filter((k) => (groups.get(k)?.length ?? 0) > 0)
    .map((k) => {
      const fams = groups.get(k) as FamilyDef[];
      const ids = k === "concepts" ? [] : (stages[k] ?? []);
      fams.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      return { key: k, ...STAGE_TITLES[k], families: fams };
    });
}

/** "Recall 92%" for a card, or null when the family has no card yet. */
export function recallOf(card: SrsCard | undefined): number | null {
  return card ? card.retrievability : null;
}

/** Overall running accuracy of a family's categories (hits are credits). */
export function familyAccuracy(state: FamilyState | undefined): { n: number; acc: number | null } {
  const stats = Object.values(state?.categoryStats ?? {});
  const n = stats.reduce((a, s) => a + s.n, 0);
  const hits = stats.reduce((a, s) => a + s.hits, 0);
  return { n, acc: n === 0 ? null : hits / n };
}

/**
 * A family's level, honestly: where it is, of how many, and how far the lessons done so far let it go
 * ("Level 2 of 7 · up to level 3 for now"). Never a count of due cards.
 */
export function levelLine(def: FamilyDef, state: FamilyState | undefined): string {
  const total = def.levels.length;
  const level = Math.max(1, Math.min(total, state?.level ?? 1));
  const open = Math.max(level, Math.min(total, state?.maxOpenLevel ?? 1));
  const head = `Level ${level} of ${total}`;
  if (total === 1 || open >= total) return head;
  return `${head} · up to level ${open} for now`;
}

/** The status line of a pending family: honest about when its drills arrive. */
export function pendingText(def: FamilyDef, completed: ReadonlySet<string>): string {
  const unit = unitOf(def.unlock.lesson);
  return completed.has(def.unlock.lesson)
    ? "Its drills are not built yet; the lessons keep teaching it."
    : `Arrives with ${unit}`;
}

// --- tap display ------------------------------------------------------------------------------------

/**
 * A plain account of a tap take for the pad (display only; the grade comes from `@oak/pitch` `gradeTaps`):
 * each target matched to the nearest unused tap within 150 ms, and the mean signed offset of the matches.
 */
export function tapReport(
  taps: readonly number[],
  targets: readonly number[],
): { matched: number; meanOffsetMs: number | null; text: string } {
  const used = new Set<number>();
  const offsets: number[] = [];
  for (const t of targets) {
    let best = -1;
    let bestD = 0.15;
    taps.forEach((tap, i) => {
      const d = Math.abs(tap - t);
      if (!used.has(i) && d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best >= 0) {
      used.add(best);
      offsets.push(((taps[best] as number) - t) * 1000);
    }
  }
  const mean = offsets.length === 0 ? null : offsets.reduce((a, b) => a + b, 0) / offsets.length;
  const extra = taps.length - used.size;
  let text =
    taps.length === 0 ? "No taps reached the pad." : `${offsets.length} of ${targets.length} hits matched`;
  if (taps.length > 0 && mean !== null && Math.abs(mean) >= 15)
    text += `, about ${Math.round(Math.abs(mean))} ms ${mean > 0 ? "late" : "early"} on average`;
  if (taps.length > 0 && extra > 0) text += `, ${extra} extra ${extra === 1 ? "tap" : "taps"}`;
  return { matched: offsets.length, meanOffsetMs: mean, text: taps.length > 0 ? `${text}.` : text };
}

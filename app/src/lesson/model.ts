// The lesson player's pure rules: which steps show at a target (contracts §9.1, §9.2 item 7), the 15-minute
// split at `wrapAt` (§9.4), where a learner resumes, when Continue is allowed (ux §3.1: graded steps need a
// pass, a reveal or a disputed result; ungraded steps can be skipped), the answer surface of every exercise
// kind (contracts §5.4), the rail, and the Workbench set-up a step asks for. No DOM, no Vite: `bun test`.
import {
  type AllEx,
  type CodeRange,
  drawExerciseParams,
  type Exercise,
  type ExerciseKind,
  type GradeResult,
  type HintLadder,
  type HintRung,
  type InvestigateQ,
  type LessonDef,
  type LessonProgress,
  lessonBudget,
  type ParamValues,
  type StepDef,
  type StepKind,
  type StepState,
  stripMarkers,
  substituteParams,
  type TargetMinutes,
} from "@oak/api";
import type { AnswerSpec } from "../answers/types.ts";
import { type GateState, gateAllowsContinue } from "./gate.ts";
import { isSungStep } from "./rules.ts";

export type SplitPart = "A" | "B";

/** Steps shown at a target: optional stretch steps only at 25 minutes (contracts §9.2 item 7). */
export function visibleSteps(def: Pick<LessonDef, "steps">, target: TargetMinutes): StepDef[] {
  return def.steps.filter((s) => target === 25 || !s.optional);
}

/**
 * The part of a split lesson played today: at the 15-minute target a lesson whose scaled content exceeds 10
 * minutes is split at `wrapAt`. Part B is played once part A is stored on the server.
 */
export function splitPartFor(
  def: Pick<LessonDef, "steps" | "wrapAt">,
  target: TargetMinutes,
  progress: Pick<LessonProgress, "splitPart" | "status"> | null,
): SplitPart | null {
  if (progress?.splitPart === "A" && progress.status !== "completed") return "B";
  if (target !== 15) return null;
  if (progress?.status === "completed") return null;
  return lessonBudget(def).splitsAt15 ? "A" : null;
}

/** Index range `[from, to]` (inclusive) of the steps played in a part. */
export function partRange(
  steps: readonly StepDef[],
  wrapAt: string,
  part: SplitPart | null,
): [number, number] {
  const wrap = steps.findIndex((s) => s.id === wrapAt);
  const last = steps.length - 1;
  if (part === null || wrap < 0) return [0, last];
  return part === "A" ? [0, wrap] : [Math.min(wrap + 1, last), last];
}

/**
 * Where the player opens: an explicit `?step=` wins (a revisit), then the server's current step, then the first
 * step of today's part. The result is clamped to the part.
 */
export function startIndex(
  steps: readonly StepDef[],
  opts: { search?: string | undefined; currentStep?: string | null; range: [number, number] },
): number {
  const [from, to] = opts.range;
  const at = (id: string | null | undefined) => (id ? steps.findIndex((s) => s.id === id) : -1);
  const search = at(opts.search);
  if (search >= 0) return search;
  const current = at(opts.currentStep);
  if (current >= from && current <= to) return current;
  return from;
}

export const globalExerciseId = (ownerId: string, ex: Pick<Exercise, "id">) => `${ownerId}/${ex.id}`;

/** Params of the attempt series (`drawExerciseParams`); `{}` when the exercise declares none. */
export function stepParams(ownerId: string, ex: Exercise, seriesNo: number): ParamValues {
  if (!ex.params || Object.keys(ex.params).length === 0) return {};
  return drawExerciseParams(ex, globalExerciseId(ownerId, ex), seriesNo);
}

/** The exercise with its params substituted (prompt, starter, solutions, stimulus, hint text). */
export function withParams<E extends Exercise>(ex: E, params: ParamValues): E {
  return Object.keys(params).length === 0 ? ex : substituteParams(ex, params);
}

/** Kinds whose answer is the code in the Workbench editor. */
export const EDITOR_KINDS: ReadonlySet<ExerciseKind> = new Set<ExerciseKind>([
  "code-modify",
  "error-hunt",
  "code-make",
  "compose-brief",
  "run-investigate",
]);

/** The step's starter as the editor shows it: clean code and the editable regions (`null` = all editable). */
export interface EditorStart {
  code: string;
  editable: CodeRange[] | null;
}
export function editorStart(ex: Exercise | undefined, example: StepDef["example"]): EditorStart | null {
  if (ex && "code" in ex && typeof ex.code === "object" && ex.code !== null && "starter" in ex.code) {
    const clean = stripMarkers(ex.code.starter);
    return { code: clean.code, editable: clean.editable };
  }
  if (ex?.kind === "transcribe-step") return { code: "", editable: null };
  if (ex?.kind === "dictation" && ex.answer.ui === "code") {
    const clean = stripMarkers(ex.answer.starter);
    return { code: clean.code, editable: clean.editable };
  }
  if (example) return { code: example.code, editable: [] };
  return null;
}

/** What the step plays in the Workbench (listen items and predict code are shown read-only). */
export function showsWorkbench(step: StepDef): boolean {
  const ex = step.exercise;
  if (!ex) return step.example !== undefined;
  if (EDITOR_KINDS.has(ex.kind) || ex.kind === "code-fill" || ex.kind === "transcribe-step") return true;
  if (ex.kind === "dictation" && (ex.byEar || ex.answer.ui === "code")) return true;
  if (ex.kind === "listen" || ex.kind === "predict") return true;
  if (ex.kind === "all") return ex.parts.some((p) => EDITOR_KINDS.has(p.kind) || p.kind === "code-fill");
  return step.example !== undefined;
}

/**
 * A choice answer whose stimulus is a drawn trial that brings its own options (`params.options`, e.g. Find home's
 * note names in the trial's key, with `optionLabels` and `choiceAudio` when given) shows those options, not the
 * authored ones: the trial's expected answer is one of its own options (contracts §5.4, wave3 integration).
 */
export function withTrialOptions(
  spec: AnswerSpec | null,
  trial: { params: Record<string, unknown> } | null,
): AnswerSpec | null {
  // A drawn melody is as long as the trial draws it: the pad takes that many degrees (U03.L10 S2 drew three or
  // four notes and the authored pad took one).
  if (spec?.ui === "degree-pad" && trial) {
    const len = trial.params.sequenceLen;
    return typeof len === "number" && Number.isInteger(len) && len > 0 && len !== (spec.sequenceLen ?? 1)
      ? { ...spec, sequenceLen: len }
      : spec;
  }
  if (spec?.ui !== "choice" || !trial) return spec;
  const own = trial.params.options;
  if (!Array.isArray(own) || own.length === 0 || !own.every((o) => typeof o === "string")) return spec;
  const labels =
    trial.params.optionLabels && typeof trial.params.optionLabels === "object"
      ? (trial.params.optionLabels as Record<string, unknown>)
      : {};
  const audio = new Map<string, string>();
  if (Array.isArray(trial.params.choiceAudio))
    for (const r of trial.params.choiceAudio as { id?: unknown; audio?: unknown }[])
      if (typeof r?.id === "string" && typeof r.audio === "string") audio.set(r.id, r.audio);
  const authored = new Map(spec.options.map((o) => [o.id, o]));
  return {
    ...spec,
    options: (own as string[]).map((id) => {
      const a = authored.get(id);
      const label = typeof labels[id] === "string" ? (labels[id] as string) : (a?.label ?? noteLabel(id));
      const sound = audio.get(id) ?? a?.audio;
      return { id, label, ...(sound !== undefined ? { audio: sound } : {}) };
    }),
  };
}

/** `Bb` → `B♭`, `F#` → `F♯`; anything else as it is. */
function noteLabel(id: string): string {
  const m = /^([A-G])(bb|b|##|#)?$/.exec(id);
  if (!m) return id;
  const acc = { "": "", b: "♭", bb: "𝄫", "#": "♯", "##": "𝄪" }[m[2] ?? ""] ?? "";
  return `${m[1]}${acc}`;
}

/** The answer surface of one non-code exercise (contracts §5.4), or `null` for editor and listen kinds. */
export function answerSpecOf(ex: Exercise): AnswerSpec | null {
  switch (ex.kind) {
    case "identify":
    case "fact":
    case "staff-read":
      return ex.answer;
    case "dictation":
      // A by-ear transcription is written in the Workbench (its answer is the code there).
      return ex.byEar ? null : ex.answer;
    case "keyboard":
    case "staff-write":
      return ex.answer;
    case "tap":
      return { ui: "tap" };
    case "sing":
      return { ui: "mic" };
    case "predict":
      if (ex.mode === "hum")
        return { ui: "hum", bars: ex.bars, ...(ex.humTrack !== undefined ? { track: ex.humTrack } : {}) };
      if (ex.mode === "count") return { ui: "number" };
      return { ui: "choice", options: ex.choices ?? [] };
    case "parsons":
      return { ui: "order", blocks: ex.blocks, distractors: ex.distractors ?? [], assemble: ex.assemble };
    case "code-fill":
      return { ui: "blanks", starter: ex.code.starter, blanks: ex.blanks };
    default:
      return null;
  }
}

/** The answer surface of one investigate question. */
export function questionSpec(q: InvestigateQ): AnswerSpec {
  if (q.q === "choice") return { ui: "choice", options: q.options };
  if (q.q === "number") return { ui: "number" };
  return { ui: q.q, target: q.target };
}

/** A part of an `all` step, or the step's exercise itself. */
export function partsOf(ex: Exercise): Exclude<Exercise, AllEx>[] {
  return ex.kind === "all" ? ex.parts : [ex];
}

/** Whether the exercise is checked against an answer at all (listen and plain run steps are not). */
export function isCheckable(ex: Exercise): boolean {
  if (ex.kind === "listen") return false;
  if (ex.kind === "run-investigate") return ex.questions.length > 0;
  return true;
}

/** Whether the hint ladder exists for this exercise (`hints: null` for predict, listen, checkpoint items). */
export function ladderOf(ex: Exercise | undefined): HintLadder | null {
  if (!ex || ex.hints === null) return null;
  if (ex.kind === "predict" || ex.kind === "listen") return null;
  return ex.hints;
}

export interface StepProgress {
  state: StepState | null;
  result: GradeResult | null;
  /** Completed without a graded pass: an ungraded step played or answered, or a disputed grading. */
  done: boolean;
  disputed: boolean;
}

/**
 * Whether Continue is open on a step (ux §3.1). The Make has its own "Save sketch" instead. U05.L08's `gateCheck`
 * step is the course's one hard gate (contracts §3.1 rule 6): only a gate pass opens it, never a reveal or a
 * report.
 */
export function canContinue(step: StepDef, p: StepProgress, gate: GateState | null = null): boolean {
  if (step.kind === "make") return false;
  if (step.gateCheck === true) return gateAllowsContinue(step, p.result, gate);
  if (!step.graded) return true;
  // Singing never gates anything (contracts §7.6, §8): a sung step can always be left, a graded one too.
  if (isSungStep(step)) return true;
  if (p.disputed) return true;
  if (p.state?.passed || (p.state?.rung ?? 0) >= 4) return true;
  return p.result?.status === "pass";
}

/** "Continue" on an ungraded step the learner did not finish reads "Skip" (it can always be skipped). */
export function continueLabel(step: StepDef, p: StepProgress): "Continue" | "Skip" {
  if (step.exercise && step.graded && isSungStep(step)) return stepDone(step, p) ? "Continue" : "Skip";
  if (!step.exercise || step.graded) return "Continue";
  return stepDone(step, p) ? "Continue" : "Skip";
}

/** Whether a step counts as done on the rail. */
export function stepDone(step: StepDef, p: StepProgress): boolean {
  if (p.done || p.disputed || p.state?.passed) return true;
  if (p.result?.status === "pass") return true;
  return step.graded === true && (p.state?.rung ?? 0) >= 4;
}

export interface RailItem {
  id: string;
  label: string;
  state: "done" | "current" | "todo" | "optional";
  /** A hint was used (a small dot; informational, never shaming). */
  assisted: boolean;
}

export function railOf(
  steps: readonly StepDef[],
  index: number,
  progress: (id: string) => StepProgress,
): RailItem[] {
  return steps.map((s, i) => {
    const p = progress(s.id);
    const state: RailItem["state"] =
      i === index ? "current" : stepDone(s, p) ? "done" : s.optional ? "optional" : "todo";
    return {
      id: s.id,
      label: `${STEP_KIND_LABEL[s.kind]}: ${s.title}`,
      state,
      assisted: (p.state?.rung ?? 0) > 0,
    };
  });
}

export const STEP_KIND_LABEL: Record<StepKind, string> = {
  listen: "Listen",
  predict: "Predict",
  run: "Run",
  investigate: "Investigate",
  see: "See",
  concept: "Concept",
  modify: "Modify",
  parsons: "Order",
  quiz: "Quiz",
  ear: "Ear",
  sing: "Sing",
  tap: "Tap",
  dictate: "Dictate",
  notate: "Notate",
  compare: "Compare",
  make: "Make",
  reflect: "Reflect",
};

/** The music views a step asks for, in the Workbench's order. */
export function viewsOf(step: StepDef): ("roll" | "staff" | "keyboard")[] {
  const p = step.ui.panels;
  const out: ("roll" | "staff" | "keyboard")[] = [];
  if (p.roll) out.push("roll");
  if (p.staff) out.push("staff");
  if (p.keyboard) out.push("keyboard");
  return out;
}

/**
 * The Workbench tab a step opens on when its roll and staff have to be tabs: Both for a step that shows the roll
 * with the bass clef or the grand staff (the bass line is what it asks the learner to read); else the default.
 */
export function initialTabOf(step: StepDef): "both" | undefined {
  const p = step.ui.panels;
  return p.roll && (p.staff === "grand" || p.staff === "bass") ? "both" : undefined;
}

/** The scale argument a Band's `{{key}}` takes: `"C4:major"`. */
export function keyArg(key: { tonic: string; mode: string }): string {
  return `${key.tonic}4:${key.mode}`;
}

/** Rung after a hint request when the server is not asked (preview): +1 up to 3; reveal is 4. */
export function localRung(rung: HintRung, reveal: boolean): HintRung {
  if (reveal) return 4;
  return Math.min(3, rung + 1) as HintRung;
}

/** Reveal opens after 2 graded attempts (3 for sing and tap), contracts §5.3. */
export function revealNeeds(ex: Exercise | undefined): number {
  return ex && (ex.kind === "sing" || ex.kind === "tap") ? 3 : 2;
}

/** The text a hint rung shows ("auto" reveal renders the solution). */
export function hintText(ladder: HintLadder, rung: HintRung): string | null {
  if (rung < 1) return null;
  const h = ladder[rung - 1];
  if (h === undefined) return null;
  return h === "auto" ? null : h.text;
}

/** The solution the reveal shows for an exercise (`reference.solutions[0]`, or the rung-4 patch). */
export function revealCode(ex: Exercise): string | null {
  const four = ex.hints?.[3];
  if (four && four !== "auto" && four.patch) return four.patch;
  if ("reference" in ex && ex.reference && "solutions" in ex.reference)
    return ex.reference.solutions[0] ?? null;
  if (ex.kind === "transcribe-step" && ex.grading.mode === "auto")
    return ex.grading.reference.solutions[0] ?? null;
  return null;
}

/** "Bar 2" style list of unique bars, for calm summaries. */
export function barsText(bars: readonly number[]): string {
  const u = [...new Set(bars)].sort((a, b) => a - b);
  if (u.length === 0) return "";
  if (u.length === 1) return `bar ${u[0]}`;
  return `bars ${u.slice(0, -1).join(", ")} and ${u[u.length - 1]}`;
}

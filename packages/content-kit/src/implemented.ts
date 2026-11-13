// What the current wave supports (contracts §5.1). A kind or rule may sit in the schema before it is
// implemented; content CI rejects a lesson that uses anything outside this list. Rubric rules are
// implemented when the first capstone that needs them is authored.
import { flattenExercise } from "./define.ts";
import type {
  AnswerUiKind,
  AstConstraintName,
  Exercise,
  ExerciseKind,
  LessonDef,
  Matcher,
  MatcherName,
  RubricRule,
  RubricRuleName,
} from "./schema/index.ts";

export interface Implemented {
  exerciseKinds: readonly ExerciseKind[];
  matchers: readonly MatcherName[];
  constraints: readonly AstConstraintName[];
  rubricRules: readonly RubricRuleName[];
  answerUis: readonly AnswerUiKind[];
  customRules: readonly string[];
  /**
   * Wave 4. Named shapes inside a kind that the platform must support before content may use them
   * (`SchemaFeature`): a new staff expectation, a new field of an existing rule, a step UI option.
   */
  features?: readonly SchemaFeature[];
}

/**
 * Wave 4 shapes that live inside an existing kind, so the kind lists alone cannot tell whether the platform
 * handles them. `unimplementedIn` reports a use of one that `features` does not list.
 */
export const SCHEMA_FEATURES = [
  /** `StaffExpect` `chords` with `palette.chords` (chords built on the staff). */
  "staff-expect.chords",
  /** `DictationEx.stageAnswers` / `stageFlow` / `stagePass` (staged chord dictation). */
  "dictation.stage-answers",
  /** `ByEarSpec.parts` (by-ear transcription one track at a time, bass first). */
  "by-ear.parts",
  /** `TranscribeStepEx.grading.stages` and `given`. */
  "transcribe.stages",
  /** `Stimulus` `capstone-song`. */
  "stimulus.capstone-song",
  /** `Stimulus.showLeadSheet` and `StepUi.leadSheet`. */
  "lead-sheet",
  /** `StepUi.initialPanels`. */
  "step.initial-panels",
  /** `voice-leading` with `voices`, `commonTones`, `noCrossing` or `bassFree` (the U05.L07 gate check). */
  "voice-leading.gate",
  /** `progression` with `bars`. */
  "progression.bars",
  /** `StepDef.gateCheck` (U05.L08's second chance at the voicing gate) and the condition's `variants`. */
  "step.gate-check",
] as const;
export type SchemaFeature = (typeof SCHEMA_FEATURES)[number];

/**
 * Wave 1 (the platform, exemplar lessons U00 to U03, C0 and C1): what @oak/grader grades and @oak/notation
 * supports. `transcribe-step` and `staff-write` (with the `staff-input` answer, @oak/notation's staff
 * editing helpers) joined at integration, once gradeExercise handled all kinds; the app's answer UIs are
 * Wave 2 for every kind alike.
 *
 * Wave 4 Foundation added what the grader already grades and unit-tests and the app already renders (the
 * drills use them): the `harmony` matcher; the rules `cadence`, `chord-tones-strong`, `progression`,
 * `contains-rn`, `harmonic-rhythm` and `voice-leading` (its Wave 3 fields; the gate fields are
 * `voice-leading.gate` in `PLANNED`); the `quality-pad` and `rn-palette` widgets (app/src/answers/widgets/
 * Harmony.tsx). C2 is the first capstone that needs the rules (contracts §5.1).
 */
export const IMPLEMENTED: Implemented = {
  exerciseKinds: [
    "predict",
    "run-investigate",
    "code-modify",
    "code-fill",
    "parsons",
    "error-hunt",
    "code-make",
    "identify",
    "fact",
    "keyboard",
    "staff-read",
    "tap",
    "sing",
    "dictation",
    "transcribe-step",
    "staff-write",
    "compose-brief",
    "listen",
    "all",
  ],
  matchers: ["events", "rhythm", "melody", "harmony", "pcset", "rubric", "all"],
  constraints: [
    "must-use",
    "must-not-use",
    "arg-matches",
    "labels",
    "no-note-names",
    "no-randomness",
    "max-changed-tokens",
    "edit-only-regions",
    "tempo",
    "max-chars",
  ],
  rubricRules: [
    "bars",
    "tempo-bpm",
    "tracks",
    "in-key",
    "ends-on-degree",
    "range",
    "step-ratio",
    "uses",
    "onsets",
    "degree-set",
    "sounds",
    "distinct-pitches",
    "motif-reuse",
    "cadence",
    "chord-tones-strong",
    "progression",
    "contains-rn",
    "harmonic-rhythm",
    "voice-leading",
    // Wave 4 Build (grader): graded with tests in packages/grader/src/rubric/wave4.test.ts.
    "pickup",
    "chord-qualities",
    "chord-inversions",
    "non-chord-tones",
  ],
  answerUis: [
    "choice",
    "degree-pad",
    "quality-pad",
    "rn-palette",
    "text",
    "number",
    "keyboard",
    "grid",
    "code",
    "tap",
    "mic",
    "bar-buttons",
    "click-code",
    "click-staff",
    "click-roll",
    "staff-input",
    // Wave 4 integration: graded (grade/answers.ts slotChoices) and rendered (app/src/answers registry).
    "slot-choice",
  ],
  customRules: [],
  // Wave 4 Build (grader): shapes that need only the grader (no renderer), graded with tests. Wave 4
  // integration: the shapes whose grading is tested here and whose renderer has landed — staff chords
  // (app/src/answers StaffInput with `palette.chords`), staged dictation and by-ear parts (app/src/lesson
  // staged.tsx, byear.tsx), lead sheets (lesson lead-sheet.tsx over @oak/notation `leadSheetInput`), the
  // panels a step opens (lesson → Workbench `initialPanels`) and the gate check (lesson gate.ts).
  features: [
    "voice-leading.gate",
    "progression.bars",
    "staff-expect.chords",
    "dictation.stage-answers",
    "by-ear.parts",
    "lead-sheet",
    "step.initial-panels",
    "step.gate-check",
  ],
};

/**
 * Wave 4 shapes whose GRADING is built and tested (packages/grader: grade/wave4.test.ts, grade/staff-chords.ts,
 * grade/phrase-check.ts) but whose renderer belongs to another owner (answers, lesson, notation, transcribe,
 * capstone). The renderer's owner moves the shape from `PLANNED` into `IMPLEMENTED` once it renders.
 */
export const GRADER_READY: Pick<Implemented, "answerUis" | "features"> = {
  answerUis: [],
  // Rendered by Transcribe (ladder items) and the capstone X1 workspace, which read them from the API and
  // content/capstones.ts; no lesson host renders a staged `transcribe-step` or a `capstone-song` stimulus yet.
  features: ["transcribe.stages", "stimulus.capstone-song"],
};

/**
 * Wave 4: in the schema, not yet graded or rendered. The Build phase implements each one (grader, notation,
 * answers, transcribe, capstone, lesson) and moves it into `IMPLEMENTED` with its tests. Unit specs may
 * plan with these (content/validate/specs.test.ts); a lesson that uses one fails content CI until it moves.
 * Docs: AUTHORING §17, docs/design/wave4.md.
 */
export const PLANNED: Implemented = {
  exerciseKinds: [],
  matchers: [],
  constraints: [],
  rubricRules: [],
  answerUis: [],
  customRules: [],
  features: SCHEMA_FEATURES.filter((f) => !(IMPLEMENTED.features ?? []).includes(f)),
};

/** `IMPLEMENTED` plus `PLANNED`: what a unit spec may promise for this wave. */
export function plannedOrImplemented(
  impl: Implemented = IMPLEMENTED,
  planned: Implemented = PLANNED,
): Implemented {
  const u = <T>(a: readonly T[] = [], b: readonly T[] = []): T[] => [...new Set([...a, ...b])];
  return {
    exerciseKinds: u(impl.exerciseKinds, planned.exerciseKinds),
    matchers: u(impl.matchers, planned.matchers),
    constraints: u(impl.constraints, planned.constraints),
    rubricRules: u(impl.rubricRules, planned.rubricRules),
    answerUis: u(impl.answerUis, planned.answerUis),
    customRules: u(impl.customRules, planned.customRules),
    features: u(impl.features, planned.features),
  };
}

export interface UnimplementedUse {
  what: "exercise" | "matcher" | "constraint" | "rubric-rule" | "answer-ui" | "custom-rule" | "feature";
  name: string;
  /** Exercise slug. */
  exercise: string;
}

function matcherUses(m: Matcher, ex: string, impl: Implemented, out: UnimplementedUse[]): void {
  if (!impl.matchers.includes(m.m)) out.push({ what: "matcher", name: m.m, exercise: ex });
  if (m.m === "all") for (const sub of m.of) matcherUses(sub, ex, impl, out);
  if (m.m === "rubric") for (const r of m.rules) ruleUses(r, ex, impl, out);
}
function featureUse(f: SchemaFeature, ex: string, impl: Implemented, out: UnimplementedUse[]): void {
  if (
    !(impl.features ?? []).includes(f) &&
    !out.some((u) => u.what === "feature" && u.name === f && u.exercise === ex)
  )
    out.push({ what: "feature", name: f, exercise: ex });
}
function ruleUses(r: RubricRule, ex: string, impl: Implemented, out: UnimplementedUse[]): void {
  if (!impl.rubricRules.includes(r.rule)) out.push({ what: "rubric-rule", name: r.rule, exercise: ex });
  if (r.rule === "voice-leading" && (r.voices !== undefined || r.commonTones || r.noCrossing || r.bassFree))
    featureUse("voice-leading.gate", ex, impl, out);
  if (r.rule === "progression" && r.bars) featureUse("progression.bars", ex, impl, out);
  if (r.rule === "custom" && !impl.customRules.includes(r.fn))
    out.push({ what: "custom-rule", name: r.fn, exercise: ex });
  if (r.rule === "matches") matcherUses(r.matcher, ex, impl, out);
}

/** Everything an exercise uses that `impl` does not list. Empty = the exercise can ship in this wave. */
export function unimplementedIn(exercise: Exercise, impl: Implemented = IMPLEMENTED): UnimplementedUse[] {
  const out: UnimplementedUse[] = [];
  for (const ex of flattenExercise(exercise)) {
    if (!impl.exerciseKinds.includes(ex.kind)) out.push({ what: "exercise", name: ex.kind, exercise: ex.id });
    if ("matcher" in ex && ex.matcher) matcherUses(ex.matcher, ex.id, impl, out);
    if ("rubric" in ex) for (const r of ex.rubric) ruleUses(r, ex.id, impl, out);
    if ("constraints" in ex)
      for (const c of ex.constraints ?? [])
        if (!impl.constraints.includes(c.c)) out.push({ what: "constraint", name: c.c, exercise: ex.id });
    if ("answer" in ex && !impl.answerUis.includes(ex.answer.ui))
      out.push({ what: "answer-ui", name: ex.answer.ui, exercise: ex.id });
    if ("stimulus" in ex && ex.stimulus) {
      if (ex.stimulus.src === "capstone-song") featureUse("stimulus.capstone-song", ex.id, impl, out);
      if (ex.stimulus.src === "code" && ex.stimulus.showLeadSheet) featureUse("lead-sheet", ex.id, impl, out);
    }
    if (ex.kind === "staff-write" && (ex.expect.e === "chords" || ex.answer.palette.chords))
      featureUse("staff-expect.chords", ex.id, impl, out);
    if (ex.kind === "dictation") {
      if (ex.stageAnswers || ex.stageFlow || ex.stagePass !== undefined)
        featureUse("dictation.stage-answers", ex.id, impl, out);
      for (const ui of Object.values(ex.stageAnswers ?? {}))
        if (ui && !impl.answerUis.includes(ui.ui))
          out.push({ what: "answer-ui", name: ui.ui, exercise: ex.id });
      if (ex.byEar?.parts) {
        featureUse("by-ear.parts", ex.id, impl, out);
        for (const p of ex.byEar.parts) matcherUses(p.matcher, ex.id, impl, out);
      }
    }
    if (ex.kind === "transcribe-step" && (ex.given || (ex.grading.mode === "auto" && ex.grading.stages))) {
      featureUse("transcribe.stages", ex.id, impl, out);
      if (ex.grading.mode === "auto")
        for (const st of ex.grading.stages ?? []) matcherUses(st.matcher, ex.id, impl, out);
    }
    if (ex.kind === "parsons") {
      if (ex.accept.matcher) matcherUses(ex.accept.matcher, ex.id, impl, out);
      for (const r of ex.accept.rubric ?? []) ruleUses(r, ex.id, impl, out);
    }
    if (ex.kind === "transcribe-step" && ex.grading.mode === "auto")
      matcherUses(ex.grading.matcher, ex.id, impl, out);
    if (ex.kind === "staff-write" && ex.expect.e === "events")
      matcherUses(ex.expect.matcher, ex.id, impl, out);
  }
  return out;
}

export function unimplementedInLesson(def: LessonDef, impl: Implemented = IMPLEMENTED): UnimplementedUse[] {
  return def.steps.flatMap((s) => {
    const out = s.exercise ? unimplementedIn(s.exercise, impl) : [];
    if (s.ui.initialPanels) featureUse("step.initial-panels", s.id, impl, out);
    if (s.ui.leadSheet) featureUse("lead-sheet", s.id, impl, out);
    if (s.gateCheck) featureUse("step.gate-check", s.id, impl, out);
    return out;
  });
}

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
}

/**
 * Wave 1 (the platform, exemplar lessons U00 to U03, C0 and C1): what @oak/grader grades and @oak/notation
 * supports. `transcribe-step` and `staff-write` (with the `staff-input` answer, @oak/notation's staff
 * editing helpers) joined at integration, once gradeExercise handled all kinds; the app's answer UIs are
 * Wave 2 for every kind alike.
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
  matchers: ["events", "rhythm", "melody", "pcset", "rubric", "all"],
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
  ],
  answerUis: [
    "choice",
    "degree-pad",
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
  ],
  customRules: [],
};

export interface UnimplementedUse {
  what: "exercise" | "matcher" | "constraint" | "rubric-rule" | "answer-ui" | "custom-rule";
  name: string;
  /** Exercise slug. */
  exercise: string;
}

function matcherUses(m: Matcher, ex: string, impl: Implemented, out: UnimplementedUse[]): void {
  if (!impl.matchers.includes(m.m)) out.push({ what: "matcher", name: m.m, exercise: ex });
  if (m.m === "all") for (const sub of m.of) matcherUses(sub, ex, impl, out);
  if (m.m === "rubric") for (const r of m.rules) ruleUses(r, ex, impl, out);
}
function ruleUses(r: RubricRule, ex: string, impl: Implemented, out: UnimplementedUse[]): void {
  if (!impl.rubricRules.includes(r.rule)) out.push({ what: "rubric-rule", name: r.rule, exercise: ex });
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
  return def.steps.flatMap((s) => (s.exercise ? unimplementedIn(s.exercise, impl) : []));
}

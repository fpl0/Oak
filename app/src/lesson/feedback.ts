// From a GradeResult to what the learner sees, redacted to the server's rung (contracts §10.5 through
// `toIssueView`): the answer widgets' per-part marks, the summary line, the catalog copy of each issue (with
// the exercise's own `feedbackText` overrides) and the value a reveal shows. Pure: `bun test`.
import {
  type Diagnostic,
  type Exercise,
  type GradeResult,
  type GradeView,
  type HintRung,
  type Trial,
  toIssueView,
} from "@oak/api";
import type { AnswerFeedback, AnswerSpec, AnswerValue, PartMark } from "../answers/types.ts";
import { summaryText, whereText } from "../workbench/feedback.ts";

/** Catalog text with the exercise's overrides; the result's own message, then the ID, as fallbacks. */
export function renderer(
  catalog: ((d: Diagnostic, overrides?: Exercise["feedbackText"]) => string) | null,
  result: GradeResult | null,
  ex: Exercise | undefined,
  /** The code form of a toolbox ID (`tb.mini.alt` → `< >`), for locked-tool copy. */
  toolCode?: (id: string) => string | null,
): (d: Diagnostic) => string {
  return (raw) => {
    const d = lockedParams(raw, toolCode);
    if (catalog) {
      try {
        const t = catalog(d, ex?.feedbackText);
        if (t && t !== d.id) return t;
      } catch {
        // fall through
      }
    }
    return (
      result?.messages.find((m) => m.id === d.id && m.where?.slot === d.where?.slot)?.text ??
      result?.messages.find((m) => m.id === d.id)?.text ??
      d.id
    );
  };
}

/**
 * The lint reports a locked tool as `{ name, id, at }` while the catalog template reads `{tool}` and `{lesson}`:
 * fill the template's slots from the lint's, so the copy says which tool and which lesson.
 */
export function lockedParams(d: Diagnostic, toolCode?: (id: string) => string | null): Diagnostic {
  if (!d.id.startsWith("code.locked") || d.params.tool !== undefined) return d;
  const id = typeof d.params.id === "string" ? d.params.id : "";
  const name = (id && toolCode?.(id)) || (typeof d.params.name === "string" ? d.params.name : id);
  const lesson = typeof d.params.at === "string" ? d.params.at : "a later lesson";
  return { ...d, params: { ...d.params, tool: name, lesson, alt: "what you have so far" } };
}

export function viewFor(
  result: GradeResult,
  rung: HintRung,
  passed: boolean,
  render: (d: Diagnostic) => string,
): GradeView {
  return toIssueView(result, rung, { passed, render });
}

/**
 * One calm line: "That's it." / "2 notes differ: bars 2 and 4." / "Code didn't run." A sung or tapped answer
 * that could not be graded is not code: it says what Oak did not hear (the grader's error for no voice, mic
 * bleed or no taps), never "Code didn't run."
 */
export function summaryOf(view: GradeView, result?: Pick<GradeResult, "status" | "diagnostics">): string {
  if (result?.status === "error") {
    const ids = result.diagnostics.map((d) => d.id as string);
    if (ids.includes("sing.no-voice"))
      return "Oak didn't hear a voice. Sing or hum a little closer to the microphone, then try again.";
    if (ids.includes("sing.bleed"))
      return "The microphone hears the playback. Wired headphones fix that; then try again.";
    if (ids.some((id) => id.startsWith("sing.")))
      return "Oak couldn't follow that take. Try it again, one steady note at a time.";
    if (ids.some((id) => id.startsWith("tap.")))
      return "Oak didn't catch your taps. Tap with Space on each beat, then try again.";
  }
  return summaryText(view);
}

export function issueLines(
  view: GradeView,
): { key: string; where: string; what: string | null; fix: string | null }[] {
  return view.issues.map((i, n) => ({
    key: `${n}-${i.where.bar ?? ""}-${i.where.slot ?? ""}-${i.id ?? ""}`,
    where: i.where.slot !== undefined && i.where.bar === undefined ? `Answer ${i.where.slot}` : whereText(i),
    what: i.what ?? null,
    fix: i.fix ?? null,
  }));
}

/** Per-part marks: a slot, blank or choice with a finding is wrong; rung 0 may say where (contracts §10.5). */
export function partMarks(result: GradeResult | null, spec: AnswerSpec | null): PartMark[] {
  if (!result || result.status === "ungraded") return [];
  const marks: PartMark[] = [];
  const wrongSlots = new Set<number>();
  const wrongBlanks = new Set<string>();
  for (const d of result.diagnostics) {
    if (d.severity !== "error" && d.severity !== "warn") continue;
    if (d.where?.slot !== undefined) wrongSlots.add(d.where.slot - 1);
    if (d.where?.blank !== undefined) wrongBlanks.add(d.where.blank);
  }
  if (spec?.ui === "blanks") {
    for (const b of spec.blanks)
      marks.push({ part: b.id, ok: !wrongBlanks.has(b.id) && result.status === "pass" });
    return marks;
  }
  for (const s of wrongSlots) marks.push({ part: s, ok: false });
  return marks;
}

/** What a reveal (rung 4) shows next to the learner's answer, when the exercise says it plainly. */
export function revealValue(ex: Exercise, spec: AnswerSpec | null, trial: Trial | null): AnswerValue | null {
  if (!spec) return null;
  const correct =
    ex.kind === "identify"
      ? (trial?.expected ?? ex.correct)
      : ex.kind === "fact" || ex.kind === "staff-read"
        ? ex.correct
        : null;
  switch (spec.ui) {
    case "choice":
      if (ex.kind === "predict" && Array.isArray(ex.correct)) return ex.correct;
      return correct?.choice ?? null;
    case "degree-pad":
      return correct?.degrees ?? null;
    case "quality-pad":
      return correct?.qualities ?? null;
    case "rn-palette":
      return correct?.rn ?? null;
    case "number":
      if (ex.kind === "predict" && typeof ex.correct === "number") return ex.correct;
      return correct?.number ?? null;
    case "text":
      return correct?.text?.[0] ?? null;
    case "keyboard":
      return ex.kind === "keyboard"
        ? (ex.expect.midi ?? ex.expect.sequence ?? null)
        : (correct?.midi ?? null);
    case "order":
      return ex.kind === "parsons" ? (ex.accept.orders?.[0] ?? null) : null;
    case "staff-input":
      return ex.kind === "staff-write" && ex.expect.e === "pitches" ? ex.expect.spelled.join(" ") : null;
    default:
      return null;
  }
}

/** The feedback an answer widget shows for the latest result at the current rung. */
export function answerFeedback(o: {
  result: GradeResult | null;
  checking: boolean;
  rung: HintRung;
  spec: AnswerSpec | null;
  reveal: AnswerValue | null;
  message?: string;
}): AnswerFeedback {
  if (o.checking) return { state: "pending" };
  const r = o.result;
  if (o.rung >= 4 && o.reveal !== null)
    return { state: "revealed", correct: o.reveal, marks: partMarks(r, o.spec) };
  if (!r || r.status === "error" || r.status === "ungraded") return { state: "idle" };
  if (r.status === "pass") return { state: "correct" };
  return {
    state: "wrong",
    marks: partMarks(r, o.spec),
    ...(o.message !== undefined ? { message: o.message } : {}),
  };
}

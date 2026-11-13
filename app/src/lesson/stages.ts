// Ear steps written down in stages or parts (Wave 4, docs/design/wave4.md §11): a staged chord dictation
// (`DictationEx.stageAnswers`: bass, then quality, then numerals, each stage answered with its own widget and
// opened when the one before passes at `stagePass` or is revealed) and a by-ear transcription in parts
// (`ByEarSpec.parts`: one track at a time, the bass before any harmony part). The player grades a stage or a part
// on its own with a narrowed copy of the exercise (never an attempt), and the step's Check grades everything at
// the end. Pure: no DOM (`bun test`).
import type {
  AttemptResponse,
  ByEarPart,
  DictationEx,
  DictationStage,
  Exercise,
  GradeResult,
} from "@oak/api";
import type { ByEarEx } from "./rules.ts";

export const STAGE_PASS = 0.8;
export const PART_PASS = 0.85;

export type StagedEx = DictationEx & { stageAnswers: NonNullable<DictationEx["stageAnswers"]> };

/** A dictation answered stage by stage with its own widgets. */
export function isStaged(ex: Exercise | undefined): ex is StagedEx {
  return (
    ex?.kind === "dictation" &&
    ex.stageAnswers !== undefined &&
    Object.keys(ex.stageAnswers).length > 0 &&
    ex.byEar === undefined
  );
}

/** The stages in the order they are answered: `stages` as authored, else the widgets' order, bass first. */
export function stageOrder(ex: StagedEx): DictationStage[] {
  const own = Object.keys(ex.stageAnswers) as DictationStage[];
  const listed = ex.stages && ex.stages.length > 0 ? ex.stages : own;
  const order: DictationStage[] = ["tonic", "bass", "quality", "rn", "rhythm", "pitch"];
  return ex.stages && ex.stages.length > 0
    ? [...listed]
    : [...listed].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** The exercise as one stage is graded on its own: only that stage, full weight. */
export function stageExercise(ex: StagedEx, stage: DictationStage): StagedEx {
  return { ...ex, stages: [stage], stageWeights: [1] };
}

export const stageFlow = (ex: StagedEx) => ex.stageFlow ?? "sequential";
export const stagePass = (ex: StagedEx) => ex.stagePass ?? STAGE_PASS;

export type StageMark = "open" | "passed" | "revealed" | "locked";

/**
 * What a reveal (rung 4) shows at each stage: the stages of the step's first passing test, as the server's tutor
 * guard reads them (wave4.md §5.6). Empty when the step pins none.
 */
export function revealedStages(ex: StagedEx): Partial<Record<DictationStage, string[]>> {
  const pass = ex.tests.find((t) => t.expect === "pass");
  const r = pass?.response as { answer?: { stages?: Partial<Record<DictationStage, string[]>> } } | undefined;
  return r?.answer?.stages ?? {};
}

/** Whether a stage's own check passed it. */
export function stagePassed(ex: StagedEx, r: GradeResult | null): boolean {
  return !!r && r.status !== "error" && r.score >= stagePass(ex) - 1e-9;
}

// --- by-ear parts ----------------------------------------------------------------------------------

/** A by-ear step written one track at a time. */
export function hasParts(ex: Exercise | undefined): ex is ByEarEx & { byEar: { parts: ByEarPart[] } } {
  return ex?.kind === "dictation" && (ex.byEar?.parts?.length ?? 0) > 0;
}

const LABEL = /^\s*([A-Za-z_$][\w$]*)\s*:(?!:)/;

/**
 * The code of one labelled track and what every track shares (`setcpm`, constants): the preamble lines before
 * the first label, and the block of the label itself (a label's block runs until the next label). `null` when the
 * code has no block with that label.
 */
export function trackOnly(code: string, track: string): string | null {
  const lines = code.split("\n");
  const pre: string[] = [];
  const blocks: { label: string; lines: string[] }[] = [];
  for (const line of lines) {
    const m = LABEL.exec(line);
    if (m && !/^\s*(https?|setcpm|setcps)\b/.test(line))
      blocks.push({ label: m[1] as string, lines: [line] });
    else if (blocks.length === 0) pre.push(line);
    else blocks[blocks.length - 1]?.lines.push(line);
  }
  const mine = blocks.filter((b) => b.label === track);
  if (mine.length === 0) return null;
  return [...pre, ...mine.flatMap((b) => b.lines)].join("\n");
}

/** The exercise one part is graded with: its matcher, against its own track of the source (the rule kept). */
export function partExercise(ex: ByEarEx, part: ByEarPart): ByEarEx {
  const ref = ex.reference.solutions.map((s) => trackOnly(s, part.track) ?? s);
  const { parts: _drop, ...byEar } = ex.byEar;
  return {
    ...ex,
    matcher: part.matcher,
    reference: { ...ex.reference, solutions: ref },
    byEar,
    pass: part.pass ?? PART_PASS,
  } as ByEarEx;
}

/** The learner's code as one part is graded: only that track (another track's mistakes are not this part's). */
export function partResponse(code: string, part: ByEarPart): AttemptResponse {
  return { code: trackOnly(code, part.track) ?? code };
}

export const partPass = (part: ByEarPart) => part.pass ?? PART_PASS;

export function partPassed(part: ByEarPart, r: GradeResult | null): boolean {
  return !!r && r.status !== "error" && r.score >= partPass(part) - 1e-9;
}

/** Where each part stands: in order, a part opens when every part before it passed (rung 4 opens all). */
export function partMarks(
  parts: readonly ByEarPart[],
  passed: ReadonlySet<number>,
  rung: number,
): StageMark[] {
  let blocked = false;
  return parts.map((_, i) => {
    if (rung >= 4) return "revealed";
    if (passed.has(i)) return "passed";
    if (!blocked) {
      blocked = true;
      return "open";
    }
    return "locked";
  });
}

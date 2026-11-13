// Staged chord dictation (Wave 4 `dictation.stage-answers`, contracts §2.9 L3, ux §4.5 BassFirstFlow): the bass
// degree under each chord, then each chord's quality, then its numeral, each stage checked before the next opens
// (`stageFlow: "sequential"`, the default) or all at once (`"together"`). The pure half: which widget answers a
// stage, which stages are open, and the response (`answer.stages`, one list per stage, one entry per chord). No
// DOM: tested with `bun test`.
import type { AnswerUi, AttemptResponse, Choice, ChordQuality, DictationStage } from "@oak/api";
import { qualityLabel } from "../keys.ts";
import type { AnswerFeedback, AnswerSpec, AnswerValue } from "../types.ts";

/** What a staged dictation step authors: `DictationEx.stages`, `stageAnswers`, `stageFlow`, `stagePass`. */
export interface StagedSpec {
  stages: readonly DictationStage[];
  stageAnswers: Partial<Record<DictationStage, AnswerUi>>;
  flow?: "sequential" | "together";
  /** The pass mark the host applies to each stage (default 0.8); shown in words, never computed here. */
  pass?: number;
}

/** The learner's answer, one widget value per stage. */
export type StagedValue = Partial<Record<DictationStage, AnswerValue>>;
export type StagedFeedback = Partial<Record<DictationStage, AnswerFeedback>>;
export type StageStatus = "locked" | "open" | "pending" | "passed" | "revealed";

/** How many chords the step asks about: the longest slotted widget among the stages (at least 1). */
export function chordCount(spec: StagedSpec): number {
  let n = 1;
  for (const s of spec.stages) {
    const ui = spec.stageAnswers[s];
    if (!ui) continue;
    if (ui.ui === "degree-pad") n = Math.max(n, ui.sequenceLen ?? 1);
    if (ui.ui === "rn-palette" || ui.ui === "slot-choice") n = Math.max(n, ui.slots);
  }
  return n;
}

/** The quality pad's options as slot options: "maj · major". */
export function qualityOptions(set: readonly ChordQuality[]): Choice[] {
  return set.map((q) => {
    const l = qualityLabel(q);
    return { id: q, label: l.short === l.long ? l.long : `${l.short}: ${l.long}` };
  });
}

/**
 * The widget a stage is answered with. A quality pad answers one chord; with several chords it becomes a slot
 * strip with the same qualities (one per chord), so every stage has one entry per chord.
 */
export function stageWidget(spec: StagedSpec, stage: DictationStage): AnswerSpec | null {
  const ui = spec.stageAnswers[stage];
  if (!ui) return null;
  const n = chordCount(spec);
  if (ui.ui === "quality-pad" && n > 1)
    return { ui: "slot-choice", slots: n, options: qualityOptions(ui.set) };
  return ui;
}

/** A stage's entries as the grader reads them (degrees, quality ids, numerals, choice ids or text). */
export function stageEntries(widget: AnswerSpec, value: AnswerValue | undefined): string[] {
  if (value === undefined || value === null) return [];
  switch (widget.ui) {
    case "text":
      return typeof value === "string" && value.trim() !== "" ? [value.trim()] : [];
    case "degree-pad":
    case "quality-pad":
    case "rn-palette":
    case "slot-choice":
    case "choice":
      return (value as string[]).map((x) => String(x));
    default:
      return [];
  }
}

/** True when a stage's answer can be checked: every chord answered. */
export function stageComplete(spec: StagedSpec, stage: DictationStage, value: StagedValue): boolean {
  const w = stageWidget(spec, stage);
  if (!w) return false;
  const entries = stageEntries(w, value[stage]);
  const need = w.ui === "text" || w.ui === "choice" || w.ui === "quality-pad" ? 1 : chordCount(spec);
  return entries.length >= need && entries.every((e) => e !== "");
}

const done = (f: AnswerFeedback | undefined) => f?.state === "correct" || f?.state === "revealed";

/**
 * Where each stage stands. Sequential: the stages before the first unfinished one are passed or revealed, that
 * one is open, the rest locked (so the bass is always heard first). Together: every unfinished stage is open.
 */
export function stageStatuses(
  spec: StagedSpec,
  feedback: StagedFeedback,
): Record<DictationStage, StageStatus> {
  const out = {} as Record<DictationStage, StageStatus>;
  let blocked = false;
  for (const s of spec.stages) {
    const f = feedback[s];
    if (f?.state === "correct") out[s] = "passed";
    else if (f?.state === "revealed") out[s] = "revealed";
    else if (blocked && (spec.flow ?? "sequential") === "sequential") out[s] = "locked";
    else out[s] = f?.state === "pending" ? "pending" : "open";
    if (!done(f)) blocked = true;
  }
  return out;
}

/** The first stage still to answer, or null when all are passed or revealed. */
export function currentStage(spec: StagedSpec, feedback: StagedFeedback): DictationStage | null {
  return spec.stages.find((s) => !done(feedback[s])) ?? null;
}

/** Every stage's widget value, empty. */
export function emptyStaged(spec: StagedSpec): StagedValue {
  const out: StagedValue = {};
  const n = chordCount(spec);
  for (const s of spec.stages) {
    const w = stageWidget(spec, s);
    if (!w) continue;
    if (w.ui === "text") out[s] = "";
    else if (w.ui === "rn-palette" || w.ui === "slot-choice") out[s] = Array.from({ length: n }, () => "");
    else out[s] = [];
  }
  return out;
}

/**
 * The response for checking `only` one stage (a sequential check), or every stage (`together`, or the final
 * attempt): `{ answer: { stages: { bass: ["1", "5", "6", "4"], … } } }`.
 */
export function stagedResponse(spec: StagedSpec, value: StagedValue, only?: DictationStage): AttemptResponse {
  const stages: Partial<Record<DictationStage, string[]>> = {};
  for (const s of only ? [only] : spec.stages) {
    const w = stageWidget(spec, s);
    if (w) stages[s] = stageEntries(w, value[s]);
  }
  return { answer: { stages } };
}

/** What each stage asks, in the learner's words. */
export const STAGE_TEXT: Readonly<Record<DictationStage, { title: string; ask: string; locked: string }>> = {
  tonic: {
    title: "Home",
    ask: "Which note is home?",
    locked: "Opens after the stage before.",
  },
  bass: {
    title: "Bass",
    ask: "The bass under each chord, as a degree. Listen to the lowest note.",
    locked: "Opens after the stage before.",
  },
  quality: {
    title: "Quality",
    ask: "Each chord's quality, from its sound.",
    locked: "Opens when the bass is right.",
  },
  rn: {
    title: "Numerals",
    ask: "Each chord's Roman numeral: the bass and the quality together.",
    locked: "Opens when the qualities are right.",
  },
  rhythm: { title: "Rhythm", ask: "The rhythm.", locked: "Opens after the stage before." },
  pitch: { title: "Notes", ask: "The notes, as degrees.", locked: "Opens after the stage before." },
};

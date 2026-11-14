// Ladder level L8 (contracts §2.9, §6.12; docs/design/wave6.md §5.4): a full arrangement of a public-domain standard,
// taken down in stages that open in order — the form map, then the bass, then the changes, then the melody — with
// CF-T's marks (`STANDARD_LADDER_PASS` of @oak/grader). Nobody authors an item: it is cut from a repertoire song's
// answer key (`SongDef`), whose `sections` are the form map and whose `phrases` are the sections the code stages are
// checked by, one at a time. A standard is offered only once its key is complete; it is "Being checked" while no human
// has verified it or it has no sections.
import { CF_T_SONG_IDS } from "@oak/api";
import type { Diagnostic, GradeResult, HintRung, SongDef } from "@oak/content-kit";
import {
  type FormMapAnswer,
  gradeFormMap,
  renderFeedback,
  STANDARD_LADDER_PASS,
  STANDARD_LADDER_STAGES,
  type StandardCodeStage,
  type StandardLadderStage,
} from "@oak/grader";
import type { RepertoireMeta } from "../content/types.ts";
import { songVerified } from "./song-ladder.ts";

export const STANDARD_STAGES: readonly StandardLadderStage[] = STANDARD_LADDER_STAGES;
export const CODE_STAGES: readonly StandardCodeStage[] = ["bass", "changes", "melody"];

/** The ids of the standards the pool may hold: CF-T's three, and any repertoire entry listed for L8. */
export function standardIds(repertoire: readonly RepertoireMeta[]): string[] {
  const out: string[] = [...CF_T_SONG_IDS];
  for (const m of repertoire) if (m.ladder === 8 && !out.includes(m.id)) out.push(m.id);
  return out;
}

/** Why a song cannot be cut into an L8 item yet (empty when it can). */
export function standardGaps(song: SongDef | undefined): string[] {
  if (song === undefined) return ["no answer key yet"];
  const gaps: string[] = [];
  for (const l of ["bass", "chords", "melody"] as const)
    if (!song.answerKey.layers[l]) gaps.push(`no ${l} layer`);
  if ((song.answerKey.phrases ?? []).length === 0) gaps.push("no phrases");
  if ((song.answerKey.sections ?? []).length === 0) gaps.push("no sections (the form map)");
  return gaps;
}

/** Why the learner cannot pick a standard now (`ladder.songs` `lockedReason`), or `null`. */
export function standardLock(song: SongDef | undefined, allowUnverified: boolean): string | null {
  if (song === undefined || standardGaps(song).length > 0) return "Being checked";
  if (!allowUnverified && !songVerified(song)) return "Being checked";
  return null;
}

/** How many sections the code stages are checked by. */
export function sectionCount(song: SongDef): number {
  return Math.max(1, (song.answerKey.phrases ?? []).length);
}

/** A check's key: `form`, `bass.2`, `changes.1`, `melody.4`. */
export function standardKey(stage: StandardLadderStage, section: number | null): string {
  return stage === "form" || section === null ? stage : `${stage}.${section}`;
}

/** Every check of an item, in the order the stages open. */
export function standardKeys(song: SongDef): string[] {
  const n = sectionCount(song);
  return [
    "form",
    ...CODE_STAGES.flatMap((st) => Array.from({ length: n }, (_, i) => standardKey(st, i + 1))),
  ];
}

/** The keys a stored version answers: its stage, and its section or (with no section named) every section. */
export function versionKeys(
  song: SongDef,
  v: { stage?: string | null | undefined; phrase?: number | null | undefined },
): string[] {
  if (v.stage === "form") return ["form"];
  if (v.stage !== "bass" && v.stage !== "changes" && v.stage !== "melody") return [];
  if (v.phrase != null) return [standardKey(v.stage, v.phrase)];
  return Array.from({ length: sectionCount(song) }, (_, i) =>
    standardKey(v.stage as StandardCodeStage, i + 1),
  );
}

/**
 * The form map as a `GradeResult` (the form stage has no code to run): the score is the share of sections right, one
 * diagnostic per wrong section with the bar it is about (`where.bar`), messages from the feedback catalog.
 */
export function formMapResult(
  song: SongDef,
  answer: FormMapAnswer,
  ctx: { exerciseId: string; attemptNo: number; rung: HintRung },
): GradeResult {
  const r = gradeFormMap(answer, song, STANDARD_LADDER_PASS.form);
  const diagnostics: Diagnostic[] = [];
  const words = (labels: readonly string[]) => labels.join(" ");
  for (const row of r.sections) {
    if (!row.startOk)
      diagnostics.push({
        id: "form.map-start" as Diagnostic["id"],
        severity: "error",
        dim: "order",
        where: { bar: row.expected.bar, slot: row.index + 1 },
        params: { bar: row.expected.bar },
      });
    else if (!row.labelOk)
      diagnostics.push({
        id: "form.section" as Diagnostic["id"],
        severity: "error",
        dim: "order",
        where: { bar: row.expected.bar, slot: row.index + 1 },
        params: { exp: words(r.expected.split("")), got: words(r.got.split("")) },
      });
  }
  for (const bar of r.extra)
    diagnostics.push({
      id: "form.map-extra" as Diagnostic["id"],
      severity: "error",
      dim: "order",
      where: { bar },
      params: { bar },
    });
  const revealed = ctx.rung >= 4;
  const messages = diagnostics.slice(0, 3).map((d) => {
    let text: string;
    try {
      text = renderFeedback(d);
    } catch {
      text =
        d.id === "form.map-extra"
          ? `No section starts at bar ${d.params.bar}.`
          : d.id === "form.map-start"
            ? `A section starts at bar ${d.params.bar}.`
            : "A section here has another label.";
    }
    return { id: d.id, text, ...(d.where === undefined ? {} : { where: d.where }) };
  });
  return {
    exerciseId: ctx.exerciseId,
    exerciseVersion: 1,
    attemptNo: ctx.attemptNo,
    firstAttempt: ctx.attemptNo === 1,
    mode: "capstone",
    status: r.passed ? "pass" : "fail",
    score: r.score,
    adjustedScore: revealed ? 0 : r.score,
    dims: { order: { score: r.score, weight: 1, n: r.sections.length } },
    constraints: [],
    diagnostics,
    messages,
    assist: { rung: ctx.rung, tutorHints: 0, extraReplays: 0, revealed },
  };
}

// Wave 6 seam (docs/design/wave6.md §3.2): ladder level L8 and CF-T (contracts §2.9, §6.6 "CF-T Standard
// Transcription"): a full arrangement of a public-domain standard, taken down in stages — the form map, then the
// bass, then the changes, then the melody (CF-T's sessions: S1 form map and bass, S2 changes, S3 melody; S4 arranges
// and releases). The form map is an answer (no code): where each section starts and what it is called, compared by
// shape. The other three reuse the L6 machinery (`songLadderRequest`, the X1 phrase window) with CF-T's marks:
// bass ≥ 0.90, changes ≥ 0.85 with a wrong quality earning nothing for its bar (d11), melody ≥ 0.90.
// L7 is the learner's own audio: self-assessed (`OWN_AUDIO_CHECKLIST` of `@oak/api`), never graded here.
import type { GradeResult, Matcher, PhraseCheck, SongDef } from "@oak/content-kit";
import { formLetters } from "@oak/content-kit";
import type { GradeRequest } from "../types.ts";
import { phraseCheckRequest } from "./phrase-check.ts";
import { SONG_LADDER_MATCHERS, type SongLadderGradeRequest } from "./song-ladder.ts";

/** L8 and CF-T stages, in the order they open. */
export const STANDARD_LADDER_STAGES = ["form", "bass", "changes", "melody"] as const;
export type StandardLadderStage = (typeof STANDARD_LADDER_STAGES)[number];
/** The stages graded on code (every one but the form map). */
export type StandardCodeStage = Exclude<StandardLadderStage, "form">;

/** Pass marks (contracts §6.6 CF-T): the form map correct, bass 0.90 (as X2), changes 0.85 per bar, melody 0.90. */
export const STANDARD_LADDER_PASS: Readonly<Record<StandardLadderStage, number>> = {
  form: 1,
  bass: 0.9,
  changes: 0.85,
  melody: 0.9,
};

/**
 * The matchers. The changes are read by numeral at seventh depth, one bar at a time, and a right root with the
 * wrong quality earns nothing for its bar (`wrongQuality: "none"`, decision d11: a standard's sevenths are the
 * point; match/harmony.ts).
 */
export const STANDARD_LADDER_MATCHERS: Readonly<Record<StandardCodeStage, Matcher>> = {
  bass: SONG_LADDER_MATCHERS.bass,
  changes: {
    m: "harmony",
    level: "rn",
    qualityDepth: "seventh",
    inversion: false,
    harmonicRhythm: "given",
    weights: { bass: 0 },
    wrongQuality: "none",
  },
  melody: SONG_LADDER_MATCHERS.melody,
};

/** One L8 item: a standard from the pool, one stage at a time. */
export interface StandardLadderItem {
  /** `lad.8.<songId>`: the exercise ID. */
  itemId: string;
  level: 8;
  stage: StandardLadderStage;
  /** Code stages: the 1-based phrases checked together (default: the whole tune, as its answer key lists them). */
  phrase?: number | [number, number];
}

/** A code stage as an X1-style phrase check over the whole tune (or the phrases given). */
export function standardLadderCheck(
  item: StandardLadderItem & { stage: StandardCodeStage },
  song: Pick<SongDef, "answerKey">,
): PhraseCheck {
  const phrases = song.answerKey.phrases?.length ?? 1;
  return {
    id: `${item.itemId}.${item.stage}`,
    phrase: item.phrase ?? [1, phrases],
    layer: item.stage === "changes" ? "chords" : item.stage,
    matcher: STANDARD_LADDER_MATCHERS[item.stage],
    pass: STANDARD_LADDER_PASS[item.stage],
  };
}

/** The stage that opens next after `passed` (in order), `null` once all four passed. */
export function nextStandardStage(passed: readonly StandardLadderStage[]): StandardLadderStage | null {
  return STANDARD_LADDER_STAGES.find((s) => !passed.includes(s)) ?? null;
}
/** A graded pass of a code stage: status pass at its mark, not revealed. */
export function standardLadderPassed(stage: StandardCodeStage, result: GradeResult): boolean {
  return result.status === "pass" && result.score >= STANDARD_LADDER_PASS[stage] && !result.assist.revealed;
}

export interface StandardLadderGradeRequest {
  item: StandardLadderItem & { stage: StandardCodeStage };
  song: SongDef;
  /** The learner's whole transcription code. */
  code: string;
  ctx: SongLadderGradeRequest["ctx"];
}
/** The `GradeRequest` of a code stage, in capstone mode (a standard is 32 bars). The form stage is `gradeFormMap`. */
export function standardLadderRequest(req: StandardLadderGradeRequest): GradeRequest {
  const base = phraseCheckRequest({
    capstoneId: "ladder-8",
    check: standardLadderCheck(req.item, req.song),
    song: req.song,
    code: req.code,
    ctx: req.ctx,
  });
  return {
    ...base,
    // d12: L8 is in the recording's key, as L5 and L6 are.
    ctx: { ...base.ctx, exerciseGlobalId: `ladder/${req.item.itemId}`, mode: "capstone", requireKey: true },
  };
}

// --- the form map -------------------------------------------------------------------------------------------

/** What the learner answers (the `form` widget in `input: "map"`): a label per section and the bar each starts on. */
export interface FormMapAnswer {
  sections: readonly string[];
  /** 1-based first bar of each section, in order. */
  bars: readonly number[];
}
export interface FormMapSection {
  /** 0-based index in the answer key. */
  index: number;
  expected: { label: string; bar: number; bars: [number, number] };
  /** The learner's section that starts on the same bar, if any. */
  got: { label: string; bar: number } | null;
  startOk: boolean;
  /** The label is right by shape: the same letter by first appearance, among the sections that start right. */
  labelOk: boolean;
  ok: boolean;
}
export interface FormMapResult {
  /** Sections right (start and label) out of the larger of the two section counts. */
  score: number;
  passed: boolean;
  /** The two forms as letters by first appearance: "AABA". */
  expected: string;
  got: string;
  sections: FormMapSection[];
  /** Sections the learner marked where the tune has none (1-based bars). */
  extra: number[];
}

/** The answer key of a song's form map, or `null` when the song has none (`SongDef.answerKey.sections`). */
export function formMapKey(
  song: Pick<SongDef, "answerKey">,
): { labels: string[]; bars: number[]; letters: string } | null {
  const sections = song.answerKey.sections;
  if (!sections || sections.length === 0) return null;
  const labels = sections.map((s) => s.label);
  return { labels, bars: sections.map((s) => s.bars[0]), letters: formLetters(labels) };
}

/**
 * The song's form as the `form` rule's `@song` pattern reads it (CF-T.S4: "the arrangement keeps the song's
 * sections"): pass it as `GradeContext.songForm` when grading the session's rubric. `null`: the song has none.
 */
export function songFormOf(
  song: Pick<SongDef, "answerKey">,
): { label: string; bars: number; chords?: string[][] }[] | null {
  const sections = song.answerKey.sections;
  if (!sections || sections.length === 0) return null;
  // Corrections pass (CF-T.S4 "the arrangement keeps the song"): each section also carries the song's chords, bar
  // by bar (the lead-sheet symbols of `answerKey.chords`, in order), for the `song-kept` rule.
  const chart = song.answerKey.chords ?? [];
  return sections.map((s) => {
    const bars = s.bars[1] - s.bars[0] + 1;
    const chords = Array.from({ length: bars }, (_, i) =>
      chart
        .filter((c) => c.bar === s.bars[0] + i)
        .sort((a, b) => a.beat - b.beat)
        .map((c) => c.symbol),
    );
    return { label: s.label, bars, ...(chart.length > 0 ? { chords } : {}) };
  });
}

/**
 * Grades a form map (contracts §6.6 CF-T "form map correct"): a section counts when it starts on the right bar and
 * carries the right label by shape, so `A A B A`, `verse verse bridge verse` and `X X Y X` are the same answer. A
 * section in the wrong place costs its own credit and, as an extra section, lowers the score through the count.
 */
export function gradeFormMap(
  answer: FormMapAnswer,
  song: Pick<SongDef, "answerKey">,
  pass: number = STANDARD_LADDER_PASS.form,
): FormMapResult {
  const key = formMapKey(song);
  if (!key) throw new RangeError("@oak/grader: the song has no form map (answerKey.sections)");
  const sections = song.answerKey.sections ?? [];
  const n = Math.min(answer.sections.length, answer.bars.length);
  const given = Array.from({ length: n }, (_, i) => ({
    label: answer.sections[i] as string,
    bar: answer.bars[i] as number,
  }));
  const expected = key.letters;
  const got = formLetters(given.map((g) => g.label));
  // Compare shapes on the sections both sides have: letters by first appearance over the aligned starts only, so
  // one missing boundary does not rename every later section.
  const aligned = sections.flatMap((s, index) => {
    const hit = given.find((g) => g.bar === s.bars[0]);
    return hit ? [{ index, label: s.label, got: hit.label }] : [];
  });
  const wantShape = formLetters(aligned.map((a) => a.label));
  const gotShape = formLetters(aligned.map((a) => a.got));
  const rows: FormMapSection[] = sections.map((s, index) => {
    const hit = given.find((g) => g.bar === s.bars[0]) ?? null;
    const at = aligned.findIndex((a) => a.index === index);
    const labelOk = at >= 0 && wantShape[at] === gotShape[at];
    return {
      index,
      expected: { label: s.label, bar: s.bars[0], bars: s.bars },
      got: hit,
      startOk: hit !== null,
      labelOk,
      ok: hit !== null && labelOk,
    };
  });
  const starts = new Set(key.bars);
  const extra = given.filter((g) => !starts.has(g.bar)).map((g) => g.bar);
  const right = rows.filter((r) => r.ok).length;
  const score = right / Math.max(sections.length, given.length, 1);
  return { score, passed: score >= pass - 1e-9, expected, got, sections: rows, extra };
}

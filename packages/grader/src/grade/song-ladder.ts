// Wave 5 seam (docs/design/wave5.md §3.2): ladder levels L5 and L6 (contracts §2.9, §6.4, §6.6 X2, §6.12). Both
// are songs from the repertoire pool, not generated: L5 is public-domain folk graded per phrase (melody,
// key-relative, ≥ 0.85, lesson mode); L6 is blues and standards ≤ 1930 graded in stages — the bass, then the
// changes, then the melody (X2's order and marks: 0.90, 0.85, 0.85; capstone mode). Both reuse the X1 phrase
// machinery (`phraseWindow`, `phraseReference`, `phraseCheckRequest`), so a gym L5 item and an X1 phrase grade alike.
import type { GradeResult, Matcher, PhraseCheck, SongDef } from "@oak/content-kit";
import type { GradeContext, GradeRequest } from "../types.ts";
import { LADDER_MATCHERS } from "./ladder.ts";
import { phraseCheckRequest } from "./phrase-check.ts";

export type SongLadderLevel = 5 | 6;
/** L6 stages, in the order they open (contracts §6.6 X2: "stages in that order"). */
export const SONG_LADDER_STAGES = ["bass", "changes", "melody"] as const;
export type SongLadderStage = (typeof SONG_LADDER_STAGES)[number];

/** Pass marks: L5 per phrase; L6 per stage (X2's marks, which the gym L6 shares). */
export const SONG_LADDER_PASS: { readonly 5: number; readonly 6: Readonly<Record<SongLadderStage, number>> } =
  {
    5: 0.85,
    6: { bass: 0.9, changes: 0.85, melody: 0.85 },
  };

/**
 * The matchers: the melody key-relative (as X1); the bass as L3's bass stage; the changes by numeral on the triad
 * core, on the chords alone (`weights.bass` 0): the bass has its own check before them, so a right bass under a
 * wrong chord earns nothing for the chord (a wrong last line of a 12-bar blues fails, Wave 5 integration).
 */
export const SONG_LADDER_MATCHERS: Readonly<Record<"melody" | SongLadderStage, Matcher>> = {
  melody: {
    m: "melody",
    pitch: "key-relative",
    wPitch: 0.6,
    wRhythm: 0.4,
    rhythmTol: [1, 32],
    track: "@melody",
  },
  bass: LADDER_MATCHERS[3].bass,
  changes: {
    m: "harmony",
    level: "rn",
    qualityDepth: "triad",
    inversion: false,
    harmonicRhythm: "given",
    weights: { bass: 0 },
  },
};

/** One song item of the ladder. The hidden reference is the song's answer key (server side only). */
export interface SongLadderItem {
  /** `lad.5.<songId>.<phrase>` / `lad.6.<songId>`: the exercise ID. */
  itemId: string;
  level: SongLadderLevel;
  /** 1-based phrase of `SongDef.answerKey.phrases`, or `[from, to]` (L6: the strain). */
  phrase: number | [number, number];
  /** L6 only: the stage this submission answers. */
  stage?: SongLadderStage;
}

/** The item as an X1-style phrase check. */
export function songLadderCheck(item: SongLadderItem): PhraseCheck {
  if (item.level === 5)
    return {
      id: item.itemId,
      phrase: item.phrase,
      layer: "melody",
      matcher: SONG_LADDER_MATCHERS.melody,
      pass: SONG_LADDER_PASS[5],
    };
  const stage = item.stage ?? "bass";
  const layer = stage === "changes" ? "chords" : stage;
  return {
    id: `${item.itemId}.${stage}`,
    phrase: item.phrase,
    layer,
    matcher: SONG_LADDER_MATCHERS[stage],
    pass: SONG_LADDER_PASS[6][stage],
  };
}

export interface SongLadderGradeRequest {
  item: SongLadderItem;
  song: SongDef;
  /** The learner's whole transcription code. */
  code: string;
  ctx: Omit<
    GradeContext,
    "mode" | "key" | "meter" | "bpm" | "pickup" | "swing" | "exerciseGlobalId" | "window"
  >;
}

/** The `GradeRequest` of a song item: L5 in lesson mode (contracts §6.4 "gym L1–L5"), L6 in capstone mode. */
export function songLadderRequest(req: SongLadderGradeRequest): GradeRequest {
  const base = phraseCheckRequest({
    capstoneId: `ladder-${req.item.level}`,
    check: songLadderCheck(req.item),
    song: req.song,
    code: req.code,
    ctx: req.ctx,
  });
  return {
    ...base,
    ctx: {
      ...base.ctx,
      exerciseGlobalId: `ladder/${req.item.itemId}`,
      mode: req.item.level === 5 ? "lesson" : "capstone",
    },
  };
}

/** The stage that opens next after `passed` (in order), `null` once all three passed. */
export function nextSongStage(passed: readonly SongLadderStage[]): SongLadderStage | null {
  return SONG_LADDER_STAGES.find((s) => !passed.includes(s)) ?? null;
}

/** A graded pass of one phrase (L5) or one stage (L6): status pass at its mark, not revealed. */
export function songLadderPassed(item: SongLadderItem, result: GradeResult): boolean {
  const mark = item.level === 5 ? SONG_LADDER_PASS[5] : SONG_LADDER_PASS[6][item.stage ?? "bass"];
  return result.status === "pass" && result.score >= mark && !result.assist.revealed;
}

// X1 (and every transcribe capstone whose learner picks a song): one phrase check graded against the chosen
// song's answer key (contracts §2.4, §6.6 X1; content-kit `PhraseCheck`). The learner's draft is the whole
// transcription so far; only the phrase's window is compared. A melody check compares key-relative at 0.85;
// a chord check is staged bass → quality → numerals at 0.80 each (the L3 stage matchers, the numerals with
// the check's own matcher). Meter, key, tonic and pickup are given: they come from the song, not the code.
import type { ExerciseOf, GradeResult, Matcher, PhraseCheck, Rat, SongDef } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { METERS, tempoLine } from "@oak/theory";
import type { GradeContext, GradeRequest } from "../types.ts";
import { LADDER_MATCHERS, type LadderStage } from "./ladder.ts";

/** Pass mark of a phrase's melody (contracts §6.6 X1) and of each chord stage. */
export const PHRASE_PASS = 0.85;
export const PHRASE_STAGE_PASS = 0.8;

const LABEL = { melody: "mel", bass: "bass", chords: "chords" } as const;

/**
 * The cycles a phrase spans. Bars are numbered as the song's lead sheet numbers them (contracts §6.11: with a
 * pickup, cycle 0 is the pickup bar and bar 1 is cycle 1). A phrase begins with its pickup and ends where
 * the next phrase's pickup starts, so with a pickup of `p` (a fraction of a bar) the window is
 * `[start(from) − p, start(to + 1) − p)`.
 */
export function phraseWindow(
  song: Pick<SongDef, "meter" | "pickup" | "answerKey">,
  phrase: number | [number, number],
): { from: Rat; to: Rat; bars: [number, number] } {
  const phrases = song.answerKey.phrases ?? [];
  const [a, b] = Array.isArray(phrase) ? phrase : [phrase, phrase];
  const first = phrases[a - 1];
  const last = phrases[b - 1];
  if (!first || !last) throw new RangeError(`@oak/grader: the answer key has no phrase ${!first ? a : b}`);
  const p = song.pickup ? R.div(song.pickup.units, rat(METERS[song.meter].unitsPerBar)) : rat(0);
  const cycle = (bar: number): Rat => rat(song.pickup ? bar : bar - 1);
  const from = R.max(rat(0), R.sub(cycle(first[0]), p));
  const to = R.sub(cycle(last[1] + 1), p);
  return { from, to, bars: [first[0], last[1]] };
}

/** The reference code of a check: the song's tempo line and the layers the check (or stage) reads. */
export function phraseReference(
  song: Pick<SongDef, "bpm" | "meter" | "answerKey">,
  layer: PhraseCheck["layer"],
  stage?: LadderStage,
): string {
  const l = song.answerKey.layers;
  const tracks =
    layer === "chords"
      ? stage === "bass"
        ? (["bass"] as const)
        : (["bass", "chords"] as const)
      : ([layer] as const);
  const lines = tracks.map((t) => {
    const code = l[t];
    if (!code) throw new Error(`@oak/grader: the answer key has no ${t} layer`);
    return `${LABEL[t]}: ${code}`;
  });
  return `${tempoLine(song.bpm, song.meter)}\n\n${lines.join("\n")}`;
}

/** The answer key's own labels, read as the role they play. */
const ROLE_OF: Readonly<Record<string, string>> = { mel: "@melody", bass: "@bass", chords: "@chords" };

/**
 * A check names the answer key's labels (`mel`), but the draft is the learner's own code: a tune labelled
 * `melody:` or `lead:` is the same transcription and must not score 0 as "no line". Track references that are
 * answer-key labels are read by role (contracts §6.2) on both sides, as the ladder's matchers are.
 */
export function byRole(m: Matcher): Matcher {
  switch (m.m) {
    case "all":
      return { ...m, of: m.of.map(byRole) };
    case "melody":
      return m.track !== undefined && ROLE_OF[m.track] ? { ...m, track: ROLE_OF[m.track] as string } : m;
    case "events":
    case "rhythm":
    case "pcset":
      return m.tracks ? { ...m, tracks: m.tracks.map((t) => ROLE_OF[t] ?? t) } : m;
    default:
      return m;
  }
}

/** The matcher of a check or of one stage of a chord check (bass first, then quality, then numerals). */
export function phraseMatcher(check: PhraseCheck, stage?: LadderStage): Matcher {
  if (check.layer !== "chords" || !check.stages || !stage) return byRole(check.matcher);
  if (stage === "rn") return byRole(check.matcher);
  return LADDER_MATCHERS[3][stage];
}

/** The check (or one stage of it) as a transcribe step graded by the normal pipeline. */
export function phraseCheckExercise(
  check: PhraseCheck,
  song: SongDef,
  o: { capstoneId?: string; stage?: LadderStage } = {},
): ExerciseOf<"transcribe-step"> {
  const w = phraseWindow(song, check.phrase);
  const bars = Math.ceil(w.to[0] / w.to[1]);
  const reference = phraseReference(song, check.layer, o.stage);
  const staged = check.layer === "chords" && !!check.stages && !!o.stage;
  return {
    kind: "transcribe-step",
    id: o.stage ? `${check.id}.${o.stage}` : check.id,
    version: 1,
    prompt: "",
    skills: [],
    role: "check",
    hints: null,
    tests: [],
    key: song.key,
    meter: song.meter,
    bpm: song.bpm,
    ...(song.pickup ? { pickup: song.pickup } : {}),
    ...(song.swing ? { swing: song.swing } : {}),
    pass: staged ? (check.pass ?? PHRASE_STAGE_PASS) : (check.pass ?? PHRASE_PASS),
    projectId: o.capstoneId ?? song.id,
    ladder: 5,
    stimulus: { src: "code", code: reference, bars, loop: true, showCode: false },
    layer: check.layer,
    bars: w.bars,
    grading: {
      mode: "auto",
      reference: { solutions: [reference], bars },
      matcher: phraseMatcher(check, o.stage),
    },
    studio: { minRate: 0.25, transposeSemis: true, overlay: true },
    ...(check.given ? { given: check.given } : {}),
  };
}

export interface PhraseCheckGradeRequest {
  /** "X1". */
  capstoneId: string;
  check: PhraseCheck;
  /** The song the learner picked (its answer key is the reference). */
  song: SongDef;
  /** The learner's whole draft. */
  code: string;
  /** Chord checks: the stage being checked (bass first). */
  stage?: LadderStage;
  ctx: Omit<
    GradeContext,
    "mode" | "key" | "meter" | "bpm" | "pickup" | "swing" | "exerciseGlobalId" | "window"
  >;
}

/** The `GradeRequest` of a phrase check: capstone mode, the phrase's window, the song's key, meter and pickup. */
export function phraseCheckRequest(req: PhraseCheckGradeRequest): GradeRequest {
  const ex = phraseCheckExercise(req.check, req.song, {
    capstoneId: req.capstoneId,
    ...(req.stage ? { stage: req.stage } : {}),
  });
  const w = phraseWindow(req.song, req.check.phrase);
  return {
    exercise: ex,
    response: { code: req.code },
    ctx: {
      ...req.ctx,
      exerciseGlobalId: `${req.capstoneId}/${ex.id}`,
      mode: "capstone",
      key: req.song.key,
      meter: req.song.meter,
      bpm: req.song.bpm,
      ...(req.song.pickup ? { pickup: req.song.pickup } : {}),
      ...(req.song.swing ? { swing: req.song.swing } : {}),
      // Corrections pass: CF-T transcribes a standard against its recording, as ladder L8 does: a tune moved to
      // another key fails (`melody.wrong-key`), an octave lower or higher still passes. X1 (folk songs, sung in
      // any key) keeps the `melody.transposed` note.
      ...(IN_KEY_CAPSTONES.has(req.capstoneId) ? { requireKey: true } : {}),
      window: { from: w.from, to: w.to },
    },
  };
}
/** Capstones whose transcriptions must be in the recording's key (d12, as ladder L5, L6 and L8). */
const IN_KEY_CAPSTONES: ReadonlySet<string> = new Set(["CF-T"]);

/** A check (or stage) that counts: passed at its mark and not revealed (a revealed check earns no evidence). */
export function phraseCheckPassed(result: GradeResult): boolean {
  return result.status === "pass" && !result.assist.revealed;
}

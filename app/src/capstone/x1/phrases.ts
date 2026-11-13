// X1's phrase checks (contracts §6.6 X1, wave4.md §5.1): one row per `PhraseCheck` of a session, and per stage of
// a staged chords check (bass → quality → numerals, each open only after the one before passed or was revealed).
// The server's `CapstoneCheckState` rows win; checks graded here before the server stored them are merged in
// (best score, passed or revealed once stays so). Pure.
import type { CapstoneCheckState, GradeResult, PhraseCheck, SongDef } from "@oak/api";
import { phraseWindow } from "@oak/grader";
import { displayRN, METERS, parseChordSymbol, romanOf, tempoLine, toLeadSheet } from "@oak/theory";

export type Stage = "bass" | "quality" | "rn";

export interface LocalCheck {
  score: number | null;
  passed: boolean;
  revealed: boolean;
  attempts: number;
}

export interface CheckRow extends LocalCheck {
  /** `phrase-1`, or `chords.bass` for a stage. */
  key: string;
  checkId: string;
  phrase: number | [number, number];
  layer: PhraseCheck["layer"];
  stage: Stage | null;
  open: boolean;
  pass: number;
}

export const rowKey = (checkId: string, stage: Stage | null): string =>
  stage ? `${checkId}.${stage}` : checkId;

const settled = (c: Pick<LocalCheck, "passed" | "revealed">) => c.passed || c.revealed;

function best(a: LocalCheck | undefined, b: LocalCheck | undefined): LocalCheck {
  const score =
    a?.score === null || a?.score === undefined
      ? (b?.score ?? null)
      : b?.score === null || b?.score === undefined
        ? a.score
        : Math.max(a.score, b.score);
  return {
    score,
    passed: (a?.passed ?? false) || (b?.passed ?? false),
    revealed: (a?.revealed ?? false) || (b?.revealed ?? false),
    attempts: Math.max(a?.attempts ?? 0, b?.attempts ?? 0),
  };
}

/** The rows of a session's checks, in content order, stages in order. */
export function checkRows(
  checks: readonly PhraseCheck[],
  server: readonly CapstoneCheckState[],
  local: Readonly<Record<string, LocalCheck>>,
): CheckRow[] {
  const fromServer = new Map(server.map((s) => [rowKey(s.checkId, s.stage), s] as const));
  const rows: CheckRow[] = [];
  for (const c of checks) {
    const stages: (Stage | null)[] = c.layer === "chords" && c.stages?.length ? c.stages : [null];
    let prevSettled = true;
    for (const stage of stages) {
      const key = rowKey(c.id, stage);
      const s = fromServer.get(key);
      const merged = best(
        s ? { score: s.score, passed: s.passed, revealed: s.revealed, attempts: s.attempts } : undefined,
        local[key],
      );
      const open = stage === null ? true : prevSettled || (s?.open ?? false);
      rows.push({
        key,
        checkId: c.id,
        phrase: c.phrase,
        layer: c.layer,
        stage,
        open,
        pass: c.pass,
        ...merged,
      });
      prevSettled = settled(merged);
    }
  }
  return rows;
}

/** Folds one graded result into the local record of a row. */
export function applyResult(prev: LocalCheck | undefined, result: GradeResult, passed: boolean): LocalCheck {
  const revealed = result.assist.revealed;
  return best(prev, {
    score: result.status === "error" ? (prev?.score ?? null) : result.score,
    passed: passed && !revealed,
    revealed,
    attempts: (prev?.attempts ?? 0) + 1,
  });
}

/** Every check of the session passed or revealed (and there is at least one). */
export function sessionComplete(rows: readonly CheckRow[]): boolean {
  return rows.length > 0 && rows.every(settled);
}

export function phraseText(phrase: number | [number, number]): string {
  if (typeof phrase === "number") return `Phrase ${phrase}`;
  return phrase[0] === phrase[1] ? `Phrase ${phrase[0]}` : `Phrases ${phrase[0]}–${phrase[1]}`;
}

export const STAGE_WORD: Record<Stage, string> = {
  bass: "the bass",
  quality: "chord qualities",
  rn: "Roman numerals",
};
const LAYER_WORD: Record<PhraseCheck["layer"], string> = { melody: "melody", bass: "bass", chords: "chords" };

/** "Phrase 2 · melody", "Phrases 1–4 · chords: the bass". */
export function rowLabel(r: Pick<CheckRow, "phrase" | "layer" | "stage">): string {
  return `${phraseText(r.phrase)} · ${LAYER_WORD[r.layer]}${r.stage ? `: ${STAGE_WORD[r.stage]}` : ""}`;
}

/** What was revealed rather than heard, for the liner notes ("phrase 2", "the chords' Roman numerals"). */
export function revealedItems(rows: readonly CheckRow[]): string[] {
  return rows
    .filter((r) => r.revealed && !r.passed)
    .map((r) =>
      r.stage
        ? `${STAGE_WORD[r.stage]} of ${phraseText(r.phrase).toLowerCase()}`
        : phraseText(r.phrase).toLowerCase(),
    );
}

/** The bars (0-based cycles, pickup bar = cycle 0) to loop for a phrase: its window, widened to whole bars. */
export function phraseLoop(
  song: Pick<SongDef, "meter" | "pickup" | "answerKey">,
  phrase: number | [number, number],
): { fromBar: number; bars: number } | null {
  try {
    const w = phraseWindow(song, phrase);
    const from = Math.floor(w.from[0] / w.from[1]);
    const to = Math.ceil(w.to[0] / w.to[1]);
    return { fromBar: from, bars: Math.max(1, to - from) };
  } catch {
    return null;
  }
}

/** Cycles the source plays: the answer key's bars, plus the pickup bar when there is one. */
export function songCycles(song: Pick<SongDef, "pickup" | "answerKey">): number {
  return song.answerKey.bars + (song.pickup ? 1 : 0);
}

/** "4/4 · C major · tonic C · pickup of 1 beat": what X1 tells the learner first (contracts §6.6 X1). */
export function givenLines(
  song: Pick<SongDef, "meter" | "key" | "pickup" | "bpm">,
): { label: string; value: string }[] {
  const out = [
    { label: "Meter", value: song.meter },
    { label: "Key", value: `${song.key.tonic} ${song.key.mode}` },
    { label: "Tonic (1)", value: song.key.tonic },
    { label: "Tempo", value: `${song.bpm} BPM` },
  ];
  if (song.pickup) {
    const units = song.pickup.units[0] / song.pickup.units[1];
    const per = METERS[song.meter].unitsPerBar;
    const beats = units;
    out.push({
      label: "Pickup",
      value: `${beats === 1 ? "1 beat" : `${beats} beats`} before bar 1 (bar 0, from beat ${per - beats + 1})`,
    });
  } else out.push({ label: "Pickup", value: "none: the tune starts on beat 1 of bar 1" });
  return out;
}

/**
 * The code a transcription starts from: the song's tempo line and an empty melody line in its key (degrees,
 * the learner's `n()` language). With a pickup the first cycle is bar 0.
 */
export function x1Starter(
  song: Pick<SongDef, "bpm" | "meter" | "key" | "pickup" | "answerKey" | "title">,
): string {
  const bars = songCycles(song);
  const rests = Array.from({ length: bars }, () => "~").join(" ");
  return [
    tempoLine(song.bpm, song.meter),
    "",
    `// ${song.title}: one cycle a bar${song.pickup ? " (the first cycle is the pickup bar)" : ""}`,
    `mel: n("<${rests}>").scale("${song.key.tonic}4:${song.key.mode}").s("piano")`,
  ].join("\n");
}

/**
 * The answer key's chords over a phrase range, for a revealed chords stage: each change with its lead-sheet symbol
 * and its numeral in the song's key (from `@oak/theory`, never a local table).
 */
export function chordAnswer(
  song: Pick<SongDef, "key" | "answerKey">,
  phrase: number | [number, number],
): { bar: number; beat: number; symbol: string; rn: string | null }[] {
  const phrases = song.answerKey.phrases ?? [];
  const [a, b] = typeof phrase === "number" ? [phrase, phrase] : phrase;
  const from = phrases[a - 1]?.[0] ?? 1;
  const to = phrases[b - 1]?.[1] ?? song.answerKey.bars;
  return (song.answerKey.chords ?? [])
    .filter((c) => c.bar >= from && c.bar <= to)
    .map((c) => {
      const chord = parseChordSymbol(c.symbol);
      return {
        bar: c.bar,
        beat: c.beat,
        symbol: chord ? toLeadSheet(chord) : c.symbol,
        rn: chord ? displayRN(romanOf(chord, song.key)) : null,
      };
    });
}

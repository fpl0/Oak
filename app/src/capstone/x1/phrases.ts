// X1's phrase checks (contracts §6.6 X1, wave4.md §5.1): one row per `PhraseCheck` of a session, and per stage of
// a staged chords check (bass → quality → numerals, each open only after the one before passed or was revealed).
// The server's `CapstoneCheckState` rows win; checks graded here before the server stored them are merged in
// (best score, passed or revealed once stays so). Pure.
import type { CapstoneCheckState, GradeResult, PhraseCheck, SongDef } from "@oak/api";
import { phraseWindow } from "@oak/grader";
import { displayRN, METERS, parseChordSymbol, romanOf, tempoLine, toLeadSheet } from "@oak/theory";
import { lineSpans, type SongGiven, songStarter } from "../../transcribe/song.ts";

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
  /**
   * Wave 5 (`PhraseCheck.after`, X2's bass → changes → melody): what this row waits for while it is closed ("the
   * bass"), `null` when open or when it only waits for the stage before it.
   */
  waitsFor: string | null;
}

/** Whether each check of a capstone is settled (every stage passed or revealed), and its name for "Opens after". */
export type SettledChecks = ReadonlyMap<string, { settled: boolean; name: string }>;

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
  /** Checks of earlier sessions (for `after` across sessions: X2's melody waits for S1's changes). */
  earlier: SettledChecks = new Map(),
): CheckRow[] {
  const fromServer = new Map(server.map((s) => [rowKey(s.checkId, s.stage), s] as const));
  const known = new Map(earlier);
  const rows: CheckRow[] = [];
  for (const c of checks) {
    const stages: (Stage | null)[] = c.layer === "chords" && c.stages?.length ? c.stages : [null];
    // `after`: every named check settled first (contracts §6.6 X2 "stages in that order").
    const waiting = (c.after ?? []).find((id) => !(known.get(id)?.settled ?? false));
    const waitsFor = waiting === undefined ? null : (known.get(waiting)?.name ?? waiting);
    let prevSettled = true;
    let all = true;
    for (const stage of stages) {
      const key = rowKey(c.id, stage);
      const s = fromServer.get(key);
      const merged = best(
        s ? { score: s.score, passed: s.passed, revealed: s.revealed, attempts: s.attempts } : undefined,
        local[key],
      );
      const stageOpen = stage === null ? true : prevSettled || (s?.open ?? false);
      rows.push({
        key,
        checkId: c.id,
        phrase: c.phrase,
        layer: c.layer,
        stage,
        open: stageOpen && waitsFor === null,
        pass: c.pass,
        waitsFor,
        ...merged,
      });
      prevSettled = settled(merged);
      all &&= prevSettled;
    }
    known.set(c.id, { settled: all, name: checkName(c) });
  }
  return rows;
}

/** The rows of every session in order, each knowing the checks before it (`after` across sessions). */
export function capstoneRows(
  sessions: readonly { checks: readonly PhraseCheck[]; server: readonly CapstoneCheckState[] }[],
  local: Readonly<Record<string, LocalCheck>>,
): CheckRow[][] {
  const known = new Map<string, { settled: boolean; name: string }>();
  return sessions.map((s) => {
    const rows = checkRows(s.checks, s.server, local, known);
    for (const c of s.checks) {
      const mine = rows.filter((r) => r.checkId === c.id);
      known.set(c.id, { settled: mine.length > 0 && mine.every(settled), name: checkName(c) });
    }
    return rows;
  });
}

/** "the bass", "the changes", "the melody of phrase 2": a check as "Opens after …" names it. */
export function checkName(c: Pick<PhraseCheck, "layer" | "phrase" | "stages">): string {
  if (c.layer === "bass") return "the bass";
  if (c.layer === "chords") return c.stages?.length ? "the chords" : "the changes";
  return `the melody of ${phraseText(c.phrase).toLowerCase()}`;
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

/** "Phrase 2 · melody", "Phrases 1–4 · chords: the bass", "Phrases 1–3 · changes" (X2: the chords, unstaged). */
export function rowLabel(r: Pick<CheckRow, "phrase" | "layer" | "stage">): string {
  const layer = r.layer === "chords" && r.stage === null ? "changes" : LAYER_WORD[r.layer];
  return `${phraseText(r.phrase)} · ${layer}${r.stage ? `: ${STAGE_WORD[r.stage]}` : ""}`;
}

/** Why a closed row is closed: the check it waits for, else the stage before it. */
export function lockedText(r: Pick<CheckRow, "stage" | "waitsFor">): string {
  if (r.waitsFor) return `Opens after ${r.waitsFor}.`;
  return `Opens after ${r.stage === "quality" ? STAGE_WORD.bass : r.stage === "rn" ? STAGE_WORD.quality : "the check before it"}.`;
}

/** What was revealed rather than heard, for the liner notes ("phrase 2", "the chords' Roman numerals"). */
export function revealedItems(rows: readonly CheckRow[]): string[] {
  return rows
    .filter((r) => r.revealed && !r.passed)
    .map((r) =>
      r.stage
        ? `${STAGE_WORD[r.stage]} of ${phraseText(r.phrase).toLowerCase()}`
        : r.layer === "melody"
          ? phraseText(r.phrase).toLowerCase()
          : r.layer === "bass"
            ? "the bass line"
            : "the changes",
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
  song: Pick<SongDef, "meter" | "key" | "pickup" | "bpm"> & Partial<Pick<SongDef, "swing">>,
): { label: string; value: string }[] {
  const out = [
    { label: "Meter", value: song.meter },
    { label: "Key", value: `${song.key.tonic} ${song.key.mode}` },
    { label: "Tonic (1)", value: song.key.tonic },
    { label: "Tempo", value: `${song.bpm} BPM` },
  ];
  if (song.swing)
    out.push({
      label: "Feel",
      value: `Swing ${song.swing.subdivision}ths, given: write straight; the check straightens`,
    });
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

// --- X2 (Wave 5) ---------------------------------------------------------------------------------

/** A transcription worked bass-first (X2: a check waits for another, or a non-melody check comes first). */
export function bassFirst(checks: readonly PhraseCheck[]): boolean {
  return checks.some((c) => (c.after?.length ?? 0) > 0) || checks[0]?.layer === "bass";
}

/** The givens of a song as Transcribe's song items state them (contracts §6.12; X2 adds the form and the feel). */
export function songGivenFromDef(
  song: Pick<
    SongDef,
    "id" | "title" | "year" | "bpm" | "meter" | "key" | "pickup" | "swing" | "form" | "answerKey"
  >,
): SongGiven {
  const units = song.pickup ? song.pickup.units[0] / song.pickup.units[1] : 0;
  return {
    songId: String(song.id),
    title: song.title,
    year: song.year,
    bpm: song.bpm,
    meter: song.meter,
    key: song.key,
    pickupBeats: units > 0 ? units : null,
    bars: song.answerKey.bars,
    phrases: (song.answerKey.phrases ?? lineSpans(song.answerKey.bars)).map(
      (p) => [p[0], p[1]] as [number, number],
    ),
    swing: song.swing !== undefined,
    form: song.form || null,
  };
}

/**
 * The code a transcription capstone starts from: X1's melody line, or, for a bass-first one (X2), Transcribe's L6
 * starter: the tempo, the givens as comments, a bass line, an empty `chords:` line and the melody, a bar each.
 */
export function transcribeStarter(
  checks: readonly PhraseCheck[],
  song: Parameters<typeof songGivenFromDef>[0] & Pick<SongDef, "answerKey" | "title">,
): string {
  return bassFirst(checks) ? songStarter(6, songGivenFromDef(song)) : x1Starter(song);
}

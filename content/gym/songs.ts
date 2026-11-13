// Ladder levels L5 and L6 (contracts §2.9, §6.4, §6.6 X2, §6.12; content/specs/U11.md "The ladder"; wave5.md §5.3):
// the first song levels of the Transcription Gym. Nobody authors a ladder item and no generator invents one: an
// item is cut from a repertoire song's answer key (content/repertoire/<slug>/song.ts) and graded by the grader's
// song-ladder entry point (`gradeSongLadder`, @oak/grader `grade/song-ladder.ts`).
//
//   L5 (public-domain folk): the melody, one phrase per submission, in order, as the answer key's `phrases` cut it;
//      the chords and a root bass play as accompaniment and are not graded. Lesson mode, pass 0.85.
//   L6 (blues ≤ 1930): one strain (a 12-bar chorus, or a 16-bar verse) in three stages that open in order: the
//      bass over the strain (0.90), the changes (0.85), then the melody one 4-bar line at a time (0.85).
//      Capstone mode (contracts §6.4: gym L6 is graded like a capstone).
//
// An item exists only for a song whose entry is complete for its level: a `song.ts` with the layers the level
// grades and phrases that cut it (L6: lines of the strain from bar 1). Whether the learner may pick it is
// `songLadderStatus`: locked before its `availableFrom` lesson, and "Being checked" while no human has verified
// the answer key (§2.8), unless the caller allows unverified keys (dev). Everything is pure and deterministic
// from (song, level, realism, seed); the hidden reference stays on the server.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { KeySpec, LessonId, MeterId, PickupSpec, SongDef, SwingSpec } from "@oak/content-kit";
import { pcOf, scaleNotes, tempoLine } from "@oak/theory";
import { PENDING_VERIFIER } from "../repertoire/fragment.ts";
import { type RepertoireEntry, songById } from "../repertoire/index.ts";

export type SongLadderLevel = 5 | 6;
export type SongLadderStage = "bass" | "changes" | "melody";
export type SongRealism = 0 | 1 | 2 | 3 | 4;
/** L6 stages in the order they open (contracts §6.6 X2). */
export const SONG_STAGES: readonly SongLadderStage[] = ["bass", "changes", "melody"];
/** Pass marks (as the grader's `SONG_LADDER_PASS`): L5 per phrase, L6 per stage. */
export const SONG_PASS = { 5: 0.85, 6: { bass: 0.9, changes: 0.85, melody: 0.85 } } as const;

/**
 * One gradable submission, in the grader's `SongLadderItem` shape (`gradeSongLadder({ item, song, code, ctx })`):
 * `phrase` is a 1-based index into the answer key's `phrases`, or `[from, to]` for several.
 */
export interface SongLadderCheck {
  itemId: string;
  level: SongLadderLevel;
  phrase: number | [number, number];
  stage?: SongLadderStage;
}

/** What the learner is told (contracts §6.12: tempo, meter, key and pickup are given; L6 also the form and the feel). */
export interface SongLadderGiven {
  bpm: number;
  meter: MeterId;
  /** The key the item plays in (L5 from R2 may be moved; `transposed` says by how much). */
  key: KeySpec;
  pickup: PickupSpec | null;
  /** Bars of the item, numbered as the lead sheet numbers them (the pickup bar not counted). */
  bars: number;
  /** Semitones from the song's own key (0 unless L5 at R2+ moved it). */
  transposed: number;
  /** L6: "one 12-bar strain" or "a 16-bar verse"; L5: the song's form. */
  form: string;
  /** "Swing 8ths" when the song declares a swing (L6 blues: from R0, never a realism step); else "Straight". */
  feel: "Straight" | "Swing 8ths";
  /** L6: one chord a bar, with the bars that hold two marked. */
  harmonicRhythm: { chordsPerBar: 1; twoChordBars: number[] } | null;
}

/** What the pattern player does on top of the hidden code (`@oak/strudel` `realismSpec` plus the song's own feel). */
export interface SongPerformance {
  realism: SongRealism;
  seed: number;
  /** The track the learner transcribes at each step: `mel` (L5), or per L6 stage (`bass`, `chords`, `mel`). */
  target: Record<string, string>;
  /** Realism-driven swing (`realismSpec` `swung`): folk songs stay straight, so always false here. */
  swung: false;
  /** The song's own declared swing, played from R0 (L6 blues). */
  songSwing: SwingSpec | null;
  /** R4: the tune on a vocal-like lead. */
  vocalLead: "tenor" | "choir" | null;
}

export interface SongLadderPlan {
  songId: string;
  title: string;
  year: number | "trad";
  level: SongLadderLevel;
  realism: SongRealism;
  seed: number;
  /** The song as this item plays and is graded: the answer key moved when `given.transposed` ≠ 0. */
  song: SongDef;
  /** The hidden reference (server side only): the whole rendition, in the item's key. */
  reference: string;
  given: SongLadderGiven;
  /** The phrases the lead sheet shows, 1-based bars inclusive (L6: the strain's 4-bar lines). */
  phrases: [number, number][];
  /** L6: bass, changes, melody; `null` for L5. */
  stages: SongLadderStage[] | null;
  /** Every submission of the item, in the order they open (L5 phrase by phrase; L6 bass, changes, line 1…). */
  checks: SongLadderCheck[];
  performance: SongPerformance;
}

// --- completeness and status -------------------------------------------------------------------------

const slugOf = (id: string): string => id.replace(/^song\./, "");
/** A song key is verified once its `verifiedBy` names a human (not the pending marker) or the registry says so. */
export const isVerified = (song: SongDef, entry?: RepertoireEntry): boolean =>
  (entry as { verified?: boolean } | undefined)?.verified === true ||
  (song.verifiedBy.trim().length > 0 &&
    song.verifiedBy !== PENDING_VERIFIER &&
    !/^pending\b/i.test(song.verifiedBy));

/** The bars of an L6 strain: a 12-bar blues chorus, else the song's first 16 bars (a 16-bar verse). */
export function strainBars(song: Pick<SongDef, "form" | "answerKey">): number {
  return /12-bar/i.test(song.form) ? 12 : Math.min(16, song.answerKey.bars);
}

/**
 * Why a song cannot be cut into items of a level (empty when it can): the repertoire entry's ladder level, the
 * layers the level grades and phrases that cut them. L6 also needs 4-bar lines from bar 1 to the strain's end.
 */
export function songLadderGaps(song: SongDef, level: SongLadderLevel): string[] {
  const gaps: string[] = [];
  const entry = songById.get(song.id);
  if (!entry) gaps.push("no repertoire entry");
  else if (entry.ladder !== level)
    gaps.push(`the repertoire lists it for ${entry.ladder ? `L${entry.ladder}` : "no ladder level"}`);
  const layers = song.answerKey.layers;
  const need = level === 5 ? (["melody"] as const) : (["bass", "chords", "melody"] as const);
  for (const l of need) if (!layers[l]) gaps.push(`no ${l} layer`);
  const phrases = song.answerKey.phrases ?? [];
  if (phrases.length === 0) gaps.push("no phrases");
  if (level === 6 && phrases.length > 0) {
    const end = strainBars(song);
    const lines = strainLines(song);
    if (lines.length === 0 || (lines.at(-1) as [number, number])[1] !== end)
      gaps.push(`the phrases do not cut bars 1–${end} into lines`);
    if (lines.some(([a, b]) => b - a + 1 !== 4)) gaps.push("a line of the strain is not 4 bars");
  }
  return gaps;
}
/** The phrases of the strain, from bar 1, while they stay inside it. */
function strainLines(song: SongDef): [number, number][] {
  const end = strainBars(song);
  const out: [number, number][] = [];
  let next = 1;
  for (const p of song.answerKey.phrases ?? []) {
    if (p[0] !== next || p[1] > end) break;
    out.push([p[0], p[1]]);
    next = p[1] + 1;
  }
  return out;
}

export interface SongLadderStatus {
  status: "open" | "locked";
  /** Learner-facing reason while locked: "Opens with U14.L03", "Being checked". */
  lockedReason: string | null;
}
/**
 * Whether the learner may pick the song: never when it cannot be cut into items (it is not offered at all; see
 * `songLadderGaps`), locked before its `availableFrom` lesson and while its answer key is unverified (§2.8).
 */
export function songLadderStatus(
  song: SongDef,
  opts: { completed: ReadonlySet<string>; allowUnverified?: boolean },
): SongLadderStatus {
  const entry = songById.get(song.id);
  const from = (song.availableFrom ?? entry?.availableFrom) as LessonId | undefined;
  if (from && !opts.completed.has(from)) return { status: "locked", lockedReason: `Opens with ${from}` };
  if (!opts.allowUnverified && !isVerified(song, entry))
    return { status: "locked", lockedReason: "Being checked" };
  return { status: "open", lockedReason: null };
}

/** The songs of a level that can be cut into items (complete entries), in repertoire order. */
export function songLadderPool(songs: readonly SongDef[], level: SongLadderLevel): SongDef[] {
  const order = new Map([...songById.keys()].map((id, i) => [id, i] as const));
  return songs
    .filter((s) => songLadderGaps(s, level).length === 0)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

// --- transposition (L5, R2+) ---------------------------------------------------------------------------

const MOVE_KEYS = ["C", "G", "D", "A", "F", "Bb", "Eb"];
/** A key L5 may move a song to at R2+: a major key with up to three sharps or flats, within ±5 half steps. */
function moveFor(song: SongDef, seed: number): number {
  if (song.key.mode !== "major" || !canMove(song)) return 0;
  const from = pcOf(song.key.tonic);
  const options = MOVE_KEYS.map((t) => {
    const d = (((pcOf(t) - from) % 12) + 12) % 12;
    return d > 6 ? d - 12 : d;
  }).filter((d) => d !== 0 && Math.abs(d) <= 5);
  return options.length === 0 ? 0 : (options[seed % options.length] as number);
}
/** A song can be moved when every pitched layer is written in degrees over `.scale("X<octave>:major")`. */
function canMove(song: SongDef): boolean {
  const layers = Object.values(song.answerKey.layers).filter((l): l is string => !!l);
  return layers.every((l) => /^n\(/.test(l) && /\.scale\("[A-G][#b]?\d:major"\)/.test(l));
}
const NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
/** The song moved by `semis`: its key, the `.scale()` of every layer (same octave region) and the chart. */
export function transposeSong(song: SongDef, semis: number): SongDef {
  if (semis === 0) return song;
  const fromTonic = song.key.tonic;
  const toPc = (((pcOf(fromTonic) + semis) % 12) + 12) % 12;
  const tonic = NAMES[toPc] as string;
  const moveScale = (code: string) =>
    code.replace(/\.scale\("([A-G][#b]?)(\d):major"\)/g, (_m, t: string, o: string) => {
      const abs = pcOf(t) + 12 * Number(o) + semis;
      return `.scale("${tonic}${Math.floor((abs - toPc) / 12)}:major")`;
    });
  const oldScale = scaleNotes({ tonic: fromTonic, mode: "major" });
  const newScale = scaleNotes({ tonic, mode: "major" });
  const moveSymbol = (sym: string) => {
    const m = /^([A-G][#b]?)(.*)$/.exec(sym) as RegExpExecArray;
    const i = oldScale.findIndex((n) => pcOf(n) === pcOf(m[1] as string));
    return i < 0 ? sym : `${newScale[i]}${m[2]}`;
  };
  const layers = Object.fromEntries(
    Object.entries(song.answerKey.layers).map(([k, v]) => [k, v ? moveScale(v) : v]),
  ) as SongDef["answerKey"]["layers"];
  return {
    ...song,
    key: { tonic, mode: song.key.mode },
    answerKey: {
      ...song.answerKey,
      code: moveScale(song.answerKey.code),
      layers,
      ...(song.answerKey.chords
        ? { chords: song.answerKey.chords.map((c) => ({ ...c, symbol: moveSymbol(c.symbol) })) }
        : {}),
    },
  };
}

// --- the item --------------------------------------------------------------------------------------------

/** Bars that hold two chords in the answer key's chart. */
function twoChordBars(song: SongDef, upTo: number): number[] {
  const count = new Map<number, number>();
  for (const c of song.answerKey.chords ?? [])
    if (c.bar <= upTo) count.set(c.bar, (count.get(c.bar) ?? 0) + 1);
  return [...count.entries()].filter(([, n]) => n > 1).map(([b]) => b);
}

/**
 * Cuts one item of a level from a song: `null` when the song's entry is not complete for the level. Realism:
 * L5 R2+ may move the song (the given key says so); R4 puts the tune on `tenor` or `choir`; L6 keeps the song's
 * own swing at every level. Deterministic in (song, level, realism, seed).
 */
export function buildSongLadderItem(
  source: SongDef,
  level: SongLadderLevel,
  opts: { realism?: SongRealism; seed?: number } = {},
): SongLadderPlan | null {
  if (songLadderGaps(source, level).length > 0) return null;
  const realism = opts.realism ?? 0;
  const seed = Math.abs(Math.trunc(opts.seed ?? 0));
  const transposed = level === 5 && realism >= 2 ? moveFor(source, seed) : 0;
  const song = transposeSong(source, transposed);
  const slug = slugOf(song.id);
  const allPhrases = (song.answerKey.phrases ?? []).map(([a, b]) => [a, b] as [number, number]);
  const lines = level === 6 ? strainLines(song) : allPhrases;
  const checks: SongLadderCheck[] =
    level === 5
      ? lines.map((_, i) => ({ itemId: `lad.5.${slug}.${i + 1}`, level: 5, phrase: i + 1 }))
      : [
          { itemId: `lad.6.${slug}`, level: 6, phrase: [1, lines.length], stage: "bass" },
          { itemId: `lad.6.${slug}`, level: 6, phrase: [1, lines.length], stage: "changes" },
          ...lines.map(
            (_, i): SongLadderCheck => ({
              itemId: `lad.6.${slug}.${i + 1}`,
              level: 6,
              phrase: i + 1,
              stage: "melody",
            }),
          ),
        ];
  const bars = level === 6 ? strainBars(song) : song.answerKey.bars;
  const entry = songById.get(song.id);
  const vocalLead = realism >= 4 ? (seed % 2 === 0 ? "tenor" : "choir") : null;
  return {
    songId: song.id,
    title: song.title,
    year: song.year,
    level,
    realism,
    seed,
    song,
    reference: song.answerKey.code,
    given: {
      bpm: song.bpm,
      meter: song.meter,
      key: song.key,
      pickup: song.pickup ?? null,
      bars,
      transposed,
      form:
        level === 6
          ? bars === 12
            ? "one 12-bar strain"
            : `a ${bars}-bar verse`
          : (entry?.form ?? song.form),
      feel: song.swing ? "Swing 8ths" : "Straight",
      harmonicRhythm: level === 6 ? { chordsPerBar: 1, twoChordBars: twoChordBars(song, bars) } : null,
    },
    phrases: lines,
    stages: level === 6 ? [...SONG_STAGES] : null,
    checks,
    performance: {
      realism,
      seed,
      target: level === 5 ? { melody: "mel" } : { bass: "bass", changes: "chords", melody: "mel" },
      swung: false,
      songSwing: song.swing ?? null,
      vocalLead,
    },
  };
}

/** The next check to work: the first one not yet passed, in order (`null` when the item is done). */
export function nextSongCheck(plan: SongLadderPlan, passed: ReadonlySet<string>): SongLadderCheck | null {
  return plan.checks.find((c) => !passed.has(checkKey(c))) ?? null;
}
/** A check's key as the grader names its exercise: `<itemId>` (L5) or `<itemId>.<stage>` (L6). */
export const checkKey = (c: SongLadderCheck): string => (c.stage ? `${c.itemId}.${c.stage}` : c.itemId);
/** A graded pass of the whole song (§5.3): every check passed unrevealed. */
export function songLadderDone(plan: SongLadderPlan, passed: ReadonlySet<string>): boolean {
  return plan.checks.every((c) => passed.has(checkKey(c)));
}
/** The answer key as the learner would write the whole transcription (every layer, labelled). */
export const songAnswerCode = (song: SongDef): string => song.answerKey.code;
/** The tempo line every item's code starts with. */
export const songTempoLine = (song: SongDef): string => tempoLine(song.bpm, song.meter);

// --- loading the repertoire's answer keys ---------------------------------------------------------------

const REPERTOIRE = fileURLToPath(new URL("../repertoire/", import.meta.url));
/**
 * Every `content/repertoire/<slug>/song.ts` that exists (server and tests; the browser never sees an answer key),
 * so a song becomes an item as soon as author:repertoire writes it.
 */
export async function loadRepertoireSongs(): Promise<SongDef[]> {
  const out: SongDef[] = [];
  for (const dir of readdirSync(REPERTOIRE, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = join(REPERTOIRE, dir.name, "song.ts");
    try {
      const mod = (await import(file)) as { default?: SongDef };
      if (mod.default?.answerKey) out.push(mod.default);
    } catch (e) {
      if ((e as { code?: string }).code !== "ERR_MODULE_NOT_FOUND" && !/Cannot find module/.test(String(e)))
        throw e;
    }
  }
  return out;
}

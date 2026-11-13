// The facts a review is anchored to (contracts §10.6: "the deterministic AnalysisSummary, the rubric result"):
// chords per bar with their numerals and functions, harmonic rhythm, cadences, schemas, motif reuse and the range
// of each track. All of it is read from Oak's own analysis (`harmonyView` and `AnalysisSummary` of @oak/grader);
// nothing here names a chord itself, it only reshapes what the analysis found and finds where bars repeat.
//
// The tutor imports no package, so the inputs are structural: the server passes `harmonyView(...)` and the
// version's `AnalysisSummary` as they are (both fit these shapes), plus the pitched notes it evaluated.
// `factLines` renders the facts as `<oak_context>` lines. Pure.
import type { FactChord, FactMotif, FactRange, ReviewFacts } from "./domain.ts";

/** The part of `@oak/grader`'s `HarmonyView` the facts read. */
export interface HarmonyViewLike {
  key: { tonic: string; mode: string } | null;
  bars: number;
  pickup: boolean;
  slots: readonly { symbol: string; rn: string | null; function: string | null }[];
  beats: readonly { bar: number; beat: number; chord: number | null; change: boolean }[];
  harmonicRhythm: readonly number[];
  chordToneShare?: number | null;
}

/** The part of `@oak/content-kit`'s `AnalysisSummary` the facts read. */
export interface AnalysisLike {
  bars?: number;
  key?: readonly { key: { tonic: string; mode: string }; r?: number }[];
  slots?: readonly { bar: number; beat: number; symbol: string; rn: string }[];
  cadences?: readonly { bar: number; type: string }[];
  schemas?: readonly { schema: string; bars: readonly [number, number] | readonly number[] }[];
}

/** A pitched note as the server evaluated it (bar 1-based, beat 1-based in tempo units). */
export interface NoteLike {
  track: string;
  midi: number;
  bar: number;
  beat: number;
}

export interface ReviewFactsInput {
  view?: HarmonyViewLike | null;
  analysis?: AnalysisLike | null;
  notes?: readonly NoteLike[];
  meter?: string | null;
  /** The declared key, as text (`"C major"`), when the view has none. */
  key?: string | null;
  /** Tracks whose motifs are looked for (default: the tracks named like a melody, else every pitched track). */
  motifTracks?: readonly string[];
}

/** Bars of chord detail sent at most; the rest is summarised by the harmonic rhythm. */
export const MAX_FACT_BARS = 32;
export const MAX_MOTIFS = 6;

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/** MIDI number to a note name with octave (`60` → `C4`). Spelling is plain (sharps and Eb Ab Bb). */
export function midiName(midi: number): string {
  const m = Math.round(midi);
  return `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

const keyText = (k: { tonic: string; mode: string } | null | undefined) =>
  k ? `${k.tonic} ${k.mode}` : null;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function chordsOf(input: ReviewFactsInput): FactChord[] {
  const view = input.view;
  if (view) {
    const out: FactChord[] = [];
    for (const b of view.beats) {
      if (!b.change || b.chord === null) continue;
      const slot = view.slots[b.chord];
      if (!slot) continue;
      out.push({ bar: b.bar, beat: b.beat, symbol: slot.symbol, rn: slot.rn, fn: slot.function });
    }
    return out;
  }
  return (input.analysis?.slots ?? []).map((s) => ({
    bar: s.bar,
    beat: s.beat,
    symbol: s.symbol,
    rn: s.rn === "" ? null : s.rn,
    fn: null,
  }));
}

/** Pitched notes of one track, bar by bar, each bar as (beat, midi) sorted. */
function barsOf(notes: readonly NoteLike[]): Map<number, { beat: number; midi: number }[]> {
  const out = new Map<number, { beat: number; midi: number }[]>();
  for (const n of notes) {
    const row = out.get(n.bar) ?? [];
    row.push({ beat: round3(n.beat), midi: n.midi });
    out.set(n.bar, row);
  }
  for (const row of out.values()) row.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  return out;
}

type Same = "exact" | "transposed" | "rhythm" | null;

/** How bar `b` repeats bar `a`: the same notes, the same shape a fixed distance away, or the same rhythm. */
export function compareBars(a: readonly { beat: number; midi: number }[], b: typeof a): Same {
  if (a.length < 2 || a.length !== b.length) return null;
  for (let i = 0; i < a.length; i++) if (a[i]?.beat !== b[i]?.beat) return null;
  const shift = (b[0]?.midi ?? 0) - (a[0]?.midi ?? 0);
  const sameShape = a.every((n, i) => (b[i]?.midi ?? 0) - n.midi === shift);
  if (sameShape) return shift === 0 ? "exact" : "transposed";
  return a.length >= 3 ? "rhythm" : null;
}

/**
 * Where a bar's idea comes back later in the same track. Consecutive bars that repeat together are merged into
 * one motif (bars 1–2 return at 5–6). A bar already found as a return of an earlier one is not a new motif.
 */
export function motifsOf(track: string, notes: readonly NoteLike[]): FactMotif[] {
  const bars = barsOf(notes);
  const nums = [...bars.keys()].sort((x, y) => x - y);
  const isReturn = new Set<number>();
  const found: { from: number; to: number; at: number; how: Exclude<Same, null> }[] = [];
  for (const i of nums) {
    if (isReturn.has(i)) continue;
    for (const j of nums) {
      if (j <= i) continue;
      const how = compareBars(bars.get(i) ?? [], bars.get(j) ?? []);
      if (how === null) continue;
      isReturn.add(j);
      // Extend a run: bar i-1 → j-1 with the same kind already found, and i, j follow on.
      const prev = found.find((f) => f.to === i - 1 && f.at + (f.to - f.from) === j - 1 && f.how === how);
      if (prev) prev.to = i;
      else found.push({ from: i, to: i, at: j, how });
    }
  }
  // Group returns of the same span.
  const motifs: FactMotif[] = [];
  for (const f of found) {
    const len = f.to - f.from;
    const at: [number, number] = [f.at, f.at + len];
    const same = motifs.find((m) => m.bars[0] === f.from && m.bars[1] === f.to && m.how === f.how);
    if (same) same.at.push(at);
    else motifs.push({ track, bars: [f.from, f.to], at: [at], how: f.how });
  }
  return motifs;
}

export function rangesOf(notes: readonly NoteLike[]): FactRange[] {
  const byTrack = new Map<string, NoteLike[]>();
  for (const n of notes) byTrack.set(n.track, [...(byTrack.get(n.track) ?? []), n]);
  const out: FactRange[] = [];
  for (const [track, list] of byTrack) {
    let low = list[0] as NoteLike;
    let high = list[0] as NoteLike;
    for (const n of list) {
      if (n.midi < low.midi) low = n;
      if (n.midi > high.midi || (n.midi === high.midi && n.bar < high.bar)) high = n;
    }
    out.push({
      track,
      low: midiName(low.midi),
      high: midiName(high.midi),
      semitones: high.midi - low.midi,
      highBar: high.bar,
    });
  }
  return out.sort((a, b) => (a.track < b.track ? -1 : a.track > b.track ? 1 : 0));
}

const MELODY_TRACK = /^(mel|melody|lead|tune|vox|voice|top)/i;

/** The facts of a piece from Oak's analysis. Every field is optional on input; missing parts stay empty. */
export function reviewFactsFrom(input: ReviewFactsInput): ReviewFacts {
  const { view, analysis } = input;
  const notes = input.notes ?? [];
  const tracks = [...new Set(notes.map((n) => n.track))];
  const motifTracks =
    input.motifTracks ??
    (tracks.some((t) => MELODY_TRACK.test(t)) ? tracks.filter((t) => MELODY_TRACK.test(t)) : tracks);
  const motifs = motifTracks
    .flatMap((t) =>
      motifsOf(
        t,
        notes.filter((n) => n.track === t),
      ),
    )
    .slice(0, MAX_MOTIFS);
  const bars = view?.bars ?? analysis?.bars ?? notes.reduce((m, n) => Math.max(m, n.bar), 0);
  return {
    key: keyText(view?.key) ?? input.key ?? keyText(analysis?.key?.[0]?.key) ?? null,
    meter: input.meter ?? null,
    bars,
    pickup: view?.pickup ?? false,
    chords: chordsOf(input),
    harmonicRhythm: [...(view?.harmonicRhythm ?? [])],
    cadences: (analysis?.cadences ?? []).map((c) => ({ bar: c.bar, type: c.type })),
    schemas: (analysis?.schemas ?? []).map((s) => ({
      schema: s.schema,
      bars: [Number(s.bars[0]), Number(s.bars[1] ?? s.bars[0])] as [number, number],
    })),
    motifs,
    ranges: rangesOf(notes),
    chordToneShare: view?.chordToneShare ?? null,
  };
}

const span = ([a, b]: readonly [number, number]) => (a === b ? `bar ${a}` : `bars ${a}-${b}`);

/** The facts as `<oak_context>` lines, one fact per line, in a fixed order. */
export function factLines(f: ReviewFacts): string[] {
  const lines = [
    `facts: key ${f.key ?? "unknown"} · meter ${f.meter ?? "unknown"} · ${f.bars} bars · pickup ${f.pickup ? "yes (bar 0)" : "no"}`,
  ];
  const byBar = new Map<number, FactChord[]>();
  for (const c of f.chords) byBar.set(c.bar, [...(byBar.get(c.bar) ?? []), c]);
  const shown = [...byBar.keys()].sort((a, b) => a - b).slice(0, MAX_FACT_BARS);
  for (const bar of shown) {
    const chords = (byBar.get(bar) ?? []).map((c) => {
      const tags = [c.rn, c.fn].filter((x) => x !== null).join(", ");
      return `${c.symbol}${tags ? ` (${tags})` : ""}${c.beat === 1 ? "" : ` on beat ${c.beat}`}`;
    });
    lines.push(`chords bar ${bar}: ${chords.join(" then ")}`);
  }
  if (byBar.size > shown.length) lines.push(`chords: ${byBar.size - shown.length} more bars not listed`);
  if (byBar.size === 0) lines.push("chords: none found");
  if (f.harmonicRhythm.length > 0)
    lines.push(`harmonic_rhythm (changes per bar): ${f.harmonicRhythm.join(" ")}`);
  for (const c of f.cadences) lines.push(`cadence: bar ${c.bar} ${c.type}`);
  for (const s of f.schemas) lines.push(`schema: ${s.schema} ${span(s.bars)}`);
  for (const m of f.motifs)
    lines.push(`motif: ${m.track} ${span(m.bars)} returns ${m.how} at ${m.at.map(span).join(", ")}`);
  if (f.motifs.length === 0) lines.push("motif: no bar of the melody returns");
  for (const r of f.ranges)
    lines.push(
      `range: ${r.track} ${r.low}-${r.high} (${r.semitones} semitones), highest note in bar ${r.highBar}`,
    );
  if (f.chordToneShare !== null)
    lines.push(`chord_tones_on_strong_beats: ${Math.round(f.chordToneShare * 100)}%`);
  return lines;
}

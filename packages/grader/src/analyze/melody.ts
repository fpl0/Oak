// Melody analysis (exercises §3.4): the melody line, contour, range, steps and leaps, endings, motif
// reuse, chord tones on strong beats, non-chord-tone types and phrases.
import type { Degree, KeySpec, MeterId, NEvent, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { degreeOf, METERS, scalePcs } from "@oak/theory";
import type { ChordSlot } from "./chords.ts";
import { slotAt, slotPcs } from "./chords.ts";
import { mod12, num, pitched, skyline } from "./events.ts";
import { metricLevels } from "./meter.ts";

export interface Note {
  id: string;
  midi: number;
  onset: Rat;
  /** Sounding length: cut at the next onset of the line. */
  dur: Rat;
  event: NEvent;
}

/** The skyline of the events as a monophonic line; each note is cut at the next onset. */
export function melodyLine(events: readonly NEvent[]): Note[] {
  const top = skyline(events);
  return top.map((e, i) => {
    const next = top[i + 1];
    const own = e.clipDur ?? e.dur;
    const gap = next ? R.sub(next.onset, e.onset) : own;
    return { id: e.id, midi: e.midi, onset: e.onset, dur: R.lt(gap, own) ? gap : own, event: e };
  });
}

/** Parsons code between successive notes: u (up), d (down), r (repeat). */
export function parsons(notes: readonly Pick<Note, "midi">[], threshCents = 50): string {
  let out = "";
  for (let i = 1; i < notes.length; i++) {
    const diff = ((notes[i] as { midi: number }).midi - (notes[i - 1] as { midi: number }).midi) * 100;
    out += diff > threshCents ? "u" : diff < -threshCents ? "d" : "r";
  }
  return out;
}

/** Levenshtein distance with a substitution cost function (default 1). */
export function editDistance<T>(
  a: readonly T[],
  b: readonly T[],
  sub: (x: T, y: T) => number = (x, y) => (x === y ? 0 : 1),
): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row.push(
        Math.min(
          (prev[j] as number) + 1,
          (row[j - 1] as number) + 1,
          (prev[j - 1] as number) + sub(a[i - 1] as T, b[j - 1] as T),
        ),
      );
    }
    prev = row;
  }
  return prev[b.length] as number;
}
/** `1 − distance / max(length)`; two empty sequences are identical. */
export function editSimilarity<T>(a: readonly T[], b: readonly T[], sub?: (x: T, y: T) => number): number {
  const len = Math.max(a.length, b.length);
  return len === 0 ? 1 : 1 - editDistance(a, b, sub) / len;
}
export function contourScore(target: string, answer: string): number {
  return editSimilarity([...target], [...answer]);
}

/**
 * Share of pitched events whose pitch class belongs to the key's scale, and the ones that do not. A minor
 * key also owns its raised 6th and 7th (the melodic- and harmonic-minor tones: G♯ and F♯ in A minor), as
 * a musician reads "in A minor"; `strict` keeps to the natural-minor scale.
 */
export function scaleMembership(
  events: readonly NEvent[],
  key: KeySpec,
  o: { strict?: boolean } = {},
): { ratio: number; outside: NEvent[]; n: number } {
  const pcs = new Set<number>(scalePcs(key));
  if (key.mode === "minor" && !o.strict) {
    const tonic = scalePcs(key)[0] as number;
    pcs.add(mod12(tonic + 9));
    pcs.add(mod12(tonic + 11));
  }
  const notes = pitched(events);
  const outside = notes.filter((e) => !pcs.has(mod12(e.midi)));
  return { ratio: notes.length === 0 ? 1 : 1 - outside.length / notes.length, outside, n: notes.length };
}

export function pitchRange(events: readonly NEvent[]): { low: number; high: number; span: number } | null {
  const notes = pitched(events);
  if (notes.length === 0) return null;
  const low = Math.min(...notes.map((e) => e.midi));
  const high = Math.max(...notes.map((e) => e.midi));
  return { low, high, span: high - low };
}
/** Share of sounding time spent inside `[low, high]`. */
export function tessitura(events: readonly NEvent[], within: readonly [number, number]): number {
  let inside = 0;
  let total = 0;
  for (const e of pitched(events)) {
    const d = num(e.clipDur ?? e.dur);
    total += d;
    if (e.midi >= within[0] && e.midi <= within[1]) inside += d;
  }
  return total === 0 ? 1 : inside / total;
}

/** A step is at most 2 semitones (a repeat counts). A leap of more than 4 is recovered by a step back. */
export function stepLeap(notes: readonly Note[]): {
  stepRatio: number;
  maxLeap: number;
  unrecovered: string[];
  intervals: number;
} {
  let steps = 0;
  let maxLeap = 0;
  const unrecovered: string[] = [];
  for (let i = 1; i < notes.length; i++) {
    const d = (notes[i] as Note).midi - (notes[i - 1] as Note).midi;
    if (Math.abs(d) <= 2) steps++;
    maxLeap = Math.max(maxLeap, Math.abs(d));
    if (Math.abs(d) > 4) {
      const next = notes[i + 1];
      const back = next ? next.midi - (notes[i] as Note).midi : 0;
      if (!next || Math.abs(back) > 2 || back === 0 || Math.sign(back) === Math.sign(d))
        unrecovered.push((notes[i] as Note).id);
    }
  }
  const intervals = Math.max(0, notes.length - 1);
  return { stepRatio: intervals === 0 ? 1 : steps / intervals, maxLeap, unrecovered, intervals };
}

/** The degree the line ends on. */
export function endsOn(notes: readonly Note[], key: KeySpec): Degree | null {
  const last = notes[notes.length - 1];
  return last ? degreeOf(last.midi, key).degree : null;
}

export interface MotifReuse {
  /** Units that match an earlier unit ÷ units that carry notes. */
  ratio: number;
  units: number;
  matched: number;
  /** 0-based first cycle of every unit that reuses an earlier one. */
  reusedAt: number[];
  /** Bars measured: the period the line was trimmed to, or every bar the notes reach. */
  bars: number;
}
export interface MotifReuseOptions {
  /** Edit similarity a unit needs to an earlier one (contracts §5.6: 0.75). */
  minSimilarity?: number;
  /** Only notes starting before this cycle count: one period of a loop, so its own repeats never match. */
  periodBars?: number;
  /** `semitones` (default), `steps` (scale steps in `key`), or `either`. */
  shape?: "semitones" | "steps" | "either";
  /** The key scale steps are counted in; without one only semitones are compared. */
  key?: KeySpec | null;
}

/** Diatonic step index in a key: 7 per octave; a chromatic note counts with its letter degree. */
export function diatonicIndex(midi: number, key: KeySpec): number {
  const d = degreeOf(midi, key);
  const tonicPc = mod12(midi - d.semitones);
  return Math.floor((midi - tonicPc) / 12) * 7 + d.num - 1;
}

/**
 * Share of melody units (default one bar) whose interval sequence matches an earlier unit, exactly or
 * transposed, by edit similarity ≥ 0.75 (contracts §5.6). A unit of one note matches an earlier one-note unit
 * with the same rhythm (d6). With
 * `periodBars`, only one period is read; with `shape`, the intervals are half steps, scale steps or either.
 */
export function motifReuse(
  notes: readonly Note[],
  unitBars = 1,
  minSimilarityOrOptions: number | MotifReuseOptions = 0.75,
): MotifReuse {
  const o: MotifReuseOptions =
    typeof minSimilarityOrOptions === "number"
      ? { minSimilarity: minSimilarityOrOptions }
      : minSimilarityOrOptions;
  const minSimilarity = o.minSimilarity ?? 0.75;
  const shape = o.key ? (o.shape ?? "semitones") : "semitones";
  const read =
    o.periodBars !== undefined ? notes.filter((n) => R.floor(n.onset) < (o.periodBars as number)) : notes;
  const byUnit = new Map<number, Note[]>();
  for (const n of read) {
    const u = Math.floor(R.floor(n.onset) / unitBars);
    const list = byUnit.get(u) ?? [];
    list.push(n);
    byUnit.set(u, list);
  }
  const units = [...byUnit.entries()].sort((a, b) => a[0] - b[0]);
  const seen: { semis: number[]; steps: number[]; rhythm: string }[] = [];
  const reusedAt: number[] = [];
  const key = o.key ?? null;
  // Where each note of a unit starts and how long it lasts: what a one-note bar has in place of a shape.
  const rhythmOf = (u: number, list: readonly Note[]): string =>
    list
      .map((n) => {
        const at = R.sub(n.onset, [u * unitBars, 1]);
        return `${at[0]}/${at[1]}:${n.dur[0]}/${n.dur[1]}`;
      })
      .join(" ");
  for (const [u, list] of units) {
    const semis = list.slice(1).map((n, i) => n.midi - (list[i] as Note).midi);
    const steps = key
      ? list.slice(1).map((n, i) => diatonicIndex(n.midi, key) - diatonicIndex((list[i] as Note).midi, key))
      : semis;
    const like = (s: { semis: number[]; steps: number[] }): boolean =>
      ((shape === "semitones" || shape === "either") &&
        s.semis.length > 0 &&
        editSimilarity(s.semis, semis) >= minSimilarity) ||
      ((shape === "steps" || shape === "either") &&
        s.steps.length > 0 &&
        editSimilarity(s.steps, steps) >= minSimilarity);
    const rhythm = rhythmOf(u, list);
    // A bar of one note has no interval to compare (d6: C5's riff with its landing bars scored 7 of 12): it
    // reuses an earlier one-note bar when its rhythm is the same, whatever the pitch.
    const single = semis.length === 0 && seen.some((s) => s.semis.length === 0 && s.rhythm === rhythm);
    if ((semis.length > 0 && seen.some(like)) || single) reusedAt.push(u * unitBars);
    seen.push({ semis, steps, rhythm });
  }
  const last = read.reduce((m, n) => Math.max(m, R.floor(n.onset) + 1), 0);
  return {
    ratio: units.length === 0 ? 0 : reusedAt.length / units.length,
    units: units.length,
    matched: reusedAt.length,
    reusedAt,
    bars: o.periodBars ?? last,
  };
}

export type BeatStrength = "downbeat" | "strong" | "beat";
/** Whether an in-bar position is a downbeat, a strong beat (1 and 3 in 4/4, 1 and 4 in 6/8) or any beat. */
export function isStrong(onset: Rat, meter: MeterId, strength: BeatStrength): boolean {
  const f = R.frac(onset);
  if (strength === "downbeat") return f[0] === 0;
  const m = METERS[meter];
  if (strength === "beat") return (f[0] * m.unitsPerBar) % f[1] === 0;
  const levels = metricLevels(meter);
  // Three-unit meters have one strong beat; every other meter adds its half bar, its second beat or its group starts.
  const strong = m.unitsPerBar === 3 && m.grouping.length === 3 ? (levels[0] as Rat[]) : (levels[1] as Rat[]);
  return strong.some((p) => R.eq(p, f));
}

/** Share of the melody's onsets on strong positions that are tones of the chord sounding there. */
/**
 * The chord of the bar under a note that falls where no chord sounds: comping on the off-beats (`.struct("~ x ~ x")`,
 * a 1920s guitar) leaves beats 1 and 3 silent, but the harmony is still that bar's chord. The chord struck last
 * before the note in the same bar, else the first one struck after it in the same bar; `undefined` across a bar
 * line (Wave 6, U15.L05).
 */
export function barChordAt(slots: readonly ChordSlot[], at: Rat): ChordSlot | undefined {
  const bar = R.floor(at);
  const inBar = slots.filter((s) => s.chord && R.floor(s.span[0]) === bar);
  const before = inBar.filter((s) => R.lte(s.span[0], at));
  return before[before.length - 1] ?? inBar.find((s) => R.lt(at, s.span[0]));
}
export function chordToneRatio(
  melody: readonly Note[],
  slots: readonly ChordSlot[],
  meter: MeterId,
  strength: BeatStrength,
): { ratio: number; n: number; misses: Note[] } {
  const misses: Note[] = [];
  let n = 0;
  for (const note of melody) {
    if (!isStrong(note.onset, meter, strength)) continue;
    const slot = slotAt(slots, note.onset) ?? barChordAt(slots, note.onset);
    if (!slot) continue;
    n++;
    if (!slotPcs(slot).includes(mod12(note.midi))) misses.push(note);
  }
  return { ratio: n === 0 ? 0 : 1 - misses.length / n, n, misses };
}

export type NctType =
  | "passing"
  | "neighbor"
  | "appoggiatura"
  | "suspension"
  | "anticipation"
  | "escape"
  | "other";
/**
 * Names each non-chord tone of the melody from how it is approached and left (exercises §3.4):
 * passing (step in, step out, same direction), neighbor (step in, step back), appoggiatura (leap in, step
 * out, strong position), suspension (a chord tone re-struck or tied into a chord it does not belong to,
 * then a step down; the tied form is reported on the held note),
 * anticipation (a tone of the next chord, weak position), escape (step in, leap out the other way).
 */
export function classifyNct(
  melody: readonly Note[],
  slots: readonly ChordSlot[],
  meter: MeterId,
): { id: string; type: NctType }[] {
  const out: { id: string; type: NctType }[] = [];
  const isStep = (d: number): boolean => Math.abs(d) >= 1 && Math.abs(d) <= 2;
  melody.forEach((note, i) => {
    const slot = slotAt(slots, note.onset);
    const prev = melody[i - 1];
    const next = melody[i + 1];
    if (slot && slotPcs(slot).includes(mod12(note.midi))) {
      // A tied suspension: a chord tone held into a chord it does not belong to, then resolved down by
      // step. The note has no onset of its own at the change, so it is read where the chord changes.
      const end = R.add(note.onset, note.dur);
      const change = slots.find((s) => R.lt(note.onset, s.span[0]) && R.lt(s.span[0], end));
      const outOf = next ? next.midi - note.midi : null;
      if (
        change &&
        !slotPcs(change).includes(mod12(note.midi)) &&
        outOf !== null &&
        outOf < 0 &&
        isStep(outOf)
      )
        out.push({ id: note.id, type: "suspension" });
      return;
    }
    if (!slot) return;
    const into = prev ? note.midi - prev.midi : null;
    const outOf = next ? next.midi - note.midi : null;
    const strong = isStrong(note.onset, meter, "beat");
    const nextSlot = next ? slotAt(slots, next.onset) : slots[slots.indexOf(slot) + 1];
    let type: NctType = "other";
    // A suspension is prepared under another chord: the same note sounded as that chord's tone, then struck again
    // over this one and resolved down by step. A note repeated within one chord is not one (X2 bar 10: B♭ B♭ B♭ A
    // over D7 is a held neighbour, not a suspension; wave 7 closer).
    const prevSlot = prev ? slotAt(slots, prev.onset) : undefined;
    const prepared =
      prev !== undefined &&
      prevSlot !== undefined &&
      prevSlot !== slot &&
      slotPcs(prevSlot).includes(mod12(prev.midi));
    if (into === 0 && prepared && outOf !== null && outOf < 0 && isStep(outOf) && strong) type = "suspension";
    else if (!strong && nextSlot && nextSlot !== slot && slotPcs(nextSlot).includes(mod12(note.midi)))
      type = "anticipation";
    else if (into !== null && outOf !== null && isStep(into) && isStep(outOf))
      type = Math.sign(into) === Math.sign(outOf) ? "passing" : "neighbor";
    else if (into !== null && outOf !== null && !isStep(into) && into !== 0 && isStep(outOf) && strong)
      type = "appoggiatura";
    else if (
      into !== null &&
      outOf !== null &&
      isStep(into) &&
      Math.abs(outOf) > 2 &&
      Math.sign(into) !== Math.sign(outOf)
    )
      type = "escape";
    out.push({ id: note.id, type });
  });
  return out;
}

/** Phrases of `phraseBars` bars (default 4) over the span of the events; bars are 1-based and inclusive. */
export function phrases(
  events: readonly NEvent[],
  phraseBars = 4,
  totalBars?: number,
): { bars: [number, number] }[] {
  const bars = totalBars ?? events.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  const out: { bars: [number, number] }[] = [];
  for (let b = 0; b < bars; b += phraseBars) out.push({ bars: [b + 1, Math.min(bars, b + phraseBars)] });
  return out;
}

/** The degrees of a line, key-relative and octave-free. */
export function degreeSequence(notes: readonly Pick<Note, "midi">[], key: KeySpec): Degree[] {
  return notes.map((n) => degreeOf(n.midi, key).degree);
}

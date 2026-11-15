// Wave 7 views (docs/design/wave7.md §3.2): what the advanced tracks' rules, lenses, checklists, liner notes and the
// tutor read from a piece. One analyzer per question, so a rule, a lens and a checklist can never disagree.
//
// Built in Foundation (on @oak/theory, tested in wave7-views.test.ts on real Strudel output): the ii–V–I pairs per
// key, the voicing type of every hand-voiced chord, the melody's tensions against the chords, swing ratio and
// microtiming per track, Euclid identity per bar, clave type/direction/coverage per two-bar window, register clashes
// under the low-interval limits, density per bar and per section, and the level of every part.
// Typed and NOT built (each returns `NotBuilt` until the grader engineer builds it against its content-kit rule):
// walking bass, comping rhythm, reharmonisation, contrafact, interlock, odd-meter grouping, hemiola, simultaneous
// polyrhythm, polymeter, clave alignment, sound-control effect, counter-melody, sample chopping, the same tune in
// another idiom.
import type { MeterId, NEvent, Rat, TrackRef, VoicedChord } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import {
  belowLowIntervalLimit,
  type ChordId,
  type ClaveDirection,
  type ClaveType,
  chordPcs,
  claveOf,
  claveSteps,
  densityOf,
  euclidIdentity,
  keyDisplay,
  lateMs,
  METERS,
  parseChordSymbol,
  type Tension,
  tensionsOf,
  toCode,
  triadCore,
  twoFiveTarget,
  type VoicingReading,
  voicingType,
} from "@oak/theory";
import type { NormalizeContext, Normalized } from "../types.ts";
import type { ChordSlot } from "./chords.ts";
import { chordSlots } from "./chords.ts";
import { mod12, pitched } from "./events.ts";
import { detectDevices, harmonySlots, heardSymbols } from "./piece.ts";
import { selectTrack, tracksOfRole } from "./tracks.ts";

/** A view that is typed but not built yet: hosts show "Not built yet" and rules fail with `rubric.unknown`. */
export interface NotBuilt {
  notBuilt: string;
}
export const notBuilt = (what: string): NotBuilt => ({ notBuilt: what });
export const isNotBuilt = (v: unknown): v is NotBuilt =>
  typeof v === "object" && v !== null && "notBuilt" in v && typeof (v as NotBuilt).notBuilt === "string";

type Ctx = NormalizeContext & { bars?: number };
const barCount = (n: Normalized, ctx: Ctx): number =>
  ctx.bars ??
  Math.max(
    1,
    n.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0),
  );
const chordOfSlot = (s: ChordSlot): ChordId | null =>
  s.chord ?? (s.symbol ? parseChordSymbol(s.symbol) : null);

// --- jazz harmony ----------------------------------------------------------------------------------------------

export interface TwoFiveView {
  /** 1-based bar of the ii chord. */
  bar: number;
  ii: string;
  v: string;
  /** The tonic the pair aims at ("C major", "A minor"), whether or not it arrives. */
  target: string;
  targetPc: number;
  mode: "major" | "minor";
  /** The chord after the V is the target's tonic chord. */
  resolved: boolean;
}
/** Every ii–V in the piece and the key it aims at (J1.L03, J2.L01, JC1's chained ii–Vs). */
export function twoFiveView(n: Normalized, _ctx: Ctx): TwoFiveView[] {
  const slots = harmonySlots(n);
  const out: TwoFiveView[] = [];
  for (let i = 0; i + 1 < slots.length; i++) {
    const a = chordOfSlot(slots[i] as ChordSlot);
    const b = chordOfSlot(slots[i + 1] as ChordSlot);
    if (!a || !b) continue;
    const t = twoFiveTarget(a, b);
    if (!t) continue;
    const c = slots[i + 2] ? chordOfSlot(slots[i + 2] as ChordSlot) : null;
    const minorTonic = c ? ["m7", "min", "m6", "mMaj7", "m9", "m11"].includes(c.quality) : false;
    out.push({
      bar: R.floor((slots[i] as ChordSlot).span[0]) + 1,
      ii: toCode(a),
      v: toCode(b),
      target: keyDisplay({ tonic: pcName(t.tonicPc), mode: t.mode === "major" ? "major" : "minor" }),
      targetPc: t.tonicPc,
      mode: t.mode,
      resolved: !!c && c.rootPc === t.tonicPc && (t.mode === "minor" ? minorTonic : !minorTonic),
    });
  }
  return out;
}
const PC_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const pcName = (pc: number): string => PC_NAMES[mod12(pc)] as string;

export interface VoicingView {
  bar: number;
  at: Rat;
  /** The chord the notes are read against (the symbol when the line carries one). */
  chord: string;
  midis: number[];
  reading: VoicingReading;
  /** A `voicing()` line: its shape is the dictionary's, not the learner's (contracts §6.7; w7plan A2). */
  dictionary: boolean;
}
/** The voicing type of each chord of a track, octave-aware (J1.L05 shells, J3.L01–L02 rootless and drop-2). */
export function voicingView(
  n: Normalized,
  ctx: Ctx & { track: TrackRef; changes?: readonly string[] },
): VoicingView[] {
  const events = pitched(selectTrack(n, ctx.track));
  const byOnset = new Map<string, (NEvent & { midi: number })[]>();
  for (const e of events) {
    const k = R.str(e.onset);
    byOnset.set(k, [...(byOnset.get(k) ?? []), e]);
  }
  const out: VoicingView[] = [];
  for (const group of byOnset.values()) {
    const first = group[0] as NEvent & { midi: number };
    const bar = R.floor(first.onset);
    const symbol =
      first.chordSymbol ??
      (ctx.changes && ctx.changes.length > 0 ? ctx.changes[bar % ctx.changes.length] : undefined);
    const chord = symbol ? parseChordSymbol(symbol) : null;
    if (!chord) continue;
    out.push({
      bar: bar + 1,
      at: first.onset,
      chord: toCode(chord),
      midis: group.map((e) => e.midi).sort((a, b) => a - b),
      reading: voicingType(
        group.map((e) => e.midi),
        chord,
      ),
      dictionary: first.chordSymbol !== undefined,
    });
  }
  return out.sort((a, b) => R.cmp(a.at, b.at));
}

export interface TensionNoteView {
  id: string;
  at: Rat;
  midi: number;
  /** The chord sounding at the note's onset, code spelling; `null` with no chord. */
  chord: string | null;
  /** "chord-tone", or the tension's name ("9", "#11", "b13", "6", "7"); "outside" when not in the chord-scale. */
  role: string;
  avoid: boolean;
  /** On a beat, or lasting a beat or more: what `allowed-tensions` judges (shorter off-beat notes pass freely). */
  structural: boolean;
}
/** The melody's notes against the chords under them (the TENSION lens; J2.L03, J5.L04, JC4, AC2). */
export function tensionView(n: Normalized, ctx: Ctx & { melody?: TrackRef }): TensionNoteView[] {
  const slots = harmonySlots(n);
  const beat = 1 / METERS[ctx.meter].unitsPerBar;
  return pitched(selectTrack(n, ctx.melody ?? "@melody")).map((e) => {
    // Between comping hits the chord held, not "no chord" (W7 gate: half of JC4's tune was never checked).
    const slot = governingSlot(slots, R.toNum(e.onset));
    const chord = slot ? chordOfSlot(slot) : null;
    const structural = Math.abs((R.toNum(e.onset) / beat) % 1) < 1e-9 || R.toNum(e.dur) >= beat - 1e-9;
    if (!chord)
      return { id: e.id, at: e.onset, midi: e.midi, chord: null, role: "outside", avoid: false, structural };
    const rel = mod12(e.midi - chord.rootPc);
    // The chord's own tones, not the notes its voicing happens to play: the 5th a dictionary D7 leaves out, or the
    // root under a rootless voicing, is still a chord tone (build-workbench, build-capstone).
    const tones = new Set((chordPcs(chord) as number[]).map((pc) => mod12(pc - chord.rootPc)));
    // A tension the chord symbol includes (the 9 of a maj9) is still named as the tension.
    const t: Tension | undefined = tensionsOf(chord).find((x) => x.semis === rel);
    const isTone = !t && tones.has(rel);
    return {
      id: e.id,
      at: e.onset,
      midi: e.midi,
      chord: toCode(chord),
      role: t ? t.label : isTone ? "chord-tone" : "outside",
      avoid: t?.avoid ?? false,
      structural,
    };
  });
}

// --- rhythm ----------------------------------------------------------------------------------------------------

export interface FeelView {
  track: string;
  /** Median long:short ratio of the swung pairs found; `null` with none (straight or no off-beats). */
  swingRatio: number | null;
  /** Median offset of the onsets from the nearest 16th, in milliseconds at the piece's tempo (+ late, − early). */
  medianOffsetMs: number;
  onsets: number;
}
/** Swing ratio and microtiming per track (R1.L02, R1.L05, AC2; the MICROTIMING view). */
export function feelView(n: Normalized, ctx: Ctx & { tracks?: readonly string[] }): FeelView[] {
  const m = METERS[ctx.meter];
  const tracks = ctx.tracks ?? Object.keys(n.byTrack).filter((t) => !t.startsWith("band."));
  const bpm = n.bpm || 120;
  return tracks.map((track) => {
    const es = n.byTrack[track] ?? [];
    const xs = [...new Set(es.map((e) => R.toNum(e.onset)))].sort((a, b) => a - b);
    const offsets = xs.map((x) => {
      const step = 1 / (m.unitsPerBar * 4);
      return x - Math.round(x / step) * step;
    });
    const ratios: number[] = [];
    const unit = 1 / m.unitsPerBar;
    // A line on a 16th grid (a beat with two notes inside it, or one in the first half of the beat) is not a line of
    // swung 8ths: a straight push on the beat's last 16th is not a 3:1 swing (build-tutor (a): a funk bass, cb(5,16,2)).
    const inside = new Map<number, number[]>();
    for (const x of xs) {
      const k = Math.floor(x / unit + 1e-9);
      const pos = x / unit - k;
      if (pos > 0.05 && pos < 0.95) inside.set(k, [...(inside.get(k) ?? []), pos]);
    }
    const sixteenthGrid = [...inside.values()].some((ps) => ps.length > 1 || ps.some((p) => p < 0.45));
    for (const [k, ps] of sixteenthGrid ? [] : inside) {
      const pos = ps[0] as number;
      if (xs.some((y) => Math.abs(y - k * unit) < 1e-9)) ratios.push(pos / (1 - pos));
    }
    const median = (v: number[]) =>
      v.length ? ([...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] as number) : 0;
    return {
      track,
      swingRatio: ratios.length ? median(ratios) : null,
      medianOffsetMs: lateMs(median(offsets), bpm, m),
      onsets: xs.length,
    };
  });
}

export interface EuclidBarView {
  bar: number;
  steps: number;
  onsets: number[];
  euclid: { pulses: number; steps: number; rotation: number } | null;
}
/** Each bar of a track on an 8- or 16-step grid, and which E(k, n, r) it is (R3.L01, R3.L03, RC2). */
export function euclidView(n: Normalized, ctx: Ctx & { track: TrackRef; steps?: number }): EuclidBarView[] {
  const steps = ctx.steps ?? 8;
  const out: EuclidBarView[] = [];
  for (let bar = 0; bar < barCount(n, ctx); bar++) {
    const ons = onGrid(selectTrack(n, ctx.track), bar, steps);
    out.push({ bar: bar + 1, steps, onsets: ons, euclid: ons.length ? euclidIdentity(ons, steps) : null });
  }
  return out;
}
/** Onset steps of one bar on a grid (onsets off the grid are left out). */
function onGrid(events: readonly NEvent[], bar: number, steps: number): number[] {
  const out = new Set<number>();
  for (const e of events) {
    if (R.floor(e.onset) !== bar) continue;
    const s = R.toNum(R.frac(e.onset)) * steps;
    if (Math.abs(s - Math.round(s)) < 1e-6) out.add(Math.round(s));
  }
  return [...out].sort((a, b) => a - b);
}

export interface ClaveWindowView {
  /** 1-based first bar of the two-bar window. */
  bar: number;
  steps: number[];
  clave: { type: ClaveType; direction: ClaveDirection } | null;
}
export interface ClaveView {
  windows: ClaveWindowView[];
  /** The clave of the first window that holds one. */
  first: { type: ClaveType; direction: ClaveDirection } | null;
  /** Bars covered by consecutive windows from bar 1 that hold that same clave (RC2's "8+ bars"). */
  coveredBars: number;
}
/** The clave on the two-bar eighth grid, window by window from bar 1 (R3.L02, RC2; the CLAVE lens). */
export function claveView(n: Normalized, ctx: Ctx & { track: TrackRef }): ClaveView {
  const events = selectTrack(n, ctx.track);
  const windows: ClaveWindowView[] = [];
  for (let bar = 0; bar < barCount(n, ctx); bar += 2) {
    const steps = [...onGrid(events, bar, 8), ...onGrid(events, bar + 1, 8).map((s) => s + 8)];
    windows.push({ bar: bar + 1, steps, clave: claveOf(steps) });
  }
  const first = windows.find((w) => w.clave)?.clave ?? null;
  let covered = 0;
  for (const w of windows) {
    if (!first || !w.clave || w.clave.type !== first.type || w.clave.direction !== first.direction) break;
    covered += 2;
  }
  return { windows, first, coveredBars: covered };
}

// --- sound and arrangement -------------------------------------------------------------------------------------

export interface RegisterClashView {
  at: Rat;
  bar: number;
  low: number;
  high: number;
  /** Half steps between them. */
  interval: number;
}
/** Notes sounding together under their low-interval limit (A2.L01; REGISTER bands on the spectrum panel). */
export function registerClashView(n: Normalized, _ctx: Ctx): RegisterClashView[] {
  const notes = pitched(n.all);
  const out: RegisterClashView[] = [];
  const starts = [...new Set(notes.map((e) => R.str(e.onset)))];
  for (const k of starts) {
    const at = notes.find((e) => R.str(e.onset) === k)?.onset as Rat;
    const sounding = notes
      .filter((e) => R.lte(e.onset, at) && R.lt(at, R.add(e.onset, e.dur)))
      .map((e) => e.midi);
    const low = [...new Set(sounding)].sort((a, b) => a - b);
    for (let i = 0; i + 1 < low.length; i++) {
      const a = low[i] as number;
      const b = low[i + 1] as number;
      if (belowLowIntervalLimit(a, b))
        out.push({ at, bar: R.floor(at) + 1, low: a, high: b, interval: b - a });
    }
  }
  return out;
}

export interface DensityBarView {
  bar: number;
  onsetsPerBar: number;
  polyphony: number;
  parts: number;
}
/** Density bar by bar (A2.L02; the DENSITY strip groups these per section with `sectionsFromAst`). */
export function densityView(n: Normalized, ctx: Ctx): DensityBarView[] {
  const out: DensityBarView[] = [];
  for (let bar = 0; bar < barCount(n, ctx); bar++) {
    const es = n.all
      .filter((e) => R.floor(e.onset) === bar)
      .map((e) => ({ onset: R.toNum(e.onset), track: e.track }));
    out.push({ bar: bar + 1, ...densityOf(es, 1) });
  }
  return out;
}

export interface LevelView {
  track: string;
  /** Median effective gain of its notes, in dB relative to the loudest part's median (0 for the loudest). */
  relDb: number;
  /** More than 24 dB under the loudest part: not heard (decision 71). */
  heard: boolean;
}
/** The level of every learner part against the loudest (A2.L05's levels between parts). */
export function levelsView(n: Normalized, _ctx: Ctx): LevelView[] {
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const rows = Object.entries(n.byTrack)
    .filter(([t, es]) => !t.startsWith("band.") && es.length > 0)
    .map(([track, es]) => ({ track, g: med(es.map((e) => e.gain)) }));
  const top = Math.max(1e-9, ...rows.map((r) => r.g));
  return rows.map((r) => {
    const relDb = r.g > 0 ? 20 * Math.log10(r.g / top) : Number.NEGATIVE_INFINITY;
    return { track: r.track, relDb, heard: relDb >= -24 };
  });
}

// --- built in the Wave 7 Build (grader) ----------------------------------------------------------------------------
// Every view below reads what is HEARD: `normalize` has already left out silent events and parts more than 24 dB
// under the loudest part (decision 71), so a muted or masked line plays nothing here.

const EPS = 1e-6;
const at = (e: Pick<NEvent, "onset">): number => R.toNum(e.onset);
const nearInt = (x: number, tol = 1e-4): boolean => Math.abs(x - Math.round(x)) < tol;
const uniqSorted = (xs: readonly number[]): number[] =>
  [...xs].sort((a, b) => a - b).filter((x, i, a) => i === 0 || Math.abs(x - (a[i - 1] as number)) > EPS);
/** The chord symbol of bar `bar` from a one-a-bar `changes` list (looped), parsed. */
const changeAt = (changes: readonly string[] | undefined, bar: number): ChordId | null => {
  if (!changes || changes.length === 0) return null;
  return parseChordSymbol(changes[bar % changes.length] as string);
};
/** The chord sounding at `t` (cycles): from `changes` (one a bar) when given, else from the slots. */
function chordAt(
  slots: readonly ChordSlot[],
  changes: readonly string[] | undefined,
  t: number,
): ChordId | null {
  const c = changeAt(changes, Math.floor(t + EPS));
  if (c) return c;
  const s = slots.find((x) => R.toNum(x.span[0]) <= t + EPS && t + EPS < R.toNum(x.span[1]));
  if (s) return chordOfSlot(s);
  // Comping that leaves the beat empty (chords on 2 and 4): the next chord that starts in the same bar.
  const bar = Math.floor(t + EPS);
  const next = slots.find((x) => R.toNum(x.span[0]) >= t - EPS && R.toNum(x.span[0]) < bar + 1 - EPS);
  return next ? chordOfSlot(next) : null;
}
/** Pitch classes of a chord. */
const pcsOf = (c: ChordId): Set<number> => new Set(chordPcs(c).map((p) => mod12(p)));
/**
 * The chord that governs time `t` (W7 gate): the slot sounding there; between comping hits (stabs on 2 and 4) the
 * chord struck last, held until the next one; before the bar's first hit, that hit's chord when the last one was
 * struck in an earlier bar (the change arrives with the bar, the comping after it). Never more than a bar away, so
 * a tune note between comping hits is judged, not skipped (review:studio, review:teaching-jazz).
 */
export function governingSlot(slots: readonly ChordSlot[], t: number): ChordSlot | undefined {
  const here = slots.find((s) => R.toNum(s.span[0]) <= t + 1e-9 && t + 1e-9 < R.toNum(s.span[1]));
  if (here) return here;
  let prev: ChordSlot | undefined;
  for (const s of slots) if (R.toNum(s.span[0]) <= t + 1e-9) prev = s;
  const next = slots.find((s) => R.toNum(s.span[0]) > t + 1e-9);
  const bar = Math.floor(t + 1e-9);
  const barOf = (s: ChordSlot) => Math.floor(R.toNum(s.span[0]) + 1e-9);
  if (next && barOf(next) === bar && (!prev || barOf(prev) < bar)) return next;
  if (prev && t - R.toNum(prev.span[1]) < 1 - 1e-9) return prev;
  if (next && R.toNum(next.span[0]) - t < 1 - 1e-9) return next;
  return undefined;
}

/** Slots of the chords a rule reads against: `harmony` when given, else the piece's, never the line judged. */
export function slotsFor(n: Normalized, harmony: TrackRef | undefined, exclude?: TrackRef): ChordSlot[] {
  if (harmony) {
    const es = selectTrack(n, harmony);
    if (es.length > 0) {
      const sym = heardSymbols(es);
      return chordSlots(sym.length > 0 ? sym : es.filter((e) => e.chordSymbol === undefined), {
        bass: pitched(n.all),
      });
    }
  }
  if (!exclude) return harmonySlots(n);
  const out = new Set(selectTrack(n, exclude).map((e) => e.id));
  const keep = n.all.filter((e) => !out.has(e.id));
  // Only symbols heard as chords: the right names on a silent chords line over a `rootNotes()` bass are no chords
  // (build-author-J5b: `allowed-tensions` said "done" with the chords at `.gain(0)`).
  const sym = heardSymbols(keep);
  if (sym.length > 0) return chordSlots(sym, { bass: pitched(keep) });
  const chordsTrack = tracksOfRole(n, "chords").flatMap((t) =>
    (n.byTrack[t] ?? []).filter((e) => !out.has(e.id)),
  );
  return chordSlots(chordsTrack, { bass: pitched(keep) });
}
/** Accented attacks of a line, one per onset: a kick or snare, a bass note, or a hit at 0.9 of the line's loudest. */
export function accentsOf(events: readonly NEvent[], opts: { all?: boolean } = {}): number[] {
  const peak = events.reduce((m, e) => Math.max(m, e.gain), 0);
  const gains = new Set(events.map((e) => Math.round(e.gain * 1000)));
  const out: number[] = [];
  for (const e of events) {
    const kickOrSnare = e.drum === "kick" || e.drum === "snare";
    const loud = gains.size > 1 && e.gain >= 0.9 * peak - EPS;
    if (opts.all || kickOrSnare || loud) out.push(at(e));
  }
  return uniqSorted(out);
}

/** A chord as content-kit's `VoicedChord` (root, 3rd, 5th, 7th or 6th, 9th, 13th as pitch classes). */
export function voicedChordOf(c: ChordId): VoicedChord {
  const rels = new Set(chordPcs(c).map((x) => mod12(x - c.rootPc)));
  const pick = (...xs: number[]) => xs.find((x) => rels.has(x));
  const third = pick(4, 3, 5) ?? 4;
  const fifth = pick(7, 6, 8) ?? 7;
  const seventh = pick(10, 11, 9) ?? 10;
  const dominant = seventh === 10 && third === 4;
  const ninth = c.quality.includes("b9") ? 1 : c.quality.includes("#9") ? 3 : 2;
  return {
    root: c.rootPc,
    third: mod12(c.rootPc + third),
    fifth: mod12(c.rootPc + fifth),
    seventh: mod12(c.rootPc + seventh),
    ninth: mod12(c.rootPc + ninth),
    ...(dominant ? { thirteenth: mod12(c.rootPc + 9) } : {}),
  };
}
// --- walking bass ----------------------------------------------------------------------------------------------

export interface WalkingBassBar {
  bar: number;
  /** An attack on every quarter, and nothing else (with `skips`, also an eighth just before a beat). */
  quarters: boolean;
  rootOnOne: boolean;
  chordToneOnThree: boolean;
  /** Beat 4 into the next bar's beat 1 (the last bar has none). */
  approach: { fromMidi: number; toMidi: number; semis: number } | null;
  /** How many different notes the bar's beats play (a walk moves: a line of one repeated note has 1). */
  distinct: number;
}
/** Walking bass bar by bar (J3.L04, J4.L02, JC2; content-kit `walking-bass`): read on the quarter positions. */
export function walkingBassView(
  n: Normalized,
  ctx: Ctx & { bass?: TrackRef; harmony?: TrackRef; changes?: readonly string[]; skips?: boolean },
): WalkingBassBar[] | NotBuilt {
  const bassRef = ctx.bass ?? "@bass";
  const bass = pitched(selectTrack(n, bassRef));
  const slots = slotsFor(n, ctx.harmony ?? "@chords", bassRef);
  const units = METERS[ctx.meter].unitsPerBar;
  const bars = barCount(n, ctx);
  const noteAt = (t: number) =>
    bass.filter((e) => Math.abs(at(e) - t) < EPS).sort((a, b) => a.midi - b.midi)[0];
  const out: WalkingBassBar[] = [];
  for (let b = 0; b < bars; b++) {
    const inBar = uniqSorted(bass.filter((e) => Math.floor(at(e) + EPS) === b).map(at));
    const beats = Array.from({ length: units }, (_, i) => b + i / units);
    const everyBeat = beats.every((t) => inBar.some((x) => Math.abs(x - t) < EPS));
    const extras = inBar.filter((x) => !beats.some((t) => Math.abs(x - t) < EPS));
    const skipOk = (x: number) => {
      const inBeat = (x - b) * units;
      return (
        Math.abs(inBeat - Math.floor(inBeat) - 0.5) < 0.2 ||
        Math.abs(inBeat - Math.floor(inBeat) - 2 / 3) < 0.05
      );
    };
    const quarters = everyBeat && (extras.length === 0 || (!!ctx.skips && extras.every(skipOk)));
    const one = noteAt(b);
    const chord1 = chordAt(slots, ctx.changes, b);
    const three = noteAt(b + Math.floor(units / 2) / units);
    const chord3 = chordAt(slots, ctx.changes, b + Math.floor(units / 2) / units);
    const last = [...bass.filter((e) => Math.floor(at(e) + EPS) === b)].sort((x, y) => at(y) - at(x))[0];
    const four = noteAt(b + (units - 1) / units) ?? (ctx.skips ? last : undefined);
    const next = b + 1 < bars ? noteAt(b + 1) : undefined;
    const onBeats = beats.map(noteAt).filter((e): e is NonNullable<typeof e> => e !== undefined);
    out.push({
      bar: b + 1,
      distinct: new Set(onBeats.map((e) => e.midi)).size,
      quarters,
      rootOnOne: !!one && !!chord1 && mod12(one.midi) === chord1.rootPc,
      chordToneOnThree: !!three && !!chord3 && pcsOf(chord3).has(mod12(three.midi)),
      approach:
        four && next
          ? { fromMidi: four.midi, toMidi: next.midi, semis: Math.abs(next.midi - four.midi) }
          : null,
    });
  }
  return out;
}

// --- comping ---------------------------------------------------------------------------------------------------

export interface CompingBar {
  bar: number;
  onsets: Rat[];
  /** "charleston", "push", "on-the-beat", "other" (an empty bar is "rest"). */
  figure: string;
}
/** Where an onset sits in its beat: "beat", "and" (the straight or swung off-beat 8th), or "other". */
function placeInBeat(x: number, units: number): { beat: number; place: "beat" | "and" | "other" } {
  const v = x * units;
  const beat = Math.floor(v + EPS);
  const f = v - beat;
  if (f < 0.02 || f > 0.98) return { beat: f > 0.98 ? beat + 1 : beat, place: "beat" };
  // A straight "and" sits at .5 of the beat, a swung one up to 2/3 (and a little beyond at a heavy swing).
  if (f > 0.4 && f < 0.75) return { beat, place: "and" };
  return { beat, place: "other" };
}
/** Comping rhythm bar by bar (J3.L03): the Charleston (1, the "and" of 2) and pushes (the "and" of 4, tied over). */
export function compingView(n: Normalized, ctx: Ctx & { track?: TrackRef }): CompingBar[] | NotBuilt {
  const units = METERS[ctx.meter].unitsPerBar;
  const events = selectTrack(n, ctx.track ?? "@chords");
  const starts = uniqSorted(events.map(at));
  const out: CompingBar[] = [];
  for (let b = 0; b < barCount(n, ctx); b++) {
    const xs = starts.filter((x) => Math.floor(x + EPS) === b);
    const places = xs.map((x) => placeInBeat(x - b, units));
    const has = (beat: number, place: "beat" | "and") =>
      places.some((p) => p.beat === beat && p.place === place);
    const nextDownbeat = starts.some((x) => Math.abs(x - (b + 1)) < EPS);
    let figure = "other";
    if (xs.length === 0) figure = "rest";
    else if (units === 4 && has(3, "and") && !nextDownbeat) figure = "push";
    else if (units === 4 && xs.length === 2 && has(0, "beat") && has(1, "and")) figure = "charleston";
    else if (places.every((p) => p.place === "beat")) figure = "on-the-beat";
    out.push({
      bar: b + 1,
      onsets: events.filter((e) => R.floor(e.onset) === b).map((e) => e.onset),
      figure,
    });
  }
  return out;
}

// --- reharmonisation and contrafact ----------------------------------------------------------------------------

export interface ReharmView {
  /** The melody is the given one, note for note (true when no melody is given to compare). */
  melodyKept: boolean;
  devices: { device: string; bar: number; was: string; now: string }[];
}
/** The jazz devices a reharmonisation adds (`device-count`'s detector) where the chord differs from `reference`. */
export const JAZZ_DEVICE_NAMES = ["tritone sub", "secondary ii–V", "backdoor", "diminished passing"] as const;
/** Reharmonisation against the original (J5.L04, JC4): the melody identical; each device named with its bar. */
export function reharmView(
  n: Normalized,
  ctx: Ctx & {
    reference: readonly string[];
    code?: string;
    melody?: readonly { onset: Rat; midi: number }[];
    melodyTrack?: TrackRef;
  },
): ReharmView | NotBuilt {
  const slots = harmonySlots(n);
  const shift = ctx.pickup ? 1 : 0;
  const devices = detectDevices(n, ctx)
    .filter((d) => (JAZZ_DEVICE_NAMES as readonly string[]).includes(d.device))
    .map((d) => {
      const b = d.bar - (ctx.pickup ? 0 : 1);
      const was = changeAt(ctx.reference, b);
      const now = chordAt(slots, undefined, b + 0.0) ?? null;
      // The device's own chord: the first chord of its bar that differs from the reference's.
      const inBar = slots
        .filter((s) => R.floor(s.span[0]) === b)
        .map(chordOfSlot)
        .filter((c): c is ChordId => !!c);
      const changed = inBar.find((c) => !was || c.rootPc !== was.rootPc || c.quality !== was.quality) ?? now;
      return {
        device: d.device,
        bar: d.bar,
        was: was ? toCode(was) : "",
        now: changed ? toCode(changed) : "",
        differs: !!changed && (!was || changed.rootPc !== was.rootPc || changed.quality !== was.quality),
      };
    })
    .filter((d) => d.differs)
    .map(({ differs: _d, ...rest }) => rest);
  let melodyKept = true;
  if (ctx.melody) {
    const mel = pitched(selectTrack(n, ctx.melodyTrack ?? "@melody"));
    const key = (o: Rat, m: number) => `${R.toNum(o).toFixed(4)}:${m}`;
    const want = new Set(ctx.melody.map((x) => key(R.add(x.onset, [shift, 1]), x.midi)));
    const got = new Set(mel.map((e) => key(e.onset, e.midi)));
    melodyKept = want.size === got.size && [...want].every((k) => got.has(k));
  }
  return { melodyKept, devices };
}
export interface ContrafactView {
  /** Share of bars whose chord (triad core, on the bar's first chord) is the model's. */
  changesRatio: number;
  /** Share of the melody's bars that repeat the model's head (same rhythm, same intervals from the same degree). */
  sharedMelodyRatio: number;
  /** 1-based bars that differ from the model's changes, and bars that repeat the model's head. */
  changedBars: number[];
  sharedBars: number[];
}
/** The "same bar" of two melodies: onsets equal within a 16th and the same intervals, transposition-invariant. */
function sameBar(
  a: readonly { t: number; midi: number }[],
  b: readonly { t: number; midi: number }[],
): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++)
    if (Math.abs((a[i] as { t: number }).t - (b[i] as { t: number }).t) > 1 / 16 + EPS) return false;
  for (let i = 1; i < a.length; i++)
    if (
      (a[i] as { midi: number }).midi - (a[i - 1] as { midi: number }).midi !==
      (b[i] as { midi: number }).midi - (b[i - 1] as { midi: number }).midi
    )
      return false;
  // The same degree: the first notes are the same pitch class (the head moved to another key is still the head
  // when the changes moved with it, so the caller compares in the model's key).
  return mod12((a[0] as { midi: number }).midi - (b[0] as { midi: number }).midi) === 0;
}
/** A contrafact against its model (JC3): the form and changes kept, a melody that is not the model's. */
export function contrafactView(
  n: Normalized,
  ctx: Ctx & {
    changes: readonly string[];
    model?: readonly { onset: Rat; dur?: Rat; midi: number }[];
    melody?: TrackRef;
    harmony?: TrackRef;
  },
): ContrafactView | NotBuilt {
  const melRef = ctx.melody ?? "@melody";
  const slots = slotsFor(n, ctx.harmony ?? "@chords", melRef);
  const bars = barCount(n, ctx);
  const shift = ctx.pickup ? 1 : 0;
  const changedBars: number[] = [];
  let kept = 0;
  let judged = 0;
  for (let b = shift; b < bars; b++) {
    const want = changeAt(ctx.changes, b - shift);
    const s = slots.find((x) => R.floor(x.span[0]) <= b && b < R.toNum(x.span[1]) - EPS);
    const got = s ? chordOfSlot(s) : null;
    if (!want) continue;
    judged++;
    const ok =
      !!got &&
      triadCore(got).rootPc === triadCore(want).rootPc &&
      triadCore(got).quality === triadCore(want).quality;
    if (ok) kept++;
    else changedBars.push(b - shift + 1);
  }
  const mel = pitched(selectTrack(n, melRef));
  const sharedBars: number[] = [];
  let melBars = 0;
  if (ctx.model && ctx.model.length > 0) {
    const modelBars = new Map<number, { t: number; midi: number }[]>();
    for (const x of ctx.model) {
      const t = R.toNum(x.onset);
      const b = Math.floor(t + EPS);
      modelBars.set(b, [...(modelBars.get(b) ?? []), { t: t - b, midi: x.midi }]);
    }
    for (let b = shift; b < bars; b++) {
      const mine = mel
        .filter((e) => Math.floor(at(e) + EPS) === b)
        .map((e) => ({ t: at(e) - b, midi: e.midi }))
        .sort((x, y) => x.t - y.t || x.midi - y.midi);
      if (mine.length === 0) continue;
      melBars++;
      const theirs = (modelBars.get(b - shift) ?? []).sort((x, y) => x.t - y.t || x.midi - y.midi);
      if (sameBar(mine, theirs)) sharedBars.push(b - shift + 1);
    }
  }
  return {
    changesRatio: judged ? kept / judged : 0,
    sharedMelodyRatio: melBars ? sharedBars.length / melBars : 0,
    changedBars,
    sharedBars,
  };
}

// --- interlock --------------------------------------------------------------------------------------------------

export interface InterlockView {
  /** Per 16th step of the bar, which parts attack (summed over one pass of the loop). */
  grid: string[][];
  /** Share of the played places (beat 1 left out) where exactly one part attacks: the machine's gears. */
  interlock: number;
  /** Share of the played places (beat 1 left out) where two or more parts attack. */
  shared: number;
  /** Places of the 16 played by any part. */
  cover: number;
  /** Places each part plays a bar on its own (its own gear), the fewest bar of the pass. */
  own: Record<string, number>;
}
/** Interlock between parts (R1.L04): bass, clav and guitar as one machine, read on the 16th grid of one bar. */
export function interlockView(
  n: Normalized,
  ctx: Ctx & { tracks: readonly TrackRef[] },
): InterlockView | NotBuilt {
  const steps = METERS[ctx.meter].unitsPerBar * 4;
  const parts = ctx.tracks.map((ref) => ({ ref, events: selectTrack(n, ref) }));
  const bars = barCount(n, ctx);
  const perBar = (events: readonly NEvent[], b: number): Set<number> => {
    const s = new Set<number>();
    for (const e of events) {
      if (Math.floor(at(e) + EPS) !== b) continue;
      const k = (at(e) - b) * steps;
      if (nearInt(k, 0.15)) s.add(Math.round(k) % steps);
    }
    return s;
  };
  const grid: string[][] = Array.from({ length: steps }, () => []);
  let sharedN = 0;
  let playedN = 0;
  const cover = new Set<number>();
  const own: Record<string, number> = {};
  for (let b = 0; b < bars; b++) {
    const sets = parts.map((p) => ({ ref: p.ref, s: perBar(p.events, b) }));
    for (let k = 0; k < steps; k++) {
      const who = sets.filter((x) => x.s.has(k)).map((x) => x.ref);
      if (b === 0) grid[k] = who;
      if (who.length > 0) cover.add(k);
      if (k === 0 || who.length === 0) continue;
      playedN++;
      if (who.length >= 2) sharedN++;
    }
    for (const x of sets) {
      const mine = [...x.s].filter((k) => k !== 0 && sets.every((y) => y === x || !y.s.has(k))).length;
      own[x.ref] = Math.min(own[x.ref] ?? Number.POSITIVE_INFINITY, mine);
    }
  }
  for (const p of parts) own[p.ref] ??= 0;
  return {
    grid,
    interlock: playedN ? (playedN - sharedN) / playedN : 0,
    shared: playedN ? sharedN / playedN : 0,
    cover: cover.size,
    own,
  };
}

// --- odd meter, hemiola, polyrhythm, polymeter -----------------------------------------------------------------

export interface GroupingView {
  meter: MeterId;
  groups: number[];
  /** Per bar, whether the accents fall on every group start and nowhere else on the bar's grid. */
  onStarts: number[];
  /** Per bar, the accents found, in steps of the grid (an eighth in /8 meters, a quarter in 5/4). */
  accents: number[][];
}
/** Odd-meter grouping (R2.L01–L02): the accents on the group starts and nowhere else. */
export function groupingView(
  n: Normalized,
  ctx: Ctx & { track?: TrackRef; groups: readonly number[] },
): GroupingView | NotBuilt {
  const total = ctx.groups.reduce((a, b) => a + b, 0);
  const starts: number[] = [];
  let acc = 0;
  for (const g of ctx.groups) {
    starts.push(acc);
    acc += g;
  }
  const ref = ctx.track ?? "@drums";
  const events = selectTrack(n, ref);
  const isBass = ref === "@bass" || n.roles.bass === ref;
  const onStarts: number[] = [];
  const accents: number[][] = [];
  for (let b = 0; b < barCount(n, ctx); b++) {
    const inBar = events.filter((e) => Math.floor(at(e) + EPS) === b);
    const acc2 = accentsOf(inBar, { all: isBass || inBar.every((e) => e.midi !== null) })
      .map((x) => (x - b) * total)
      .filter((k) => nearInt(k, 0.05))
      .map((k) => Math.round(k));
    const set = new Set(acc2);
    accents.push([...set].sort((a, c) => a - c));
    const ok = starts.every((s) => set.has(s)) && [...set].every((k) => starts.includes(k));
    onStarts.push(ok ? 1 : 0);
  }
  return { meter: ctx.meter, groups: [...ctx.groups], onStarts, accents };
}
/** Hemiola (R2.L03): per bar of six pulses, whether the accents group it 3+3 or 2+2+2. */
export function hemiolaView(
  n: Normalized,
  ctx: Ctx & { track?: TrackRef },
): ("3+3" | "2+2+2" | null)[] | NotBuilt {
  const events = ctx.track ? selectTrack(n, ctx.track) : n.all;
  const out: ("3+3" | "2+2+2" | null)[] = [];
  for (let b = 0; b < barCount(n, ctx); b++) {
    const inBar = events.filter((e) => Math.floor(at(e) + EPS) === b);
    const gains = new Set(inBar.map((e) => Math.round(e.gain * 1000)));
    const sixths = (xs: readonly number[]) =>
      [
        ...new Set(
          xs
            .map((x) => (x - b) * 6)
            .filter((k) => nearInt(k, 0.05))
            .map((k) => Math.round(k)),
        ),
      ]
        .sort((a, c) => a - c)
        .join(",");
    const read = (key: string) => (key === "0,3" ? "3+3" : key === "0,2,4" ? "2+2+2" : null);
    const accented = read(
      sixths(
        accentsOf(inBar, {
          all: gains.size <= 1 && inBar.every((e) => e.drum === undefined || e.drum === inBar[0]?.drum),
        }),
      ),
    );
    // W7 gate (review:teaching-rest): a grouping written with velocities (`.velocity("[1 0 0 .8 0 0]")`) leaves
    // only the group starts heard, at two levels; those attacks ARE the grouping, accented or not.
    const heardOnsets = uniqSorted(inBar.filter((e) => e.gain > 0).map(at));
    out.push(accented ?? (heardOnsets.length <= 3 ? read(sixths(heardOnsets)) : null));
  }
  return out;
}
export interface PolyrhythmBar {
  /** 1-based first bar of the span. */
  bar: number;
  /** Evenly spaced attacks of each part in the span (0 when its attacks are not evenly spaced). */
  a: number;
  b: number;
  /** Both parts sound in this span with the asked counts. */
  together: boolean;
}
/** Evenly spaced attacks over a span starting at 0: k when the onsets are i·span/k, else 0. */
function evenCount(xs: readonly number[], span: number): number {
  const k = xs.length;
  if (k === 0) return 0;
  return xs.every((x, i) => Math.abs(x - (i * span) / k) < 1e-3) ? k : 0;
}
/** Simultaneous polyrhythm (R2.L04, RC2): both pulses in the SAME bars, evenly spaced (w7plan A6). */
export function polyrhythmView(
  n: Normalized,
  ctx: Ctx & { a: TrackRef; b: TrackRef; ratio?: readonly [number, number]; span?: number },
): PolyrhythmBar[] | NotBuilt {
  const span = Math.max(1, ctx.span ?? 1);
  const A = uniqSorted(selectTrack(n, ctx.a).map(at));
  const B = uniqSorted(selectTrack(n, ctx.b).map(at));
  const out: PolyrhythmBar[] = [];
  for (let b = 0; b + span <= barCount(n, ctx) + EPS; b += span) {
    const xa = A.filter((x) => x >= b - EPS && x < b + span - EPS).map((x) => x - b);
    const xb = B.filter((x) => x >= b - EPS && x < b + span - EPS).map((x) => x - b);
    const ka = evenCount(xa, span);
    const kb = evenCount(xb, span);
    const ratio = ctx.ratio;
    out.push({
      bar: b + 1,
      a: ka,
      b: kb,
      together: ka > 0 && kb > 0 && (!ratio || (ka === ratio[0] && kb === ratio[1])) && ka !== kb,
    });
  }
  return out;
}
/** The smallest period, in steps of `grid` a bar, after which the onsets (and what plays) repeat. */
function patternPeriod(events: readonly NEvent[], grid: number, bars: number): number | null {
  const total = grid * bars;
  const cells = new Map<number, string>();
  for (const e of events) {
    const k = at(e) * grid;
    if (!nearInt(k, 0.01)) return null;
    const i = Math.round(k);
    if (i < 0 || i >= total) continue;
    cells.set(i, [cells.get(i) ?? "", String(e.midi ?? e.s ?? "x")].sort().join("|"));
  }
  if (cells.size === 0) return null;
  for (let p = 1; p <= total / 2; p++) {
    let ok = true;
    for (let i = 0; i + p < total && ok; i++)
      if ((cells.get(i) ?? "") !== (cells.get(i + p) ?? "")) ok = false;
    if (ok) return p;
  }
  return null;
}
/** Polymeter (R2.L05): the cycle length of `a` (in 48ths of a bar) and the bars until it lines up with the bar. */
export function polymeterView(
  n: Normalized,
  ctx: Ctx & { a: TrackRef },
): { cycleSteps: number; periodBars: number } | NotBuilt {
  const grid = 48;
  const p = patternPeriod(selectTrack(n, ctx.a), grid, barCount(n, ctx));
  if (p === null) return { cycleSteps: 0, periodBars: 0 };
  const g = (x: number, y: number): number => (y === 0 ? x : g(y, x % y));
  return { cycleSteps: p, periodBars: p / g(p, grid) };
}
/** Bars a line takes to repeat (1 when it keeps the bar), read on the 48ths grid; `null` when it never repeats. */
export function barPeriodOf(n: Normalized, ref: TrackRef, bars: number): number | null {
  const p = patternPeriod(selectTrack(n, ref), 48, bars);
  if (p === null) return null;
  const g = (x: number, y: number): number => (y === 0 ? x : g(y, x % y));
  return p / g(p, 48);
}

// --- clave alignment -------------------------------------------------------------------------------------------

export interface ClaveAlignmentWindow {
  /** 1-based first bar of the two-bar window. */
  bar: number;
  /** The part's onsets on the window's 16 eighths that meet a clave stroke as the clave is written. */
  shared: number;
  /** The same count against the clave with its two bars swapped (a part that faces the other way meets more). */
  crossed: number;
  /** The part's two bars are not the same. */
  barsDiffer: boolean;
}
/** Alignment to the clave (R3.L04, RC2): per two-bar window, the part's onsets shared with clave strokes. */
export function claveAlignmentView(
  n: Normalized,
  ctx: Ctx & { track: TrackRef; clave?: TrackRef },
): ClaveAlignmentWindow[] | NotBuilt {
  const part = selectTrack(n, ctx.track);
  const cv = claveView(n, { ...ctx, track: ctx.clave ?? "perc" });
  const clave = cv.first ? claveSteps(cv.first.type, cv.first.direction) : null;
  const out: ClaveAlignmentWindow[] = [];
  for (const w of cv.windows) {
    const b = w.bar - 1;
    const one = onGrid(part, b, 8);
    const two = onGrid(part, b + 1, 8);
    const steps = [...one, ...two.map((s) => s + 8)];
    const strokes = clave ?? w.steps;
    const swapped = strokes.map((s) => (s + 8) % 16);
    out.push({
      bar: w.bar,
      shared: steps.filter((s) => strokes.includes(s)).length,
      crossed: steps.filter((s) => swapped.includes(s)).length,
      barsDiffer: one.join(",") !== two.join(","),
    });
  }
  return out;
}

// --- sound and arrangement (Build) -------------------------------------------------------------------------------

/** Neutral values of the sound controls: at these a control changes nothing you can hear (superdough defaults). */
export const NEUTRAL_CONTROL: Readonly<Record<string, number>> = {
  distort: 0,
  shape: 0,
  crush: 0,
  coarse: 0,
  room: 0,
  delay: 0,
  vib: 0,
  vibmod: 0,
  phaserrate: 0,
  phaserdepth: 0,
  tremolosync: 0,
  tremolodepth: 0,
  lprate: 0,
  lpdepth: 0,
  fmi: 0,
  lpenv: 0,
  detune: 0,
  unison: 1,
  pan: 0.5,
};
/** The effect of a sound control (A1.L05–L07): the values the line sets and whether any is heard. */
export function soundControlView(
  n: Normalized,
  ctx: Ctx & { track: TrackRef; control: string },
): { control: string; changes: string; values: number[]; heard: boolean } | NotBuilt {
  const events = selectTrack(n, ctx.track);
  const values = events
    .map((e) => e.controls?.[ctx.control])
    .map((v) => (typeof v === "number" ? v : typeof v === "string" ? Number(v.split(",")[0]) : Number.NaN))
    .filter((v) => Number.isFinite(v));
  const neutral = NEUTRAL_CONTROL[ctx.control];
  const heard = values.some((v) => (neutral === undefined ? true : Math.abs(v - neutral) > 1e-9));
  const shown = [...new Set(values.map((v) => Number(v.toFixed(3))))].slice(0, 4);
  return {
    control: ctx.control,
    values,
    heard,
    changes:
      values.length === 0
        ? "not set"
        : heard
          ? `set to ${shown.join(", ")}`
          : `set to ${shown.join(", ")}, where the sound already is`,
  };
}
/** A counter-melody's independence (A2.L03): contrary, oblique and held-against moves out of the tune's moves. */
export function counterMelodyView(
  n: Normalized,
  ctx: Ctx & { melody: TrackRef; counter: TrackRef },
): { independence: number; doubledBeats: number; moves: number } | NotBuilt {
  const tune = pitched(selectTrack(n, ctx.melody)).sort((a, b) => R.cmp(a.onset, b.onset) || b.midi - a.midi);
  const counter = pitched(selectTrack(n, ctx.counter)).sort(
    (a, b) => R.cmp(a.onset, b.onset) || b.midi - a.midi,
  );
  // The line's pitch at `t`: its latest note started by then (a line moves across a rest as well as by step);
  // `sounding` asks that the note still sound there (doubling is heard only while both sound).
  const pitchAt = (
    line: readonly (NEvent & { midi: number })[],
    t: number,
    sounding = false,
  ): number | null => {
    let cur: (NEvent & { midi: number }) | undefined;
    for (const e of line) {
      if (at(e) > t + EPS) break;
      if (!sounding || at(e) + R.toNum(e.clipDur ?? e.dur) > t + EPS) cur = e;
    }
    return cur ? cur.midi : null;
  };
  // Every place either line starts a note: what each line does from the place before.
  const times = uniqSorted([...tune, ...counter].map(at));
  let moves = 0;
  let independent = 0;
  for (let i = 1; i < times.length; i++) {
    const t0 = times[i - 1] as number;
    const t1 = times[i] as number;
    const a0 = pitchAt(tune, t0);
    const a1 = pitchAt(tune, t1);
    const b0 = pitchAt(counter, t0);
    const b1 = pitchAt(counter, t1);
    if (a0 === null || a1 === null || b0 === null || b1 === null) continue;
    const da = Math.sign(a1 - a0);
    const db = Math.sign(b1 - b0);
    const tuneStarts = tune.some((e) => Math.abs(at(e) - t1) < EPS);
    const counterStarts = counter.some((e) => Math.abs(at(e) - t1) < EPS);
    if (!tuneStarts && !counterStarts) continue;
    moves++;
    // Contrary motion, oblique motion (one line holds or repeats while the other moves), or the counter moving
    // while the tune holds: the counter is its own line there. Parallel and similar motion are not.
    if ((da !== 0 && db !== 0 && da !== db) || (da === 0) !== (db === 0) || (!tuneStarts && counterStarts))
      independent++;
  }
  // Beats where the counter doubles the tune (the same pitch class sounding at the beat).
  const beat = 1 / METERS[ctx.meter].unitsPerBar;
  let run = 0;
  let longest = 0;
  for (let t = 0; t < barCount(n, ctx) - EPS; t += beat) {
    const a = pitchAt(tune, t, true);
    const b = pitchAt(counter, t, true);
    if (a !== null && b !== null && mod12(a - b) === 0) {
      run++;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  return { independence: moves ? independent / moves : 0, doubledBeats: longest, moves };
}
/** Sample chopping (A2.L04): the slices played (by `begin`) and their order over one pass. */
export function sampleChopView(
  n: Normalized,
  ctx: Ctx & { track?: TrackRef },
): { slices: number; order: number[]; reordered: boolean } | NotBuilt {
  const events = (ctx.track ? selectTrack(n, ctx.track) : n.all)
    .filter((e) => typeof e.controls?.begin === "number")
    .sort((a, b) => R.cmp(a.onset, b.onset));
  const begins = uniqSorted(events.map((e) => e.controls?.begin as number));
  const order = events.map((e) => begins.findIndex((b) => Math.abs(b - (e.controls?.begin as number)) < EPS));
  // One pass of the order: up to where it starts to repeat.
  let pass = order;
  for (let p = 1; p <= order.length / 2; p++)
    if (order.every((x, i) => x === order[i % p])) {
      pass = order.slice(0, p);
      break;
    }
  const reordered =
    pass.some((x, i) => i > 0 && x < (pass[i - 1] as number)) || new Set(pass).size < pass.length;
  // The number of pieces the sample is cut into, read from each piece's length (`slice`, `splice`, `chop` and
  // `begin`/`end` all set both), not the number of different pieces that play: `.slice(4, "0 1 0 3")` is cut in
  // four (build-author-A2b, A.CP). Without an `end`, the begins that play are all there is to count.
  const cut = events.reduce((m, e) => {
    const b = e.controls?.begin;
    const end = e.controls?.end;
    return typeof b === "number" && typeof end === "number" && end - b > EPS
      ? Math.max(m, Math.round(1 / (end - b)))
      : m;
  }, 0);
  return { slices: Math.max(cut, begins.length), order: pass, reordered: begins.length > 1 && reordered };
}
export interface IdiomView {
  sameTune: boolean;
  axes: string[];
}
/** The same tune in another idiom (A2.L06, AC1): two readings of one piece compared. */
export function idiomView(
  _n: Normalized,
  ctx: Ctx & { a: Normalized; b: Normalized; melody?: TrackRef },
): IdiomView | NotBuilt {
  return compareIdioms(ctx.a, ctx.b, { meter: ctx.meter, melody: ctx.melody ?? "@melody" });
}
/** The degrees and rhythm of a tune (transposition-invariant), and what an idiom changes around it. */
export function compareIdioms(
  a: Normalized,
  b: Normalized,
  o: { meter: MeterId; melody: TrackRef; tonicA?: number | null; tonicB?: number | null },
): IdiomView {
  const tuneOf = (x: Normalized) => {
    const mel = pitched(selectTrack(x, o.melody)).sort((p, q) => R.cmp(p.onset, q.onset) || q.midi - p.midi);
    const top = mel.filter((e, i) => i === 0 || !R.eq(e.onset, (mel[i - 1] as NEvent).onset));
    return top;
  };
  const ta = tuneOf(a);
  const tb = tuneOf(b);
  const startA = ta[0] ? R.floor(ta[0].onset) : 0;
  const startB = tb[0] ? R.floor(tb[0].onset) : 0;
  const shape = (
    xs: readonly (NEvent & { midi: number })[],
    start: number,
    tonic: number | null | undefined,
  ) =>
    xs.map(
      (e) =>
        `${(R.toNum(e.onset) - start).toFixed(4)}:${tonic === undefined || tonic === null ? 0 : mod12(e.midi - tonic)}`,
    );
  const intervals = (xs: readonly (NEvent & { midi: number })[]) =>
    xs.slice(1).map((e, i) => e.midi - (xs[i] as { midi: number }).midi);
  const sameRhythm =
    ta.length > 0 &&
    ta.length === tb.length &&
    ta.every(
      (e, i) => Math.abs(R.toNum(e.onset) - startA - (R.toNum((tb[i] as NEvent).onset) - startB)) < EPS,
    );
  const sameShape =
    o.tonicA !== undefined && o.tonicB !== undefined && o.tonicA !== null && o.tonicB !== null
      ? shape(ta, startA, o.tonicA).join() === shape(tb, startB, o.tonicB).join()
      : intervals(ta).join() === intervals(tb).join();
  const axes: string[] = [];
  const soundsOf = (x: Normalized) =>
    new Set(x.all.map((e) => e.s ?? (e.midi !== null ? "triangle" : "")).filter((s) => s !== ""));
  const sa = soundsOf(a);
  const sb = soundsOf(b);
  if ([...sa].some((s) => !sb.has(s)) || [...sb].some((s) => !sa.has(s))) axes.push("sounds");
  const bars = (x: Normalized) =>
    Math.max(
      1,
      x.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0),
    );
  const dens = (x: Normalized) => new Set(x.all.map((e) => R.str(e.onset))).size / bars(x);
  const da = dens(a);
  const db = dens(b);
  if (Math.abs(da - db) > 0.25 * Math.max(da, db)) axes.push("density");
  const groove = (x: Normalized) =>
    [
      ...new Set(
        x.all
          .filter((e) => e.drum !== undefined)
          .map((e) => `${R.toNum(R.frac(e.onset)).toFixed(4)}:${e.drum}`),
      ),
    ]
      .sort()
      .join();
  if (groove(a) !== groove(b)) axes.push("groove");
  const centre = (x: readonly (NEvent & { midi: number })[]) =>
    x.length ? x.reduce((s, e) => s + e.midi, 0) / x.length : 0;
  const all = (x: Normalized) => pitched(x.all);
  if (Math.abs(centre(all(a)) - centre(all(b))) > 5) axes.push("register");
  return { sameTune: sameRhythm && sameShape, axes };
}

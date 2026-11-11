// Chord segmentation and what is read from it: slots, Roman numerals, harmonic rhythm, cadences,
// progressions on the triad core, the blues form, voice leading and guide tones (exercises §3.5;
// contracts §6.6 and §6.7). Chord identity always comes from the symbol when the events carry one.
import type { CadenceType, KeySpec, MeterId, NEvent, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import type { ChordId, Pc, RomanNumeral, SchemaDef } from "@oak/theory";
import {
  chordPcs,
  degreeOf,
  formatRN,
  identifyChord,
  parseChordSymbol,
  parseRN,
  rnToChord,
  romanOf,
  SCHEMAS,
  toLeadSheet,
  triadCore,
} from "@oak/theory";
import { mod12, pitched, ratKey, sounding } from "./events.ts";
import type { Note } from "./melody.ts";

export interface ChordSlot {
  /** [start, end) in cycles. */
  span: [Rat, Rat];
  /** `null` when the sounding notes name no chord. */
  chord: ChordId | null;
  /** The symbol as written, when the events carry one. */
  symbol?: string;
  /** Sounding MIDI notes at the slot start, ascending. */
  midis: number[];
  /** Lowest sounding MIDI across the pitched tracks given as `bass`. */
  bassMidi?: number;
  ambiguous?: ChordId[];
  ids: string[];
}

const pcsOfMidis = (midis: readonly number[]): number[] => [...new Set(midis.map(mod12))].sort((a, b) => a - b);

/** Pitch classes of a slot: from its chord when it has one, else from its sounding notes. */
export function slotPcs(slot: ChordSlot): number[] {
  return slot.chord ? [...chordPcs(slot.chord)] : pcsOfMidis(slot.midis);
}
/** The slot sounding at `at`. */
export function slotAt(slots: readonly ChordSlot[], at: Rat): ChordSlot | undefined {
  return slots.find((s) => R.lte(s.span[0], at) && R.lt(at, s.span[1]));
}

function withBass(chord: ChordId | null, bassMidi: number | undefined): ChordId | null {
  if (!chord || bassMidi === undefined) return chord;
  const bassPc = mod12(bassMidi) as Pc;
  if (bassPc === chord.bassPc) return chord;
  const { bass: _bass, ...rest } = chord;
  return { ...rest, bassPc };
}

/**
 * Chord slots of a chord track.
 *  1. Events with a `chordSymbol` (from `chord()` or the voicing shim): one slot per run of equal symbols.
 *  2. Otherwise: segments where the sounding pitch-class set is constant; equal neighbours are merged,
 *     segments shorter than `minDur` (default 1/8 bar) are dropped as passing, and `identifyChord` names them.
 * The bass is the lowest note sounding at the slot start across `bass` (default: the chord events), so a
 * separate bass track sets the inversion.
 */
export function chordSlots(events: readonly NEvent[], o: { bass?: readonly NEvent[]; minDur?: Rat } = {}): ChordSlot[] {
  const bassPool = o.bass ?? events;
  const lowestAt = (at: Rat): number | undefined => {
    const s = sounding(bassPool, at);
    return s.length === 0 ? undefined : Math.min(...s.map((e) => e.midi));
  };
  const slots: ChordSlot[] = [];
  const symbolic = events.filter((e) => e.chordSymbol !== undefined);
  if (symbolic.length > 0) {
    const sorted = [...symbolic].sort((a, b) => R.cmp(a.onset, b.onset));
    for (const e of sorted) {
      const end = R.add(e.onset, e.dur);
      const last = slots[slots.length - 1];
      if (last && last.symbol === e.chordSymbol && R.lte(e.onset, last.span[1])) {
        last.span[1] = R.max(last.span[1], end);
        if (R.eq(e.onset, last.span[0]) && e.midi !== null) last.midis.push(e.midi);
        last.ids.push(e.id);
        continue;
      }
      if (last && R.lt(e.onset, last.span[1])) last.span[1] = e.onset;
      slots.push({
        span: [e.onset, end],
        chord: parseChordSymbol(e.chordSymbol as string),
        symbol: e.chordSymbol as string,
        midis: e.midi === null ? [] : [e.midi],
        ids: [e.id],
      });
    }
  } else {
    const notes = pitched(events);
    const cuts = new Map<string, Rat>();
    for (const e of notes) {
      cuts.set(ratKey(e.onset), e.onset);
      const end = R.add(e.onset, e.dur);
      cuts.set(ratKey(end), end);
    }
    const points = [...cuts.values()].sort(R.cmp);
    const minDur = o.minDur ?? rat(1, 8);
    for (let i = 0; i + 1 < points.length; i++) {
      const [from, to] = [points[i] as Rat, points[i + 1] as Rat];
      const here = sounding(notes, from);
      const pcs = pcsOfMidis(here.map((e) => e.midi));
      if (pcs.length < 2) continue;
      const last = slots[slots.length - 1];
      if (last && R.eq(last.span[1], from) && pcsOfMidis(last.midis).join() === pcs.join()) {
        last.span[1] = to;
        continue;
      }
      slots.push({ span: [from, to], chord: null, midis: here.map((e) => e.midi).sort((a, b) => a - b), ids: here.map((e) => e.id) });
    }
    for (let i = slots.length - 1; i >= 0; i--) if (R.lt(R.sub((slots[i] as ChordSlot).span[1], (slots[i] as ChordSlot).span[0]), minDur)) slots.splice(i, 1);
  }
  for (const slot of slots) {
    slot.midis.sort((a, b) => a - b);
    const bass = lowestAt(slot.span[0]);
    if (bass !== undefined) slot.bassMidi = bass;
    if (slot.symbol === undefined && slot.midis.length > 0) {
      const found = identifyChord(slot.midis, bass === undefined ? {} : { bassPc: mod12(bass) as Pc });
      const [best, ...others] = found;
      slot.chord = best ? { rootPc: best.rootPc, root: best.root, quality: best.quality, bassPc: best.bassPc, ext: best.ext } : null;
      if (best && others.some((c) => c.fit === best.fit)) slot.ambiguous = others.filter((c) => c.fit === best.fit);
    }
    slot.chord = withBass(slot.chord, slot.bassMidi);
  }
  return slots;
}

/** Slots built from chord symbols alone, one per bar or per given span (staged dictation answers). */
export function slotsFromChords(chords: readonly (ChordId | null)[], spans: readonly [Rat, Rat][]): ChordSlot[] {
  return chords.map((chord, i) => ({ span: spans[i] ?? [rat(i), rat(i + 1)], chord, midis: [], ids: [] }));
}

/** The Roman numeral of every slot (`null` where the slot has no chord). */
export function slotRomans(slots: readonly ChordSlot[], key: KeySpec): (RomanNumeral | null)[] {
  return slots.map((s, i) => (s.chord ? romanOf(s.chord, key, slots[i + 1]?.chord ?? undefined) : null));
}
export function romanText(rn: RomanNumeral | null): string {
  return rn ? formatRN(rn) : "?";
}

/** Chord changes per bar over `bars` bars (the first chord of the piece counts as a change). */
export function harmonicRhythm(slots: readonly ChordSlot[], bars: number): number[] {
  const out = Array.from({ length: bars }, () => 0);
  for (const s of slots) {
    const b = R.floor(s.span[0]);
    if (b >= 0 && b < bars) (out[b] as number)++;
  }
  return out;
}

/** The chord sounding at the start of every bar; a bar keeps the previous chord when nothing changes. */
export function chordPerBar(slots: readonly ChordSlot[], bars: number): (ChordId | null)[] {
  return Array.from({ length: bars }, (_, b) => slotAt(slots, rat(b))?.chord ?? null);
}

type Core = { rootPc: number; quality: string };
const coreOf = (c: ChordId): Core => triadCore(c);
const sameCore = (a: Core | null, b: Core | null): boolean => !!a && !!b && a.rootPc === b.rootPc && a.quality === b.quality;

/** Roman numerals (Oak dialect) to chords in a key; `null` where a numeral does not parse. */
export function chordsOfRomans(rns: readonly string[], key: KeySpec): (ChordId | null)[] {
  return rns.map((text) => {
    const rn = parseRN(text, key);
    return rn ? rnToChord(rn, key) : null;
  });
}

export interface ProgressionMatch {
  /** Leading chords (or bars) that follow the loop. */
  matched: number;
  /** Length of one turn of the loop. */
  length: number;
  /** Where in the loop the answer starts; 0 = as written. */
  rotation: number;
}
/**
 * How far a chord sequence follows a loop, compared on the triad core (root pitch class + triad quality)
 * so sevenths and extensions pass (contracts §6.6). With `allowRotation` the best starting point wins.
 */
export function matchProgression(
  got: readonly (ChordId | null)[],
  expected: readonly (ChordId | null)[],
  allowRotation: boolean,
): ProgressionMatch {
  const want = expected.map((c) => (c ? coreOf(c) : null));
  const have = got.map((c) => (c ? coreOf(c) : null));
  let best: ProgressionMatch = { matched: 0, length: want.length, rotation: 0 };
  if (want.length === 0) return best;
  for (let r = 0; r < (allowRotation ? want.length : 1); r++) {
    let m = 0;
    while (m < have.length && sameCore(have[m] ?? null, want[(m + r) % want.length] ?? null)) m++;
    if (m > best.matched) best = { matched: m, length: want.length, rotation: r };
  }
  return best;
}

/** A schema by ID (`schema.axis`) or bare name (`axis`). */
export function findSchema(id: string, lib: readonly SchemaDef[] = SCHEMAS): SchemaDef | undefined {
  return lib.find((s) => s.id === id || s.id === `schema.${id}`);
}
/** A schema's Roman numerals, one per bar when it has `slotBars`, else one per chord. */
export function schemaRomans(schema: SchemaDef): { rn: string[]; perBar: boolean } {
  if (!schema.slotBars) return { rn: [...schema.rn], perBar: false };
  return { rn: schema.rn.flatMap((r, i) => Array.from({ length: schema.slotBars?.[i] ?? 1 }, () => r)), perBar: true };
}

/** The chord sequence of the slots with repeated neighbours merged. */
export function chordChanges(slots: readonly ChordSlot[]): (ChordId | null)[] {
  const out: (ChordId | null)[] = [];
  for (const s of slots) {
    const last = out[out.length - 1];
    if (out.length > 0 && s.chord && last && sameCore(coreOf(s.chord), coreOf(last))) continue;
    out.push(s.chord);
  }
  return out;
}

const MINORISH: readonly string[] = ["minor", "harmonic minor", "melodic minor", "dorian", "phrygian", "locrian", "minor pentatonic", "blues"];
export const isMinorKey = (key: KeySpec): boolean => MINORISH.includes(key.mode);

/**
 * The cadence at the end of bar `endBar` (1-based), from the last two chords before it (exercises §3.5):
 * V → I with both in root position and the melody on 1 is PAC, otherwise IAC; ending on V is HC;
 * IV → I is PC; V → vi (or ♭VI) is DC; ♭VII → I is its own type. Minor keys use V → i and iv → i.
 */
export function cadenceAt(slots: readonly ChordSlot[], melody: readonly Note[] | null, key: KeySpec, endBar: number): CadenceType {
  const end = rat(endBar);
  const before = slots.filter((s) => R.lt(s.span[0], end) && s.chord);
  const last = before[before.length - 1];
  if (!last?.chord) return "none";
  let i = before.length - 2;
  while (i >= 0 && sameCore(coreOf((before[i] as ChordSlot).chord as ChordId), coreOf(last.chord))) i--;
  const prev = i >= 0 ? (before[i] as ChordSlot) : undefined;
  const semis = (c: ChordId): number => degreeOf(c.rootPc, key).semitones;
  const major = (c: ChordId): boolean => ["maj", "aug"].includes(triadCore(c).quality);
  const tonicQuality = isMinorKey(key) ? "min" : "maj";
  const lastSemis = semis(last.chord);
  const isTonic = lastSemis === 0 && triadCore(last.chord).quality === tonicQuality;
  const isDominant = (c: ChordId): boolean => semis(c) === 7 && major(c);
  if (isTonic && prev?.chord) {
    const p = prev.chord;
    if (isDominant(p)) {
      const rootPosition = p.bassPc === p.rootPc && last.chord.bassPc === last.chord.rootPc;
      const lastNote = melody ? [...melody].reverse().find((n) => R.lt(n.onset, end)) : undefined;
      const onTonic = lastNote !== undefined && degreeOf(lastNote.midi, key).semitones === 0;
      return rootPosition && onTonic ? "PAC" : "IAC";
    }
    if (semis(p) === 5) return "PC";
    if (semis(p) === 10 && major(p)) return "bVII-I";
  }
  if (isDominant(last.chord)) return "HC";
  if (prev?.chord && isDominant(prev.chord)) {
    const q = triadCore(last.chord).quality;
    if ((lastSemis === 9 && q === "min") || (lastSemis === 8 && q === "maj")) return "DC";
  }
  return "none";
}

/** Root of every bar of a 12-bar blues, in semitones above the tonic; alternatives are allowed per bar. */
const BLUES_FORMS: Record<"standard" | "quick-change" | "jazz", number[][]> = {
  standard: [[0], [0], [0], [0], [5], [5], [0], [0], [7], [5, 7], [0], [0, 7]],
  "quick-change": [[0], [5], [0], [0], [5], [5], [0], [0], [7], [5, 7], [0], [0, 7]],
  jazz: [[0], [5], [0], [0], [5], [5, 6], [0], [9, 4], [2], [7], [0], [2, 7, 0]],
};
export interface BluesForm {
  variant: "standard" | "quick-change" | "jazz" | null;
  /** Complete 12-bar choruses that follow the variant. */
  choruses: number;
  /** 1-based bars that break the closest variant. */
  wrongBars: number[];
}
/** Which 12-bar blues the chords follow, compared on the root of each bar. */
export function bluesForm(slots: readonly ChordSlot[], key: KeySpec, bars: number): BluesForm {
  const perBar = chordPerBar(slots, bars).map((c) => (c ? degreeOf(c.rootPc, key).semitones : null));
  const choruses = Math.floor(bars / 12);
  let best: BluesForm = { variant: null, choruses: 0, wrongBars: Array.from({ length: Math.max(12, bars) }, (_, i) => i + 1) };
  if (choruses === 0) return best;
  // `standard` is tested last so a form that fits two variants is named by its distinguishing bar.
  for (const variant of ["jazz", "quick-change", "standard"] as const) {
    const wrong: number[] = [];
    for (let b = 0; b < choruses * 12; b++) {
      const root = perBar[b];
      if (root === null || root === undefined || !(BLUES_FORMS[variant][b % 12] as number[]).includes(root)) wrong.push(b + 1);
    }
    if (wrong.length < best.wrongBars.length || (wrong.length === best.wrongBars.length && best.variant === null))
      best = { variant: wrong.length === 0 ? variant : null, choruses: wrong.length === 0 ? choruses : 0, wrongBars: wrong };
    if (wrong.length === 0 && variant !== "standard") {
      // A jazz blues also fits fewer bars of the others; keep the most specific exact match.
      const std = BLUES_FORMS.standard;
      const alsoStandard = perBar.slice(0, choruses * 12).every((r, b) => r !== null && r !== undefined && (std[b % 12] as number[]).includes(r));
      if (!alsoStandard) return best;
    }
  }
  return best;
}

export interface VoiceLeading {
  /** Sum of the semitone moves of the best pairing. */
  total: number;
  maxMove: number;
  /** [from, to] MIDI pairs. */
  mapping: [number, number][];
  commonTones: number;
  /** Parallel perfect fifths or octaves between the outer voices. Information only. */
  parallels: ("P5" | "P8")[];
}
/**
 * The smoothest way from chord `a` to chord `b`: the smaller chord is padded by doubling its tone nearest
 * to the other chord's spare notes, then the pairing with the least total motion is taken (≤ 6 voices).
 */
export function voiceLeading(a: readonly number[], b: readonly number[]): VoiceLeading {
  const from = [...a].sort((x, y) => x - y).slice(0, 6);
  const to = [...b].sort((x, y) => x - y).slice(0, 6);
  if (from.length === 0 || to.length === 0) return { total: 0, maxMove: 0, mapping: [], commonTones: 0, parallels: [] };
  const pad = (small: number[], big: number[]): number[] => {
    const out = [...small];
    while (out.length < big.length) {
      const spare = big.filter((x) => !out.includes(x));
      const target = spare[0] ?? (big[out.length] as number);
      out.push(small.reduce((best, x) => (Math.abs(x - target) < Math.abs(best - target) ? x : best)));
    }
    return out;
  };
  const A = from.length < to.length ? pad(from, to) : from;
  const B = to.length < from.length ? pad(to, from) : to;
  let bestTotal = Number.POSITIVE_INFINITY;
  let bestPerm: number[] = [];
  const perm: number[] = [];
  const used = A.map(() => false);
  const search = (i: number, total: number): void => {
    if (total >= bestTotal) return;
    if (i === A.length) {
      bestTotal = total;
      bestPerm = [...perm];
      return;
    }
    for (let j = 0; j < B.length; j++) {
      if (used[j]) continue;
      used[j] = true;
      perm.push(j);
      search(i + 1, total + Math.abs((B[j] as number) - (A[i] as number)));
      perm.pop();
      used[j] = false;
    }
  };
  search(0, 0);
  const mapping = A.map((x, i): [number, number] => [x, B[bestPerm[i] as number] as number]);
  const parallels: ("P5" | "P8")[] = [];
  const outer = (xs: readonly number[]): number => mod12((xs[xs.length - 1] as number) - (xs[0] as number));
  const moved = (from[0] as number) !== (to[0] as number) && from[from.length - 1] !== to[to.length - 1];
  if (from.length > 1 && to.length > 1 && moved) {
    if (outer(from) === 7 && outer(to) === 7) parallels.push("P5");
    if (outer(from) === 0 && outer(to) === 0) parallels.push("P8");
  }
  return {
    total: bestTotal,
    maxMove: Math.max(...mapping.map(([x, y]) => Math.abs(y - x))),
    mapping,
    commonTones: mapping.filter(([x, y]) => x === y).length,
    parallels,
  };
}

/** Voice leading across successive slots of a hand-voiced chord track. */
export function voiceLeadingOfSlots(slots: readonly ChordSlot[]): { at: Rat; vl: VoiceLeading }[] {
  const out: { at: Rat; vl: VoiceLeading }[] = [];
  for (let i = 1; i < slots.length; i++) {
    const [a, b] = [slots[i - 1] as ChordSlot, slots[i] as ChordSlot];
    if (a.midis.length > 0 && b.midis.length > 0) out.push({ at: b.span[0], vl: voiceLeading(a.midis, b.midis) });
  }
  return out;
}
/** How far the top voice moves at each chord change. */
export function topVoiceMoves(slots: readonly ChordSlot[]): { at: Rat; move: number }[] {
  const out: { at: Rat; move: number }[] = [];
  for (let i = 1; i < slots.length; i++) {
    const [a, b] = [slots[i - 1] as ChordSlot, slots[i] as ChordSlot];
    if (a.midis.length > 0 && b.midis.length > 0)
      out.push({ at: b.span[0], move: Math.abs((b.midis[b.midis.length - 1] as number) - (a.midis[a.midis.length - 1] as number)) });
  }
  return out;
}

/** Whether a pitch class is the chord's third or seventh (the sixth stands in for a missing seventh). */
export function isGuideTone(pc: number, chord: ChordId): boolean {
  const rel = mod12(pc - chord.rootPc);
  const pcs = chordPcs(chord).map((p) => mod12(p - chord.rootPc));
  const third = pcs.find((p) => p === 3 || p === 4);
  const seventh = pcs.find((p) => p === 10 || p === 11) ?? pcs.find((p) => p === 9);
  return rel === third || rel === seventh;
}
/**
 * At each chord change the line's note should be the chord's 3rd or 7th, and successive guide tones
 * should move by at most 2 semitones.
 */
export function guideToneLine(line: readonly Note[], slots: readonly ChordSlot[]): { ratio: number; maxMove: number; n: number; misses: Rat[] } {
  let hits = 0;
  let n = 0;
  let maxMove = 0;
  let prev: number | null = null;
  const misses: Rat[] = [];
  for (const slot of slots) {
    if (!slot.chord) continue;
    const note = [...line].reverse().find((x) => R.lte(x.onset, slot.span[0]) && R.lt(slot.span[0], R.add(x.onset, x.dur)));
    n++;
    if (note && isGuideTone(note.midi, slot.chord)) {
      hits++;
      if (prev !== null) maxMove = Math.max(maxMove, Math.abs(note.midi - prev));
      prev = note.midi;
    } else misses.push(slot.span[0]);
  }
  return { ratio: n === 0 ? 0 : hits / n, maxMove, n, misses };
}

/** Muddy low intervals: a third or less below C3, a fourth below A2, a fifth below B♭1. */
export function lowIntervalViolations(events: readonly NEvent[]): { at: Rat; low: number; interval: number }[] {
  const out: { at: Rat; low: number; interval: number }[] = [];
  const seen = new Set<string>();
  for (const e of pitched(events)) {
    const here = sounding(events, e.onset).map((x) => x.midi).sort((a, b) => a - b);
    for (let i = 0; i + 1 < here.length; i++) {
      const low = here[i] as number;
      const interval = (here[i + 1] as number) - low;
      const bad = (interval >= 1 && interval <= 4 && low < 48) || (interval === 5 && low < 45) || (interval === 7 && low < 34);
      const key = `${ratKey(e.onset)}|${low}|${interval}`;
      if (bad && !seen.has(key)) {
        seen.add(key);
        out.push({ at: e.onset, low, interval });
      }
    }
  }
  return out;
}

/** Lead-sheet text of a slot for messages and the analysis summary. */
export function slotLabel(slot: ChordSlot): string {
  return slot.chord ? toLeadSheet(slot.chord) : (slot.symbol ?? "?");
}

/** Bars and beats are computed by the caller; this is the meter-free part of a slot's place. */
export const slotStart = (slot: ChordSlot): Rat => slot.span[0];
export type { MeterId };

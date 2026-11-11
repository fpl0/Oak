/**
 * SPIKE S4 — haps -> NotationModel (pure TS, isomorphic: no DOM, no Bun APIs).
 *
 * Pipeline: Strudel haps -> OakEvent[] (exact rationals, MIDI) -> slots (chords) -> bars (tie chains)
 * -> tuplet windows -> notatable written values + ties + rests -> key-aware spelling -> Score.
 * `abc.ts` turns a Score into ABC text for abcjs.
 *
 * Scope of the spike: one voice, x/4 meters (4/4 exercised), tuplets p in {3,5,7,9}.
 */
import { Key, Note } from "tonal";

// ---------------------------------------------------------------------------------------------
// Exact rationals (bigint). Strudel haps carry fraction.js v5 values: { s: bigint, n: bigint, d: bigint }.
// ---------------------------------------------------------------------------------------------
export interface Rat {
  readonly n: bigint;
  readonly d: bigint;
}
const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x;
};
export function rat(n: bigint | number, d: bigint | number = 1n): Rat {
  let nn = BigInt(n);
  let dd = BigInt(d);
  if (dd === 0n) throw new Error("rat: zero denominator");
  if (dd < 0n) {
    nn = -nn;
    dd = -dd;
  }
  const g = gcd(nn, dd) || 1n;
  return { n: nn / g, d: dd / g };
}
export const R = {
  add: (a: Rat, b: Rat) => rat(a.n * b.d + b.n * a.d, a.d * b.d),
  sub: (a: Rat, b: Rat) => rat(a.n * b.d - b.n * a.d, a.d * b.d),
  mul: (a: Rat, b: Rat) => rat(a.n * b.n, a.d * b.d),
  div: (a: Rat, b: Rat) => rat(a.n * b.d, a.d * b.n),
  cmp: (a: Rat, b: Rat) => {
    const l = a.n * b.d;
    const r = b.n * a.d;
    return l < r ? -1 : l > r ? 1 : 0;
  },
  eq: (a: Rat, b: Rat) => a.n === b.n && a.d === b.d,
  lt: (a: Rat, b: Rat) => a.n * b.d < b.n * a.d,
  le: (a: Rat, b: Rat) => a.n * b.d <= b.n * a.d,
  min: (a: Rat, b: Rat) => (a.n * b.d <= b.n * a.d ? a : b),
  max: (a: Rat, b: Rat) => (a.n * b.d >= b.n * a.d ? a : b),
  /** floor(a / step) * step */
  floorTo: (a: Rat, step: Rat) => {
    const q = rat(a.n * step.d, a.d * step.n);
    let f = q.n / q.d;
    if (q.n < 0n && q.n % q.d !== 0n) f -= 1n;
    return rat(f * step.n, step.d);
  },
  isMultipleOf: (a: Rat, step: Rat) => rat(a.n * step.d, a.d * step.n).d === 1n,
  toNumber: (a: Rat) => Number(a.n) / Number(a.d),
  str: (a: Rat) => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`),
};
export const ZERO = rat(0);

/** fraction.js (any major) or plain {n,d} -> Rat. */
export function fromFraction(f: { s?: bigint | number; n: bigint | number; d: bigint | number }): Rat {
  const s = f.s === undefined ? 1n : BigInt(f.s);
  return rat((s < 0n ? -1n : 1n) * BigInt(f.n), BigInt(f.d));
}

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------
export interface CodeRange {
  start: number;
  end: number;
}
export interface OakEvent {
  /** Stable within one evaluation: index after sorting by (onset, midi). */
  id: number;
  /** In cycles (1 cycle = 1 bar). */
  onset: Rat;
  dur: Rat;
  midi: number;
  /** Normalized scientific name as the source spelled it ("C#4"), or null when the source was numeric. */
  sourceName: string | null;
  locations: CodeRange[];
  /** hap.context.scale when .scale() was used, e.g. "D4 major". */
  scale: string | null;
}

/**
 * Strudel note name -> tonal-compatible scientific name.
 * Strudel accepts 's'/'f' as accidentals ("cs4", "ef4", "bf3") and defaults to octave 3; tonal rejects both.
 * The first character is always the letter, so "f4" stays F4 and "ff4" becomes Fb4.
 */
export function normalizeNoteName(raw: string, defaultOctave = 3): string | null {
  const m = /^([a-gA-G])([#bsf]*)(-?\d+)?$/.exec(raw.trim());
  if (!m) return null;
  const letter = (m[1] as string).toUpperCase();
  const acc = (m[2] ?? "").replace(/s/g, "#").replace(/f/g, "b");
  const oct = m[3] ?? String(defaultOctave);
  return `${letter}${acc}${oct}`;
}

export interface HapLike {
  whole?: { begin: { s?: bigint; n: bigint; d: bigint }; end: { s?: bigint; n: bigint; d: bigint } } | undefined;
  hasOnset(): boolean;
  value: unknown;
  context?: { locations?: CodeRange[]; scale?: string } | undefined;
}

/** Pipeline step 1: keep haps with a whole and an onset; exact times from `whole`; pitch -> MIDI. */
export function hapsToEvents(haps: HapLike[]): { events: OakEvent[]; skipped: number } {
  const out: Omit<OakEvent, "id">[] = [];
  let skipped = 0;
  for (const h of haps) {
    if (!h.whole || !h.hasOnset()) {
      skipped++;
      continue;
    }
    const v = h.value as { note?: string | number } | string | number;
    const raw = typeof v === "object" && v !== null ? v.note : v;
    let midi: number | null = null;
    let sourceName: string | null = null;
    if (typeof raw === "number") midi = raw;
    else if (typeof raw === "string") {
      sourceName = normalizeNoteName(raw);
      midi = sourceName ? Note.midi(sourceName) : null;
    }
    if (midi == null) {
      skipped++;
      continue;
    }
    const onset = fromFraction(h.whole.begin);
    out.push({
      onset,
      dur: R.sub(fromFraction(h.whole.end), onset),
      midi,
      sourceName,
      locations: h.context?.locations ?? [],
      scale: h.context?.scale ?? null,
    });
  }
  // queryArc does NOT return haps in time order (e.g. "<c4 e4> g4" over 2 cycles), so sort here.
  out.sort((a, b) => R.cmp(a.onset, b.onset) || a.midi - b.midi);
  return { events: out.map((e, id) => ({ id, ...e })), skipped };
}

// ---------------------------------------------------------------------------------------------
// Key context and spelling
// ---------------------------------------------------------------------------------------------
export interface KeyCtx {
  /** Pitch class, e.g. "D", "F#", "Bb". */
  tonic: string;
  mode: "major" | "minor";
}
export interface SpelledPitch {
  midi: number;
  /** Scientific name, e.g. "E#5". */
  name: string;
  letter: string;
  /** -2..2 */
  alt: number;
  oct: number;
}

/** "D4 major" (hap.context.scale) or "F#:minor" -> KeyCtx. Only major/minor are handled in the spike. */
export function keyFromScaleName(scale: string | null | undefined): KeyCtx | null {
  if (!scale) return null;
  const m = /^([A-Ga-g][#bsf]*)-?\d*[\s:]+(major|minor|ionian|aeolian)$/.exec(scale.trim());
  if (!m) return null;
  const pc = Note.pitchClass(normalizeNoteName(m[1] as string) ?? "");
  if (!pc) return null;
  return { tonic: pc, mode: m[2] === "major" || m[2] === "ionian" ? "major" : "minor" };
}

interface KeyInfo {
  /** Candidate pitch classes in priority order (diatonic first, then raised 6/7 in minor). */
  pcs: string[];
  alteration: number;
  /** Key-signature alteration per letter. */
  sig: Record<string, number>;
  abcKey: string;
}
export function keyInfo(key: KeyCtx | null): KeyInfo {
  const k = key ?? { tonic: "C", mode: "major" as const };
  let scale: readonly string[];
  let extra: readonly string[] = [];
  let alteration: number;
  if (k.mode === "major") {
    const mk = Key.majorKey(k.tonic);
    scale = mk.scale;
    alteration = mk.alteration;
  } else {
    const mk = Key.minorKey(k.tonic);
    scale = mk.natural.scale;
    extra = [...mk.harmonic.scale, ...mk.melodic.scale];
    alteration = mk.alteration;
  }
  if (scale.length !== 7) throw new Error(`keyInfo: unknown key ${k.tonic} ${k.mode}`);
  const sig: Record<string, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  for (const pc of scale) {
    const n = Note.get(pc);
    sig[n.letter] = n.alt;
  }
  return { pcs: [...scale, ...extra], alteration, sig, abcKey: `${k.tonic}${k.mode === "minor" ? "m" : ""}` };
}

/**
 * Pipeline step 5 (spike subset): key-scale spelling wins; a non-diatonic pitch keeps the source spelling
 * when the code spelled it; otherwise sharps in sharp/neutral keys and flats in flat keys.
 */
export function spell(midi: number, key: KeyCtx | null, sourceName: string | null = null): SpelledPitch {
  const info = keyInfo(key);
  const chroma = ((midi % 12) + 12) % 12;
  let name = "";
  const pc = info.pcs.find((p) => Note.chroma(p) === chroma);
  // Note.enharmonic(note, pc) also fixes the octave: ("C4","B#") -> "B#3", ("F5","E#") -> "E#5".
  if (pc) name = Note.enharmonic(Note.fromMidi(midi), pc);
  if (!name && sourceName && Note.midi(sourceName) === midi) name = sourceName;
  if (!name) name = info.alteration >= 0 ? Note.fromMidiSharps(midi) : Note.fromMidi(midi);
  const n = Note.get(name);
  if (n.empty || n.midi !== midi || n.oct === undefined) throw new Error(`spell: cannot spell midi ${midi}`);
  return { midi, name: n.name, letter: n.letter, alt: n.alt, oct: n.oct };
}

// ---------------------------------------------------------------------------------------------
// Score model
// ---------------------------------------------------------------------------------------------
export interface Meter {
  num: number;
  den: number;
}
/** A sounding unit before bar/beat splitting: one note or a chord (events sharing onset and duration). */
export interface Slot {
  id: number;
  onset: Rat;
  end: Rat;
  /** Sorted low to high; `pitches[i]` and `eventLocations[i]` belong to `eventIds[i]`. */
  eventIds: number[];
  pitches: SpelledPitch[];
  eventLocations: CodeRange[][];
}
export interface TupletMark {
  p: number;
  q: number;
  /** Number of written items under the bracket. */
  r: number;
}
export interface NoteItem {
  kind: "note" | "chord" | "rest";
  /** null for rests. All tied pieces of one slot share the slot id. */
  slotId: number | null;
  eventIds: number[];
  pitches: SpelledPitch[];
  /** Bar-relative start, in L units (L = 1/16). */
  start: Rat;
  /** Sounding length in L units. */
  dur: Rat;
  /** Written length in L units (dur * p/q inside a tuplet). */
  written: Rat;
  tieToNext: boolean;
  tieFromPrev: boolean;
  /** Set on the first item of a tuplet group. */
  tupletStart?: TupletMark;
  inTuplet: boolean;
  /** Emit a space before this item (beam-group boundary). */
  breakBefore: boolean;
}
export interface Bar {
  index: number;
  items: NoteItem[];
}
export interface Score {
  meter: Meter;
  key: KeyCtx | null;
  bars: Bar[];
  slots: Slot[];
  approximate: boolean;
  warnings: string[];
}
export interface NotationInput {
  events: OakEvent[];
  bars: number;
  meter?: Meter;
  /** Lesson-declared key wins; otherwise the first event's hap.context.scale; otherwise none (C major sig). */
  key?: KeyCtx | null;
}

const L = 16; // L:1/16
const ALLOWED_TUPLETS: Record<number, number> = { 3: 2, 5: 4, 7: 4, 9: 8 }; // p -> q
const MAX_TUPLET_ITEMS = 9; // abcjs: p, q and r are single digits

const isPow2 = (x: bigint) => x > 0n && (x & (x - 1n)) === 0n;
/** On the binary grid down to a 64th note (1/4 of an L unit). */
const onGrid = (x: Rat) => isPow2(x.d) && x.d <= 4n;
/** A single note value, optionally dotted: 2^a or 3*2^a L units (64th .. whole). */
function notatable(len: Rat): boolean {
  if (!isPow2(len.d) || len.d > 4n) return false;
  if (len.n !== 1n && len.n !== 3n && !(len.d === 1n && (isPow2(len.n) || (len.n % 3n === 0n && isPow2(len.n / 3n))))) {
    return false;
  }
  return true;
}
const NOTE_VALUES: Rat[] = [
  rat(16), rat(12), rat(8), rat(6), rat(4), rat(3), rat(2), rat(3, 2), rat(1), rat(3, 4), rat(1, 2), rat(1, 4),
]; // descending
function largestNotatable(max: Rat, allowDots: boolean): Rat | null {
  for (const v of NOTE_VALUES) {
    if (!allowDots && v.n % 3n === 0n) continue;
    if (R.le(v, max)) return v;
  }
  return null;
}

interface Seg {
  start: Rat;
  end: Rat;
  slot: Slot | null;
  tieIn: boolean;
  tieOut: boolean;
}

/** Events sharing onset and duration become one slot (a chord). Overlaps are cut (monophonic spike). */
function buildSlots(events: OakEvent[], key: KeyCtx | null, warnings: string[]): Slot[] {
  const byKey = new Map<string, OakEvent[]>();
  for (const e of events) {
    const k = `${R.str(e.onset)}|${R.str(e.dur)}`;
    const list = byKey.get(k);
    if (list) list.push(e);
    else byKey.set(k, [e]);
  }
  const slots: Slot[] = [...byKey.values()]
    .map((evs) => {
      const first = evs[0] as OakEvent;
      const sorted = [...evs].sort((a, b) => a.midi - b.midi);
      return {
        id: 0,
        onset: first.onset,
        end: R.add(first.onset, first.dur),
        eventIds: sorted.map((e) => e.id),
        pitches: sorted.map((e) => spell(e.midi, key, e.sourceName)),
        eventLocations: sorted.map((e) => e.locations),
      };
    })
    .sort((a, b) => R.cmp(a.onset, b.onset) || R.cmp(a.end, b.end));
  const out: Slot[] = [];
  for (const s of slots) {
    const prev = out[out.length - 1];
    if (prev && R.lt(s.onset, prev.end)) {
      warnings.push(`overlap: events ${prev.eventIds.join(",")} cut at ${R.str(s.onset)} (needs a second voice)`);
      if (R.eq(prev.onset, s.onset)) {
        // Same onset, different durations: keep the shorter as a chord of both (approximation).
        const merged = [...prev.eventIds.keys(), ...s.eventIds.keys()]
          .map((_, i) =>
            i < prev.eventIds.length
              ? { id: prev.eventIds[i] as number, p: prev.pitches[i] as SpelledPitch, l: prev.eventLocations[i] as CodeRange[] }
              : {
                  id: s.eventIds[i - prev.eventIds.length] as number,
                  p: s.pitches[i - prev.eventIds.length] as SpelledPitch,
                  l: s.eventLocations[i - prev.eventIds.length] as CodeRange[],
                },
          )
          .sort((a, b) => a.p.midi - b.p.midi);
        prev.eventIds = merged.map((m) => m.id);
        prev.pitches = merged.map((m) => m.p);
        prev.eventLocations = merged.map((m) => m.l);
        continue;
      }
      prev.end = s.onset;
    }
    out.push(s);
  }
  out.forEach((s, i) => {
    s.id = i;
  });
  return out;
}

/** Contiguous note/rest segments covering one bar, in L units. */
function barSegments(slots: Slot[], bar: number, unitsPerBar: Rat): Seg[] {
  const b0 = rat(bar);
  const b1 = rat(bar + 1);
  const segs: Seg[] = [];
  let cursor = ZERO;
  for (const s of slots) {
    if (R.le(s.end, b0) || R.le(b1, s.onset)) continue;
    const start = R.mul(R.sub(R.max(s.onset, b0), b0), unitsPerBar);
    const end = R.mul(R.sub(R.min(s.end, b1), b0), unitsPerBar);
    if (R.lt(cursor, start)) segs.push({ start: cursor, end: start, slot: null, tieIn: false, tieOut: false });
    segs.push({ start, end, slot: s, tieIn: R.lt(s.onset, b0), tieOut: R.lt(b1, s.end) });
    cursor = end;
  }
  if (R.lt(cursor, unitsPerBar)) segs.push({ start: cursor, end: unitsPerBar, slot: null, tieIn: false, tieOut: false });
  return segs;
}

interface Window {
  start: Rat;
  size: Rat;
  p: number;
  q: number;
}

/**
 * Pipeline step 6: find tuplet windows. For every off-grid boundary take the SMALLEST aligned window
 * (eighth, beat, half-bar, bar) in which (a) all boundaries relative to the window have an LCD of
 * k * 2^m with k in {3,5,7,9}, and (b) no segment with an off-grid end crosses the window edge.
 * Returns null when some boundary cannot be notated (caller falls back to snapping).
 */
function findWindows(segs: Seg[], sizes: Rat[]): Window[] | null {
  const windows: Window[] = [];
  const covered = (x: Rat) => windows.some((w) => R.lt(w.start, x) && R.lt(x, R.add(w.start, w.size)));
  const points = segs.flatMap((s) => [s.start, s.end]).filter((x) => !onGrid(x));
  for (const x of points) {
    if (covered(x)) continue;
    let found: Window | null = null;
    for (const size of sizes) {
      const start = R.floorTo(x, size);
      const end = R.add(start, size);
      const inside = (y: Rat) => R.lt(start, y) && R.lt(y, end);
      // (b) a segment that crosses an edge must not have off-grid ends.
      const crossing = segs.some(
        (s) =>
          ((R.lt(s.start, start) && R.lt(start, s.end)) || (R.lt(s.start, end) && R.lt(end, s.end))) &&
          (!onGrid(s.start) || !onGrid(s.end)),
      );
      if (crossing) continue;
      // (a) LCD of relative positions.
      let lcd = 1n;
      for (const s of segs) {
        for (const y of [s.start, s.end]) {
          if (!inside(y)) continue;
          const rel = R.div(R.sub(y, start), size);
          lcd = (lcd * rel.d) / gcd(lcd, rel.d);
        }
      }
      let k = lcd;
      while (k % 2n === 0n) k /= 2n;
      const q = ALLOWED_TUPLETS[Number(k)];
      if (k > 9n || q === undefined) continue;
      // Windows must not overlap an existing one.
      if (windows.some((w) => R.lt(w.start, end) && R.lt(start, R.add(w.start, w.size)))) continue;
      found = { start, size, p: Number(k), q };
      break;
    }
    if (!found) return null;
    windows.push(found);
  }
  return windows.sort((a, b) => R.cmp(a.start, b.start));
}

/** Fallback: snap every boundary to the nearest L unit, drop empty segments, mark the score approximate. */
function snapSegments(segs: Seg[]): Seg[] {
  const snap = (x: Rat) => rat((x.n * 2n + x.d) / (x.d * 2n));
  const out: Seg[] = [];
  for (const s of segs) {
    const start = out.length ? (out[out.length - 1] as Seg).end : snap(s.start);
    const end = R.max(snap(s.end), start);
    if (R.eq(start, end)) continue;
    out.push({ ...s, start, end });
  }
  return out;
}

function splitAt(segs: Seg[], cuts: Rat[]): Seg[] {
  let out = segs;
  for (const c of cuts) {
    out = out.flatMap((s) =>
      R.lt(s.start, c) && R.lt(c, s.end)
        ? [
            { ...s, end: c, tieOut: s.slot !== null },
            { ...s, start: c, tieIn: s.slot !== null },
          ]
        : [s],
    );
  }
  return out;
}

export function buildScore(input: NotationInput): Score {
  const meter = input.meter ?? { num: 4, den: 4 };
  const warnings: string[] = [];
  let approximate = false;
  const key = input.key !== undefined ? input.key : keyFromScaleName(input.events.find((e) => e.scale)?.scale);
  const slots = buildSlots(input.events, key, warnings);
  if (warnings.length) approximate = true;

  const unitsPerBar = rat(meter.num * L, meter.den);
  const beat = rat(L, meter.den);
  const half = meter.num === 4 && meter.den === 4 ? R.div(unitsPerBar, rat(2)) : null;
  const windowSizes = [R.div(beat, rat(2)), beat, ...(half ? [half] : []), unitsPerBar];

  const bars: Bar[] = [];
  for (let b = 0; b < input.bars; b++) {
    let segs = barSegments(slots, b, unitsPerBar);
    let windows = findWindows(segs, windowSizes);
    if (windows === null) {
      approximate = true;
      warnings.push(`bar ${b + 1}: rhythm is not notatable (tuplet p > 9 or mixed ratios); snapped to 1/16`);
      segs = snapSegments(segs);
      windows = [];
    }
    segs = splitAt(segs, windows.flatMap((w) => [w.start, R.add(w.start, w.size)]));

    const items: NoteItem[] = [];
    const push = (seg: Seg, start: Rat, dur: Rat, written: Rat, first: boolean, last: boolean, inTuplet: boolean) => {
      const slot = seg.slot;
      items.push({
        kind: slot === null ? "rest" : slot.pitches.length > 1 ? "chord" : "note",
        slotId: slot?.id ?? null,
        eventIds: slot?.eventIds ?? [],
        pitches: slot?.pitches ?? [],
        start,
        dur,
        written,
        tieFromPrev: slot !== null && (first ? seg.tieIn : true),
        tieToNext: slot !== null && (last ? seg.tieOut : true),
        inTuplet,
        breakBefore: false,
      });
    };

    for (const seg of segs) {
      const w = windows.find((x) => R.le(x.start, seg.start) && R.le(seg.end, R.add(x.start, x.size)));
      if (w) {
        // Inside a tuplet: written = sounding * p/q, decomposed into note values if needed.
        const ratio = rat(w.p, w.q);
        let pos = seg.start;
        let remaining = R.mul(R.sub(seg.end, seg.start), ratio);
        let first = true;
        while (R.lt(ZERO, remaining)) {
          const isNote = seg.slot !== null;
          const v = isNote && notatable(remaining) ? remaining : largestNotatable(remaining, isNote);
          if (!v) throw new Error(`bar ${b + 1}: tuplet value ${R.str(remaining)} below a 64th`);
          const dur = R.div(v, ratio);
          remaining = R.sub(remaining, v);
          push(seg, pos, dur, v, first, R.eq(remaining, ZERO), true);
          pos = R.add(pos, dur);
          first = false;
        }
        continue;
      }
      // Plain segment (pipeline step 7).
      let pos = seg.start;
      let first = true;
      while (R.lt(pos, seg.end)) {
        let len: Rat | null;
        if (seg.slot === null) {
          // Rests: largest power of two that is aligned at `pos` and fits; never dotted, never tied.
          len = null;
          for (const v of NOTE_VALUES) {
            if (v.n % 3n === 0n) continue;
            if (R.isMultipleOf(pos, v) && R.le(R.add(pos, v), seg.end)) {
              len = v;
              break;
            }
          }
        } else {
          let limit = seg.end;
          // Never straddle the half-bar in 4/4, unless the note starts the bar and is one value (C12, C16).
          if (half && R.lt(pos, half) && R.lt(half, limit) && !(R.eq(pos, ZERO) && notatable(R.sub(limit, pos)))) {
            limit = half;
          }
          // A note that starts off the beat may not cross the next beat.
          const nextBeat = R.add(R.floorTo(pos, beat), beat);
          if (!R.isMultipleOf(pos, beat) && R.lt(nextBeat, limit)) limit = nextBeat;
          len = largestNotatable(R.sub(limit, pos), true);
        }
        if (!len) throw new Error(`bar ${b + 1}: cannot notate ${R.str(pos)}..${R.str(seg.end)}`);
        const next = R.add(pos, len);
        push(seg, pos, len, len, first, R.eq(next, seg.end), false);
        pos = next;
        first = false;
      }
    }

    // Tuplet marks and beam breaks (beaming by beat; a tuplet group is its own beam group).
    for (const w of windows) {
      const group = items.filter((it) => it.inTuplet && R.le(w.start, it.start) && R.lt(it.start, R.add(w.start, w.size)));
      const head = group[0];
      if (!head) continue;
      if (group.length > MAX_TUPLET_ITEMS) {
        approximate = true;
        warnings.push(`bar ${b + 1}: tuplet with ${group.length} items exceeds abcjs' single-digit r`);
      }
      head.tupletStart = { p: w.p, q: w.q, r: group.length };
    }
    items.forEach((it, i) => {
      const prev = items[i - 1];
      // Values of a quarter or longer never beam, so the space there is only for readable ABC.
      const unbeamable = (x: NoteItem | undefined) => x !== undefined && R.le(beat, x.written);
      it.breakBefore =
        i > 0 &&
        (R.isMultipleOf(it.start, beat) ||
          it.tupletStart !== undefined ||
          (prev?.inTuplet === true && !it.inTuplet) ||
          unbeamable(it) ||
          unbeamable(prev));
    });
    bars.push({ index: b, items });
  }
  return { meter, key, bars, slots, approximate, warnings };
}

/** Interval lookup for clock-driven highlighting: event ids sounding at `cycle` (wrapped to the loop). */
export function activeEventIds(score: Score, cycle: number): number[] {
  const loop = score.bars.length;
  const pos = ((cycle % loop) + loop) % loop;
  return score.slots
    .filter((s) => R.toNumber(s.onset) <= pos && pos < R.toNumber(s.end))
    .flatMap((s) => s.eventIds);
}

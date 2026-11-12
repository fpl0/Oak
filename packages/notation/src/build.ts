// NEvents → NotationModel (`Score`). The pipeline of architecture §2.5 with the contracts §6.10 (swing)
// and §6.11 (pickup) amendments: straighten a declared swing → key context → staves and voices →
// bars (tie chains) → beat grid → tuplets → written values → spelling → ids, lyrics, chord symbols.
import type { DrumRole, KeySpec, NEvent, Rat } from "@oak/content-kit";
import { barOf, R, rat } from "@oak/content-kit";
import type { SpelledPitch } from "@oak/theory";
import { drumPlace, isFoot } from "./drums.ts";
import { abcjsLimitWarnings } from "./limits.ts";
import { type Grid, gridOf } from "./meter.ts";
import { toRat } from "./q.ts";
import { type QItem, quantizeBar, type Seg, writtenOf } from "./quantize.ts";
import {
  chordDisplay,
  countLabel,
  degreeLabel,
  keyFromScaleCtx,
  parseChord,
  parseNoteName,
  spell,
} from "./theory-port.ts";
import type {
  KeyChange,
  NotationInput,
  NotationWarning,
  NoteItem,
  Score,
  ScoreAnnotation,
  Staff,
  StaffKind,
  Voice,
} from "./types.ts";

/** A sounding unit of one voice: a note, or a chord of events sharing onset and end. */
export interface Slot {
  onset: Rat;
  end: Rat;
  /** Aligned with `pitches`, low to high. */
  events: NEvent[];
  pitches: SpelledPitch[];
  drums?: { s: string; head: "normal" | "x" }[];
  n: number | null;
}
interface StaffPlan {
  id: Staff["id"];
  clef: Staff["clef"];
  lines: 1 | 5;
  kind: "pitched" | "drums" | "rhythm";
  events: NEvent[];
}

const isDrum = (e: NEvent): boolean => e.midi === null && (e.s !== undefined || e.drum !== undefined);
const end = (e: { onset: Rat; dur: Rat }): Rat => R.add(e.onset, e.dur);
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[Math.floor(s.length / 2)] as number) : 60;
};

// --- key -----------------------------------------------------------------------------------------

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const MAJOR_PCS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_PCS = [0, 2, 3, 5, 7, 8, 10, 11];
const TONICS_MAJOR = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const TONICS_MINOR = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

function corr(a: number[], b: number[]): number {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const x = (a[i] as number) - ma;
    const y = (b[i] as number) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
/**
 * Conservative key estimate: at least 7 pitched notes, every pitch class inside one key's scale
 * (harmonic minor counts), ranked by Krumhansl–Kessler correlation. Notes that fit C major return null
 * (no signature is the safer guess).
 */
export function estimateKey(events: readonly NEvent[]): KeySpec | null {
  const pitched = events.filter((e) => e.midi !== null);
  if (pitched.length < 7) return null;
  const hist = new Array<number>(12).fill(0);
  for (const e of pitched) {
    const pc = ((Math.round(e.midi as number) % 12) + 12) % 12;
    hist[pc] = (hist[pc] ?? 0) + R.toNum(e.dur);
  }
  const used = hist.map((h, pc) => (h > 0 ? pc : -1)).filter((pc) => pc >= 0);
  // Notes that fit C major need no signature: never guess one for them.
  if (used.every((pc) => MAJOR_PCS.includes(pc))) return null;
  let best: { key: KeySpec; r: number } | null = null;
  for (let t = 0; t < 12; t++) {
    for (const mode of ["major", "minor"] as const) {
      const pcs = mode === "major" ? MAJOR_PCS : MINOR_PCS;
      if (!used.every((pc) => pcs.includes((pc - t + 12) % 12))) continue;
      const profile = mode === "major" ? MAJOR_PROFILE : MINOR_PROFILE;
      const rotated = hist.map((_, i) => hist[(i + t) % 12] as number);
      const r = corr(rotated, profile);
      if (!best || r > best.r)
        best = { key: { tonic: (mode === "major" ? TONICS_MAJOR : TONICS_MINOR)[t] as string, mode }, r };
    }
  }
  if (!best || best.r < 0.5) return null;
  return best.key;
}

// --- swing ---------------------------------------------------------------------------------------

/** contracts §6.10.6: subtract amount/2 × slot from the onset of each off-beat event; lengths stay. */
export function straightenSwing(
  events: NEvent[],
  unitsPerBar: number,
  swing: { subdivision: 8 | 16; amount: number },
): NEvent[] {
  const slot = rat(1, swing.subdivision === 8 ? unitsPerBar : 2 * unitsPerBar);
  const shift = R.mul(R.mul(toRat(swing.amount), [1, 2]), slot);
  const swungAt = R.add(R.mul(slot, [1, 2]), shift);
  return events.map((e) => {
    const inSlot = R.sub(e.onset, R.mul(rat(Math.floor(R.toNum(R.div(e.onset, slot)) + 1e-9)), slot));
    if (Math.abs(R.toNum(inSlot) - R.toNum(swungAt)) < 1e-9) return { ...e, onset: R.sub(e.onset, shift) };
    return e;
  });
}

// --- staves --------------------------------------------------------------------------------------

function pitchedClef(midis: number[]): "treble" | "bass" {
  return median(midis) >= 57 ? "treble" : "bass";
}
/** Track names that read in the bass clef whatever they play: bass, bassline, lh, left, low, b (and `x.bass`). */
const BASS_TRACK = /^(?:.*[._-])?(?:bass(?:line)?\d*|lh|left|low|b)$/i;

/**
 * The clef a pitched track reads in: `trackClefs[track]` when given; else bass for a track named like a
 * bass (bass, bassline, lh, left, low, b), else by register (median below `split`, default 60, is bass).
 */
export function clefOfTrack(
  track: string,
  midis: readonly number[],
  opts: { split?: number; trackClefs?: Record<string, "treble" | "bass"> } = {},
): "treble" | "bass" {
  const set = opts.trackClefs?.[track];
  if (set) return set;
  if (BASS_TRACK.test(track)) return "bass";
  return midis.length && median([...midis]) < (opts.split ?? 60) ? "bass" : "treble";
}

function planStaves(input: NotationInput, events: NEvent[], warnings: NotationWarning[]): StaffPlan[] {
  const drums = events.filter(isDrum);
  const pitchedAll = events.filter((e) => e.midi !== null);
  const kind: StaffKind = input.staff;
  const pitched = kind === "lead" ? pitchedAll.filter((e) => e.chordSymbol === undefined) : pitchedAll;
  const split = input.splitMidi ?? 60;
  const tracks = [...new Set(pitched.map((e) => e.track))];
  const trackClef = new Map(
    tracks.map((t) => [
      t,
      clefOfTrack(
        t,
        pitched.filter((e) => e.track === t).map((e) => e.midi as number),
        input.trackClefs ? { split, trackClefs: input.trackClefs } : { split },
      ),
    ]),
  );
  const lowTracks = tracks.filter((t) => trackClef.get(t) === "bass");
  // The tracks divide into a treble part and a bass part (each track whole on one staff).
  const byTrack = lowTracks.length > 0 && lowTracks.length < tracks.length;
  const dropDrums = () => {
    if (drums.length)
      warnings.push({
        code: "unpitched-dropped",
        bar: R.floor(drums[0]?.onset ?? [0, 1]),
        message: `${drums.length} drum hit(s) are not shown on a pitched staff`,
      });
  };
  const single = (clef: "treble" | "bass"): StaffPlan => ({
    id: "S1",
    clef,
    lines: 5,
    kind: "pitched",
    events: pitched,
  });
  const grand = (): StaffPlan[] => {
    let rh: NEvent[] = [];
    let lh: NEvent[] = [];
    const wantTrack = input.split === "track" || (input.split === undefined && tracks.length > 1);
    if (wantTrack && byTrack) {
      const low = new Set(lowTracks);
      rh = pitched.filter((e) => !low.has(e.track));
      lh = pitched.filter((e) => low.has(e.track));
    } else {
      rh = pitched.filter((e) => (e.midi as number) >= split);
      lh = pitched.filter((e) => (e.midi as number) < split);
    }
    return [
      { id: "RH", clef: "treble", lines: 5, kind: "pitched", events: rh },
      { id: "LH", clef: "bass", lines: 5, kind: "pitched", events: lh },
    ];
  };
  const drumStaff = (): StaffPlan => ({ id: "DR", clef: "perc", lines: 5, kind: "drums", events: drums });
  switch (kind) {
    case "treble":
    case "bass":
      dropDrums();
      return [single(kind)];
    case "grand":
      dropDrums();
      return grand();
    case "percussion":
      return [drumStaff()];
    case "rhythm":
      return [{ id: "S1", clef: "perc", lines: 1, kind: "rhythm", events }];
    case "lead":
      dropDrums();
      return [single(pitched.length ? pitchedClef(pitched.map((e) => e.midi as number)) : "treble")];
    default: {
      const out: StaffPlan[] = [];
      if (pitched.length) {
        const ms = pitched.map((e) => e.midi as number);
        const lo = Math.min(...ms);
        const hi = Math.max(...ms);
        // Every track named for one clef (trackClefs, or bass-named tracks that stay low enough to read).
        const named = tracks.every((t) => input.trackClefs?.[t] !== undefined || BASS_TRACK.test(t));
        const agreed = new Set(trackClef.values());
        const namedBass = lowTracks.some((t) => input.trackClefs?.[t] === "bass" || BASS_TRACK.test(t));
        if (tracks.length > 1 && byTrack && (namedBass || (lo < 55 && hi > 64))) out.push(...grand());
        else if (named && agreed.size === 1 && (agreed.has("treble") || hi <= 67))
          out.push(single([...agreed][0] as "treble" | "bass"));
        else if (lo >= 55) out.push(single("treble"));
        else if (hi <= 64) out.push(single("bass"));
        else if (hi - lo > 24 || tracks.length > 1) out.push(...grand());
        else out.push(single(pitchedClef(ms)));
      }
      if (drums.length) out.push(drumStaff());
      if (!out.length) out.push(single("treble"));
      return out;
    }
  }
}

// --- voices --------------------------------------------------------------------------------------

/**
 * With a declared swing (§6.10.6): a note that overlaps a later onset on its own track by at most half its
 * length is clipped there, so the straightened line stays one voice.
 */
function clipWithinTracks(events: NEvent[]): NEvent[] {
  const byTrack = new Map<string, NEvent[]>();
  for (const e of events) byTrack.set(e.track, [...(byTrack.get(e.track) ?? []), e]);
  const out: NEvent[] = [];
  for (const list of byTrack.values()) {
    const onsets = [...new Set(list.map((e) => R.str(e.onset)))].map(
      (s) => list.find((e) => R.str(e.onset) === s)?.onset as Rat,
    );
    onsets.sort(R.cmp);
    for (const e of list) {
      const next = onsets.find((o) => R.lt(e.onset, o));
      const stop = end(e);
      if (next && R.lt(next, stop) && R.lte(R.sub(stop, next), R.mul(e.dur, [1, 2]))) {
        out.push({ ...e, dur: R.sub(next, e.onset) });
      } else out.push(e);
    }
  }
  return out;
}

function groupSlots(events: NEvent[]): Slot[] {
  const map = new Map<string, NEvent[]>();
  for (const e of events) {
    const k = `${R.str(e.onset)}|${R.str(end(e))}`;
    map.set(k, [...(map.get(k) ?? []), e]);
  }
  return [...map.values()].map((evs) => {
    const sorted = [...evs].sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0));
    const first = sorted[0] as NEvent;
    return { onset: first.onset, end: end(first), events: sorted, pitches: [], n: null };
  });
}

function assignVoices(slots: Slot[], warnings: NotationWarning[]): { slots: Slot[] }[] {
  const top = (s: Slot) => Math.max(...s.events.map((e) => e.midi ?? 0));
  const sorted = [...slots].sort((a, b) => R.cmp(a.onset, b.onset) || top(b) - top(a));
  const voices: { slots: Slot[]; last: Rat }[] = [];
  for (const s of sorted) {
    const free = voices.find((v) => R.lte(v.last, s.onset));
    if (free) {
      free.slots.push(s);
      free.last = s.end;
      continue;
    }
    if (voices.length < 4) {
      voices.push({ slots: [s], last: s.end });
      continue;
    }
    // More than four simultaneous lines: cut the voice that ends first.
    const v = voices.reduce((a, b) => (R.lte(a.last, b.last) ? a : b));
    const prev = v.slots[v.slots.length - 1] as Slot;
    warnings.push({
      code: "overlap-cut",
      bar: R.floor(s.onset),
      message: "more than four overlapping lines on one staff; a note was shortened",
    });
    if (R.eq(prev.onset, s.onset)) {
      prev.events = [...prev.events, ...s.events].sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0));
      prev.end = R.min(prev.end, s.end);
      v.last = prev.end;
    } else {
      prev.end = s.onset;
      v.slots.push(s);
      v.last = s.end;
    }
  }
  const avg = (v: { slots: Slot[] }) => v.slots.reduce((a, s) => a + top(s), 0) / Math.max(1, v.slots.length);
  return voices.sort((a, b) => avg(b) - avg(a));
}

/** Drums: hits in one voice are clipped at the next onset and simultaneous hits form one chord. */
function drumVoices(events: NEvent[]): Slot[][] {
  const feet = events.filter((e) => isFoot(e.s ?? "", e.drum));
  const hands = events.filter((e) => !isFoot(e.s ?? "", e.drum));
  const groups = feet.length && hands.length ? [hands, feet] : [events];
  return groups.map((list) => {
    const byOnset = new Map<string, NEvent[]>();
    for (const e of list) byOnset.set(R.str(e.onset), [...(byOnset.get(R.str(e.onset)) ?? []), e]);
    const slots = [...byOnset.values()]
      .map((evs) => ({ onset: (evs[0] as NEvent).onset, evs }))
      .sort((a, b) => R.cmp(a.onset, b.onset));
    return slots.map((s, i) => {
      const next = slots[i + 1]?.onset;
      let stop = s.evs.map(end).reduce((a, b) => R.min(a, b));
      if (next && R.lt(next, stop)) stop = next;
      const placed = s.evs
        .map((e) => ({ e, p: drumPlace(e.s, e.drum as DrumRole | undefined) }))
        .filter((x) => x.p !== null)
        .map((x) => ({ e: x.e, p: x.p as NonNullable<typeof x.p>, sp: parseNoteName(x.p?.pitch ?? "B4") }))
        .sort((a, b) => (a.sp?.midi ?? 0) - (b.sp?.midi ?? 0));
      // One notehead per staff position.
      const uniq = placed.filter((x, i) => placed.findIndex((y) => y.p.pitch === x.p.pitch) === i);
      const extra = placed.filter((x) => !uniq.includes(x));
      return {
        onset: s.onset,
        end: stop,
        events: [...uniq.map((x) => x.e), ...extra.map((x) => x.e)],
        pitches: uniq.map((x) => toSpelled(x.p.pitch)),
        drums: uniq.map((x) => ({ s: x.p.s, head: x.p.head })),
        n: null,
      };
    });
  });
}
function toSpelled(name: string): SpelledPitch {
  const p = parseNoteName(name);
  if (!p) throw new Error(`@oak/notation: bad staff pitch ${name}`);
  return { midi: p.midi, name, letter: p.letter, alt: p.alt, oct: p.oct };
}

// --- spelling ------------------------------------------------------------------------------------

interface ChordAt {
  at: Rat;
  symbol: string;
}
function spellVoice(slots: Slot[], keyAt: (t: Rat) => KeySpec | null, chords: ChordAt[]): void {
  const chordAt = (t: Rat): string | undefined => {
    let found: string | undefined;
    for (const c of chords) if (R.lte(c.at, t)) found = c.symbol;
    return found;
  };
  slots.forEach((s, i) => {
    const single = s.events.length === 1;
    const cur = s.events[0]?.midi ?? 0;
    const nextMidi = slots[i + 1]?.events.length === 1 ? slots[i + 1]?.events[0]?.midi : undefined;
    const prevMidi = slots[i - 1]?.events.length === 1 ? slots[i - 1]?.events[0]?.midi : undefined;
    let direction: 1 | -1 | undefined;
    // Direction decides only chromatic passing notes (C C# D, E Eb D); neighbours and leaps keep the key's
    // default chromatic spelling (b3 in D major is F natural, not E#).
    const near = (m: number | null | undefined): m is number =>
      m != null && m !== cur && Math.abs(m - cur) <= 2;
    if (single && near(prevMidi) && near(nextMidi)) {
      if (prevMidi < cur && cur < nextMidi) direction = 1;
      else if (prevMidi > cur && cur > nextMidi) direction = -1;
    }
    s.pitches = s.events.map((e) => {
      const midi = Math.round(e.midi as number);
      if (e.pitchSource === "note-str" && e.written) {
        const w = parseNoteName(e.written);
        if (w && w.midi === midi) {
          const acc = w.alt > 0 ? "#".repeat(w.alt) : "b".repeat(-w.alt);
          return { midi, name: `${w.letter}${acc}${w.oct}`, letter: w.letter, alt: w.alt, oct: w.oct };
        }
      }
      const symbol = e.chordSymbol ?? chordAt(s.onset);
      const chord = symbol ? parseChord(symbol) : null;
      return spell(midi, {
        key: keyAt(s.onset),
        ...(chord ? { chord } : {}),
        ...(direction && !chord ? { direction } : {}),
      });
    });
  });
}

// --- the pipeline --------------------------------------------------------------------------------

export function buildScore(input: NotationInput): Score {
  const meter = input.meter;
  const g: Grid = gridOf(meter);
  const W = g.W;
  const startBar = input.startBar ?? 0;
  const nBars = Math.max(0, input.bars);
  const stop = startBar + nBars;
  const warnings: NotationWarning[] = [];
  let approximate = false;

  // 1. swing, range
  let events = input.events.filter((e) => R.lt([0, 1], e.dur));
  if (input.swing && meter.tempoUnit === "quarter")
    events = straightenSwing(events, meter.unitsPerBar, input.swing);
  events = events
    .filter((e) => R.lt(e.onset, [stop, 1]) && R.lt([startBar, 1], end(e)))
    .map((e) => (e.midi !== null && !Number.isInteger(e.midi) ? { ...e, midi: Math.round(e.midi) } : e));

  // 2. key
  const ctx = events.find((e) => e.scaleCtx)?.scaleCtx;
  const key: KeySpec | null =
    input.key ??
    (ctx ? keyFromScaleCtx(ctx) : null) ??
    estimateKey(events.filter((e) => e.chordSymbol === undefined));
  const keyChanges = normalizeKeyChanges(key, input.keyChanges ?? [], startBar, stop);
  const keyAt = (t: Rat): KeySpec | null => keyAtBar({ key, keyChanges }, R.floor(t));

  // 3. chord symbols (display) and their context for spelling
  const chordList: ChordAt[] = (input.chords ?? []).map((c) => ({
    at: R.add([c.bar, 1], R.div(toRat(c.beat - 1), [meter.unitsPerBar, 1])),
    symbol: c.symbol,
  }));
  if (!input.chords && input.staff === "lead") {
    let last: string | undefined;
    let lastBar = -1;
    const withSym = events.filter((e) => e.chordSymbol).sort((a, b) => R.cmp(a.onset, b.onset));
    for (const e of withSym) {
      const sym = e.chordSymbol as string;
      const bar = R.floor(e.onset);
      if (sym !== last || bar !== lastBar) {
        if (!chordList.some((c) => R.eq(c.at, e.onset))) chordList.push({ at: e.onset, symbol: sym });
      }
      last = sym;
      lastBar = bar;
    }
  }
  chordList.sort((a, b) => R.cmp(a.at, b.at));
  const inRange = (at: Rat) => R.lte([startBar, 1], at) && R.lt(at, [stop, 1]);
  const chords: ScoreAnnotation[] = chordList
    .filter((c) => inRange(c.at))
    .map((c) => ({ bar: R.floor(c.at), at: c.at, source: c.symbol, text: chordDisplay(c.symbol) }));
  const romans: ScoreAnnotation[] = (input.romans ?? [])
    .map((r) => ({ at: R.add([r.bar, 1], R.div(toRat(r.beat - 1), [meter.unitsPerBar, 1])), rn: r.rn }))
    .filter((r) => inRange(r.at))
    .map((r) => ({ bar: R.floor(r.at), at: r.at, source: r.rn, text: r.rn.replace(/h7/g, "ø7") }));

  // 4. staves and voices
  const plans = planStaves(input, events, warnings);
  // A staff whose tracks all carry one key plan of their own (`trackKeys`) other than the piece's: its own
  // signature and spelling.
  const own = plans.map((p): { key: KeySpec; keyChanges: KeyChange[] } | null => {
    if (p.kind !== "pitched" || !input.trackKeys || p.events.length === 0) return null;
    const plansOf = [...new Set(p.events.map((e) => e.track))].map((t) => input.trackKeys?.[t]);
    const first = plansOf[0];
    if (!first) return null;
    const changes = normalizeKeyChanges(first.key, first.keyChanges ?? [], startBar, stop);
    const same = (o: typeof first | undefined) =>
      o !== undefined &&
      sameKey(o.key, first.key) &&
      sameChanges(normalizeKeyChanges(o.key, o.keyChanges ?? [], startBar, stop), changes);
    if (!plansOf.every(same)) return null;
    if (sameKey(first.key, key) && sameChanges(changes, keyChanges)) return null;
    return { key: first.key, keyChanges: changes };
  });
  const keyAtOf = (pi: number): ((t: Rat) => KeySpec | null) => {
    const o = own[pi];
    return o ? (t) => keyAtBar(o, R.floor(t)) : keyAt;
  };
  const staffVoices: Slot[][][] = plans.map((p, pi) => {
    if (p.kind === "drums") return drumVoices(p.events);
    if (p.kind === "rhythm") {
      const [one] = drumVoices(p.events.map((e) => ({ ...e, midi: null, s: "rhythm" })));
      for (const s of one ?? []) {
        s.events = p.events.filter((e) => R.eq(e.onset, s.onset));
        s.pitches = [toSpelled("B4")];
        s.drums = [{ s: "rhythm", head: "normal" }];
      }
      return [one ?? []];
    }
    // Clipping at the next onset belongs to a declared swing (§6.10.6); otherwise overlaps are polyphony.
    const evs = input.swing ? clipWithinTracks(p.events) : p.events;
    const voices = assignVoices(groupSlots(evs), warnings).map((v) => v.slots);
    for (const v of voices) spellVoice(v, keyAtOf(pi), chordList);
    const ms = p.events.map((e) => e.midi as number);
    const lo = p.clef === "treble" ? 48 : 26;
    const hi = p.clef === "treble" ? 93 : 72;
    const out = p.events.find((e) => (e.midi as number) < lo || (e.midi as number) > hi);
    if (out && ms.length)
      warnings.push({
        code: "out-of-range",
        bar: R.floor(out.onset),
        message: `MIDI ${out.midi} is far outside the ${p.clef} staff`,
      });
    return voices.length ? voices : [[]];
  });
  if (warnings.some((w) => w.code === "overlap-cut")) approximate = true;

  // 5. cut positions: chord symbols on the top staff, Roman numerals on the bottom pitched staff, the pickup
  const pickupCycles = input.pickup ? R.div(input.pickup.units, [meter.unitsPerBar, 1]) : null;
  const pickupCut =
    pickupCycles && R.lt([0, 1], pickupCycles) && R.lt(pickupCycles, [1, 1])
      ? R.mul(R.sub([1, 1], pickupCycles), W)
      : null;
  const romanStaff = plans.reduce((acc, p, i) => (p.kind === "pitched" ? i : acc), 0);
  // Decide the pickup from the sounding slots before quantizing, so a refused cut never splits a note.
  const allSlots = staffVoices.flat(2);
  const silent = (from: Rat, to: Rat) => allSlots.every((s) => R.lte(s.end, from) || R.lte(to, s.onset));
  const pickupStart = pickupCut ? R.div(pickupCut, W) : null;
  const pickup = pickupStart !== null && startBar === 0 && nBars > 0 && silent([0, 1], pickupStart);
  if (pickupStart !== null && startBar === 0 && nBars > 0 && !pickup) {
    warnings.push({
      code: "out-of-range",
      bar: 0,
      message: "notes sound before the declared pickup; bar 0 is written in full",
    });
  }
  const shortenLast = pickup && nBars > 1 && silent(R.add([stop - 1, 1], pickupStart as Rat), [stop, 1]);
  const cutsFor = (si: number, vi: number, c: number): Rat[] => {
    const cuts: Rat[] = [];
    const add = (list: ScoreAnnotation[]) => {
      for (const a of list) if (a.bar === c) cuts.push(R.mul(R.sub(a.at, [c, 1]), W));
    };
    if (vi === 0 && si === 0) add(chords);
    if (vi === 0 && si === romanStaff) add(romans);
    if (pickupCut && ((pickup && c === 0) || (shortenLast && c === stop - 1))) cuts.push(pickupCut);
    return cuts.filter((x) => R.lt([0, 1], x) && R.lt(x, W)).sort(R.cmp);
  };

  // 6. quantize every voice, bar by bar
  type Bar = { c: number; items: QItem<Slot>[]; partial: boolean };
  const quantized: Bar[][][] = staffVoices.map((voices, si) =>
    voices.map((slots, vi) => {
      const bars: Bar[] = [];
      for (let c = startBar; c < stop; c++) {
        const b0: Rat = [c, 1];
        const b1: Rat = [c + 1, 1];
        const segs: Seg<Slot>[] = [];
        let cursor: Rat = [0, 1];
        for (const s of slots) {
          if (R.lte(s.end, b0) || R.lte(b1, s.onset)) continue;
          const a = R.mul(R.sub(R.max(s.onset, b0), b0), W);
          const z = R.mul(R.sub(R.min(s.end, b1), b0), W);
          if (R.lte(z, cursor)) continue;
          const from = R.max(a, cursor);
          if (R.lt(cursor, from))
            segs.push({ start: cursor, end: from, slot: null, tieIn: false, tieOut: false });
          segs.push({ start: from, end: z, slot: s, tieIn: R.lt(s.onset, b0), tieOut: R.lt(b1, s.end) });
          cursor = z;
        }
        if (R.lt(cursor, W)) segs.push({ start: cursor, end: W, slot: null, tieIn: false, tieOut: false });
        const res = quantizeBar(g, segs, cutsFor(si, vi, c));
        if (res.approximate) approximate = true;
        for (const w of res.warnings) warnings.push({ ...w, bar: c });
        bars.push({ c, items: res.items, partial: false });
      }
      return bars;
    }),
  );

  // 7. pickup: bar 0 holds only the pickup; the last bar loses trailing rests as long as the pickup
  if (pickupCut && pickup) {
    for (const v of quantized.flat()) {
      const first = v[0] as Bar;
      first.items = first.items.filter((it) => R.lte(pickupCut, it.start));
      first.partial = true;
      if (first.items[0]) first.items[0].breakBefore = false;
      if (shortenLast) {
        const last = v[v.length - 1] as Bar;
        last.items = last.items.filter((it) => R.lt(it.start, pickupCut));
        last.partial = true;
      }
    }
  }

  // 8. NoteItems, ids, lyrics
  let nextN = 0;
  const lyricStaff = 0;
  const annotations = annotationsOn(input.annotations) ? input.annotations : undefined;
  // The annotation lines replace the single lyric line of `labels`.
  const labels = annotations ? "none" : (input.labels ?? "none");
  const staves: Staff[] = plans.map((p, si) => {
    const voices: Voice[] = (quantized[si] ?? []).map((bars, vi) => ({
      id: vi === 0 ? p.id : `${p.id}v${vi + 1}`,
      bars: bars.map((b) => {
        const hasNotes = b.items.some((it) => it.slot !== null);
        const items: NoteItem[] = b.items.map((it) => {
          const slot = it.slot;
          const written = writtenOf(it.written) ?? { base: 4, dots: 0 };
          const item: NoteItem = {
            kind: slot === null ? "rest" : slot.pitches.length > 1 ? "chord" : "note",
            n: null,
            eventIds: slot ? slot.events.map((e) => e.id) : [],
            pitches: slot ? slot.pitches : [],
            onset: R.add([b.c, 1], R.div(it.start, W)),
            dur: R.div(it.dur, W),
            written,
            tieToNext: it.tieToNext,
            tieFromPrev: it.tieFromPrev,
            ...(it.tupletStart ? { tupletStart: it.tupletStart } : {}),
            inTuplet: it.inTuplet,
            breakBefore: it.breakBefore,
          };
          if (slot) {
            if (slot.n === null) slot.n = nextN++;
            item.n = slot.n;
            const locs = slot.events.flatMap((e) => e.locs);
            if (locs.length) item.locs = locs;
            if (slot.drums?.length === 1) item.drum = slot.drums[0] as { s: string; head: "normal" | "x" };
            else if (slot.drums && slot.drums.length > 1) item.drums = slot.drums;
          } else if (vi > 0 && !hasNotes) item.hidden = true;
          if (si === lyricStaff && vi === 0 && slot && !it.tieFromPrev && labels !== "none") {
            const lyric = lyricOf(labels, item, p.kind, keyAtOf(si)(item.onset), it.start, b.c, input);
            if (lyric) item.lyric = lyric;
          }
          return item;
        });
        return { index: b.c, partial: b.partial, items };
      }),
    }));
    const o = own[si];
    return {
      id: p.id,
      clef: p.clef,
      lines: p.lines,
      voices,
      ...(o ? { key: o.key, ...(o.keyChanges.length ? { keyChanges: o.keyChanges } : {}) } : {}),
    };
  });

  warnings.push(...abcjsLimitWarnings({ key, staves }));
  const swingText = input.swing ? (input.swing.subdivision === 8 ? "Swing 8ths" : "Swing 16ths") : undefined;
  return {
    meter,
    key,
    ...(keyChanges.length ? { keyChanges } : {}),
    ...(input.tempoBpm !== undefined ? { tempoBpm: input.tempoBpm } : {}),
    ...(swingText ? { swingText } : {}),
    staves,
    bars: nBars,
    startBar,
    pickup,
    approximate,
    warnings,
    ...(chords.length ? { chords } : {}),
    ...(romans.length ? { romans } : {}),
    ...(annotations ? { annotations } : {}),
    ...(input.title ? { title: input.title } : {}),
  };
}

/** True when an annotation set switches at least one line on. */
export function annotationsOn(a: NotationInput["annotations"]): boolean {
  return !!a && !!(a.degree || a.solfege || a.noteName);
}

function lyricOf(
  labels: "degree" | "solfege" | "counts",
  item: NoteItem,
  kind: StaffPlan["kind"],
  key: KeySpec | null,
  start: Rat,
  c: number,
  input: NotationInput,
): string | undefined {
  if (labels === "counts") return countLabel(R.div(start, gridOf(input.meter).W), input.meter) || undefined;
  if (kind !== "pitched") return undefined;
  const top = item.pitches[item.pitches.length - 1];
  if (!top) return undefined;
  const d = degreeLabel(top, key ?? { tonic: "C", mode: "major" });
  void c;
  return labels === "degree" ? d.degree.replace(/b/g, "♭").replace(/#/g, "♯") : d.syllable;
}

/** Display bar (1-based; 0 is the pickup bar) and 1-based beat of an onset. */
const sameChanges = (a: readonly KeyChange[], b: readonly KeyChange[]) =>
  a.length === b.length && a.every((c, i) => c.bar === b[i]?.bar && sameKey(c.key, b[i]?.key ?? null));
const sameKey = (a: KeySpec | null, b: KeySpec | null) =>
  a === b || (a !== null && b !== null && a.tonic === b.tonic && a.mode === b.mode);

/** Key changes strictly inside the engraved bars, in order, each to a key other than the one in force. */
function normalizeKeyChanges(
  start: KeySpec | null,
  changes: readonly KeyChange[],
  startBar: number,
  stop: number,
): KeyChange[] {
  const out: KeyChange[] = [];
  let current = start;
  const inside = [...changes]
    .filter((c) => Number.isInteger(c.bar) && c.bar > startBar && c.bar < stop)
    .sort((a, b) => a.bar - b.bar);
  for (const c of inside) {
    const last = out[out.length - 1];
    if (last && last.bar === c.bar) {
      out.pop();
      current = out[out.length - 1]?.key ?? start;
    }
    if (sameKey(current, c.key)) continue;
    out.push({ bar: c.bar, key: c.key });
    current = c.key;
  }
  return out;
}

/** The key signature in force at cycle `bar` (absolute, 0-based). */
export function keyAtBar(score: Pick<Score, "key" | "keyChanges">, bar: number): KeySpec | null {
  let key = score.key;
  for (const c of score.keyChanges ?? []) if (c.bar <= bar) key = c.key;
  return key;
}

export function barBeat(score: Score, onset: Rat): { bar: number; beat: number } {
  const inBar = R.frac(onset);
  return { bar: barOf(onset, score.pickup), beat: 1 + R.toNum(inBar) * score.meter.unitsPerBar };
}

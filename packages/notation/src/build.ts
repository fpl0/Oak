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
  chordForSpelling,
  countLabel,
  degreeLabel,
  keyFromScaleCtx,
  parseNoteName,
  romanDisplay,
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
function spellVoice(slots: Slot[], keyAt: (t: Rat, e: NEvent) => KeySpec | null, chords: ChordAt[]): void {
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
      const chord = symbol ? chordForSpelling(symbol) : null;
      return spell(midi, {
        key: keyAt(s.onset, e),
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
  // A declared pickup (contracts §6.11): cycle 0 holds only the lead-in. Other tracks rest there or play a
  // count-in; a drum count-in before the pickup is not engraved (bar 0 is a partial measure on every staff).
  const pickupCycles = input.pickup ? R.div(input.pickup.units, [meter.unitsPerBar, 1]) : null;
  const pickupDeclared = pickupCycles !== null && R.lt([0, 1], pickupCycles) && R.lt(pickupCycles, [1, 1]);
  const pickupStart: Rat | null = pickupDeclared ? R.sub([1, 1], pickupCycles as Rat) : null;
  if (pickupStart && startBar === 0)
    events = events.filter((e) => !(isDrum(e) && R.lt(e.onset, pickupStart)));

  // 2. key
  const ctx = events.find((e) => e.scaleCtx)?.scaleCtx;
  const key: KeySpec | null =
    input.key ??
    (ctx ? keyFromScaleCtx(ctx) : null) ??
    estimateKey(events.filter((e) => e.chordSymbol === undefined));
  const upb = meter.unitsPerBar;
  const keyChanges = normalizeKeyChanges(key, input.keyChanges ?? [], startBar, stop, upb);
  const piecePlan: KeyPlan = { key, keyChanges };
  const atBeat = (bar: number, beat: number): Rat => R.add([bar, 1], R.div(toRat(beat - 1), [upb, 1]));

  // 3. chord symbols (display) and their context for spelling
  const chordList: ChordAt[] = (input.chords ?? []).map((c) => ({
    at: atBeat(c.bar, c.beat),
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
  // One label per position (the last given wins), in time order.
  const onePerPosition = (list: ScoreAnnotation[]) =>
    list.filter((a, i) => !list.slice(i + 1).some((b) => R.eq(a.at, b.at)));
  const chords: ScoreAnnotation[] = onePerPosition(
    chordList
      .filter((c) => inRange(c.at))
      .map((c) => ({ bar: R.floor(c.at), at: c.at, source: c.symbol, text: chordDisplay(c.symbol) })),
  );
  const romans: ScoreAnnotation[] = onePerPosition(
    (input.romans ?? [])
      .map((r) => ({ at: atBeat(r.bar, r.beat), rn: r.rn }))
      .filter((r) => inRange(r.at))
      .sort((a, b) => R.cmp(a.at, b.at))
      .map((r) => ({ bar: R.floor(r.at), at: r.at, source: r.rn, text: romanDisplay(r.rn) })),
  );

  // 4. staves and voices
  const plans = planStaves(input, events, warnings);
  // Each track's key plan: its own (`trackKeys`, a key its code states) or the piece's.
  const trackPlan = new Map<string, KeyPlan>();
  const planOfTrack = (track: string): KeyPlan => {
    const known = trackPlan.get(track);
    if (known) return known;
    const t = input.trackKeys?.[track];
    const plan = t
      ? { key: t.key, keyChanges: normalizeKeyChanges(t.key, t.keyChanges ?? [], startBar, stop, upb) }
      : piecePlan;
    trackPlan.set(track, plan);
    return plan;
  };
  // A staff whose tracks all carry one key plan other than the piece's shows that signature. A staff that mixes
  // tracks in two keys shows the signature of the plan most of its notes are in (the piece's on a tie) and spells
  // every note in its own track's key, so the accidentals say which notes belong to the other key.
  const own = plans.map((p): KeyPlan | null => {
    if (p.kind !== "pitched" || !input.trackKeys || p.events.length === 0) return null;
    const count = new Map<KeyPlan, number>();
    for (const e of p.events) {
      const pl = planOfTrack(e.track);
      const same = [...count.keys()].find((q) => samePlan(q, pl)) ?? pl;
      count.set(same, (count.get(same) ?? 0) + 1);
    }
    const ranked = [...count.entries()].sort(
      (a, b) => b[1] - a[1] || (samePlan(b[0], piecePlan) ? 1 : 0) - (samePlan(a[0], piecePlan) ? 1 : 0),
    );
    const sig = ranked[0]?.[0] as KeyPlan;
    return samePlan(sig, piecePlan) ? null : sig;
  });
  const sigPlanOf = (pi: number): KeyPlan => own[pi] ?? piecePlan;
  const spellKey = (t: Rat, e: NEvent): KeySpec | null => keyAtPlan(planOfTrack(e.track), t, upb);
  const staffVoices: Slot[][][] = plans.map((p) => {
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
    for (const v of voices) spellVoice(v, spellKey, chordList);
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

  // 5. cut positions: chord symbols on the top staff, Roman numerals on the bottom pitched staff, key changes
  // inside a bar (every voice of the staves they belong to), the pickup
  const pickupCut = pickupStart ? R.mul(pickupStart, W) : null;
  const romanStaff = plans.reduce((acc, p, i) => (p.kind === "pitched" ? i : acc), 0);
  // Decide the pickup from the sounding slots before quantizing, so a refused cut never splits a note.
  const allSlots = staffVoices.flat(2);
  const silent = (from: Rat, to: Rat) => allSlots.every((s) => R.lte(s.end, from) || R.lte(to, s.onset));
  const pickup = pickupStart !== null && startBar === 0 && nBars > 0 && silent([0, 1], pickupStart);
  if (pickupStart !== null && startBar === 0 && nBars > 0 && !pickup) {
    warnings.push({
      code: "out-of-range",
      bar: 0,
      message: "notes sound before the declared pickup; bar 0 is written in full",
    });
  }
  // The last bar of the piece loses trailing rests as long as the pickup (also on a later page of the piece).
  const shortenLast =
    (pickup || (pickupStart !== null && startBar > 0)) &&
    input.endsPiece !== false &&
    nBars > (pickup ? 1 : 0) &&
    silent(R.add([stop - 1, 1], pickupStart as Rat), [stop, 1]);
  const inBar = (x: Rat) => R.lt([0, 1], x) && R.lt(x, W);
  /** Cuts every voice of a staff must have (key changes inside a bar, the pickup), in bar positions. */
  const cutsFor = (si: number, c: number): Rat[] => {
    const cuts: Rat[] = [];
    if (plans[si]?.kind === "pitched")
      for (const k of sigPlanOf(si).keyChanges) {
        const a = changeAt(k, upb);
        if (R.floor(a) === c) cuts.push(R.mul(R.sub(a, [c, 1]), W));
      }
    if (pickupCut && ((pickup && c === 0) || (shortenLast && c === stop - 1))) cuts.push(pickupCut);
    return cuts.filter(inBar).sort(R.cmp);
  };
  /** Where the labels of a voice stand in bar `c` (symbols on the top staff, numerals on the bottom one). */
  const labelCutsFor = (si: number, vi: number, c: number): Rat[] => {
    const cuts: Rat[] = [];
    const add = (list: readonly { at: Rat }[]) => {
      for (const a of list) if (R.floor(a.at) === c) cuts.push(R.mul(R.sub(a.at, [c, 1]), W));
    };
    if (vi === 0 && si === 0) add(chords);
    if (vi === 0 && si === romanStaff) add(romans);
    return cuts.filter(inBar);
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
        // A label needs an item that starts where it stands: the note under it is split there (tied), unless
        // that would cut into a tuplet: then it is drawn on the item sounding there (`anchor` below warns).
        const fixed = cutsFor(si, c);
        let res = quantizeBar(g, segs, fixed);
        const wanted = labelCutsFor(si, vi, c).filter((x) => !res.items.some((it) => R.eq(it.start, x)));
        const kept = wanted.filter((x) => {
          const host = res.items.find((it) => R.lt(it.start, x) && R.lt(x, R.add(it.start, it.dur)));
          return !host?.inTuplet;
        });
        if (kept.length) res = quantizeBar(g, segs, [...fixed, ...kept].sort(R.cmp));
        if (res.approximate) approximate = true;
        for (const w of res.warnings) warnings.push({ ...w, bar: c });
        bars.push({ c, items: res.items, partial: false });
      }
      return bars;
    }),
  );

  // 7. pickup: bar 0 holds only the pickup; the last bar loses trailing rests as long as the pickup
  if (pickupCut && (pickup || shortenLast)) {
    for (const v of quantized.flat()) {
      if (pickup) {
        const first = v[0] as Bar;
        first.items = first.items.filter((it) => R.lte(pickupCut, it.start));
        first.partial = true;
        if (first.items[0]) first.items[0].breakBefore = false;
      }
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
            const first = slot.events[0];
            const k = first ? spellKey(item.onset, first) : keyAtPlan(sigPlanOf(si), item.onset, upb);
            const lyric = lyricOf(labels, item, p.kind, k, it.start, b.c, input);
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

  // A label is drawn on the note or rest that starts where it does (the cuts above made one); inside a tuplet or
  // a snapped bar there may be none: it is drawn on the item sounding there, and the Score warns.
  const anchor = (list: ScoreAnnotation[], si: number, what: string) => {
    const items = staves[si]?.voices[0]?.bars.flatMap((b) => b.items) ?? [];
    for (const a of list) {
      if (items.some((it) => R.eq(it.onset, a.at))) continue;
      const host = items.find((it) => R.lte(it.onset, a.at) && R.lt(a.at, R.add(it.onset, it.dur)));
      if (!host) continue;
      a.drawnAt = host.onset;
      warnings.push({
        code: "abcjs-limit",
        bar: a.bar,
        message: `the ${what} "${a.source}" falls inside a tuplet: drawn at the note sounding there`,
      });
    }
  };
  anchor(chords, 0, "chord symbol");
  anchor(romans, romanStaff, "Roman numeral");

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
    ...(pickupStart !== null && (pickup || startBar > 0) ? { pickupNumbering: true as const } : {}),
    ...(input.staff === "lead" ? { lead: true as const } : {}),
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

/** A key plan: the signature at the start and its changes inside the engraved bars. */
interface KeyPlan {
  key: KeySpec | null;
  keyChanges: KeyChange[];
}
const sameChanges = (a: readonly KeyChange[], b: readonly KeyChange[]) =>
  a.length === b.length &&
  a.every(
    (c, i) => c.bar === b[i]?.bar && (c.beat ?? 1) === (b[i]?.beat ?? 1) && sameKey(c.key, b[i]?.key ?? null),
  );
const sameKey = (a: KeySpec | null, b: KeySpec | null) =>
  a === b || (a !== null && b !== null && a.tonic === b.tonic && a.mode === b.mode);
const samePlan = (a: KeyPlan, b: KeyPlan) =>
  a === b || (sameKey(a.key, b.key) && sameChanges(a.keyChanges, b.keyChanges));

/** Where a key change starts, in cycles (absolute): its bar, plus its beat inside the bar. */
export function changeAt(c: KeyChange, unitsPerBar: number): Rat {
  const beat = c.beat ?? 1;
  return beat === 1 ? [c.bar, 1] : R.add([c.bar, 1], R.div(toRat(beat - 1), [unitsPerBar, 1]));
}
/** The key in force at an onset (a change inside a bar takes effect from its beat). */
function keyAtPlan(plan: KeyPlan, t: Rat, unitsPerBar: number): KeySpec | null {
  let key = plan.key;
  for (const c of plan.keyChanges) if (R.lte(changeAt(c, unitsPerBar), t)) key = c.key;
  return key;
}

/**
 * Key changes strictly inside the engraved bars (a change at `startBar`'s bar line is the page's starting key,
 * not a change), in order, each to a key other than the one in force; two at one position: the last wins.
 */
function normalizeKeyChanges(
  start: KeySpec | null,
  changes: readonly KeyChange[],
  startBar: number,
  stop: number,
  unitsPerBar: number,
): KeyChange[] {
  const out: KeyChange[] = [];
  let current = start;
  const valid = (c: KeyChange) =>
    Number.isInteger(c.bar) &&
    Number.isFinite(c.beat ?? 1) &&
    (c.beat ?? 1) >= 1 &&
    (c.beat ?? 1) < unitsPerBar + 1;
  const inside = changes
    .filter(valid)
    .map((c) => ({ c, at: changeAt(c, unitsPerBar) }))
    .filter((x) => R.lt([startBar, 1], x.at) && R.lt(x.at, [stop, 1]))
    .sort((a, b) => R.cmp(a.at, b.at));
  let lastAt: Rat | null = null;
  for (const { c, at } of inside) {
    if (lastAt && R.eq(lastAt, at)) {
      const prev = out[out.length - 1];
      if (prev && R.eq(changeAt(prev, unitsPerBar), at)) out.pop();
      current = out[out.length - 1]?.key ?? start;
    }
    lastAt = at;
    if (sameKey(current, c.key)) continue;
    out.push(
      (c.beat ?? 1) === 1 ? { bar: c.bar, key: c.key } : { bar: c.bar, beat: c.beat as number, key: c.key },
    );
    current = c.key;
  }
  return out;
}

/**
 * The key signature in force at the start of cycle `bar` (absolute, 0-based). A change inside the bar (`beat` > 1)
 * is not in force yet: `keyAtOnset` reads inside a bar.
 */
export function keyAtBar(score: Pick<Score, "key" | "keyChanges">, bar: number): KeySpec | null {
  let key = score.key;
  for (const c of score.keyChanges ?? [])
    if (c.bar < bar || (c.bar === bar && (c.beat ?? 1) <= 1)) key = c.key;
  return key;
}
/** The key signature in force at an onset (cycles), changes inside a bar included. */
export function keyAtOnset(score: Pick<Score, "key" | "keyChanges" | "meter">, onset: Rat): KeySpec | null {
  return keyAtPlan({ key: score.key, keyChanges: score.keyChanges ?? [] }, onset, score.meter.unitsPerBar);
}

/** Display bar (1-based; 0 is the pickup bar) and 1-based beat of an onset. */
export function barBeat(score: Score, onset: Rat): { bar: number; beat: number } {
  const inBar = R.frac(onset);
  return {
    bar: barOf(onset, score.pickup || !!score.pickupNumbering),
    beat: 1 + R.toNum(inBar) * score.meter.unitsPerBar,
  };
}

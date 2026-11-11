// Event utilities every matcher and analyzer shares: exact onset sets, simultaneities, skyline and bass
// lines, sounding notes, bar positions for diagnostics. Everything here is pure and works on `NEvent`s.
import type { DrumRole, Loc, MeterId, NEvent, PickupSpec, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { barPosition, METERS } from "@oak/theory";

export const num = (r: Rat): number => r[0] / r[1];
export const ratKey = (r: Rat): string => `${r[0]}/${r[1]}`;
export const cmpRat = (a: Rat, b: Rat): number => R.cmp(a, b);

/** Nearest rational to `x` with a denominator of at most `maxDen` (continued fractions). `0.3333…` → 1/3. */
export function toRat(x: number, maxDen = 1000): Rat {
  if (!Number.isFinite(x)) throw new RangeError(`not a finite number: ${x}`);
  const sign = x < 0 ? -1 : 1;
  let v = Math.abs(x);
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  for (let i = 0; i < 32; i++) {
    const a = Math.floor(v);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    [h0, h1, k0, k1] = [h1, h2, k1, k2];
    const f = v - a;
    if (f < 1e-9) break;
    v = 1 / f;
  }
  return rat(sign * h1, k1 || 1);
}

/** Sorted by (onset, midi, id): the order every array of events in the grader has. */
export function sortEvents<T extends NEvent>(events: readonly T[]): T[] {
  return [...events].sort(
    (a, b) =>
      R.cmp(a.onset, b.onset) || (a.midi ?? -1) - (b.midi ?? -1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export const pitched = (events: readonly NEvent[]): (NEvent & { midi: number })[] =>
  events.filter((e): e is NEvent & { midi: number } => e.midi !== null);
export const drums = (events: readonly NEvent[]): NEvent[] => events.filter((e) => e.drum !== undefined);

/** The 0-based cycle an event starts in. */
export const cycleOf = (e: Pick<NEvent, "onset">): number => R.floor(e.onset);
/** Events with an onset in cycles [from, to). */
export function inCycles<T extends NEvent>(events: readonly T[], from: number, to: number): T[] {
  return events.filter((e) => {
    const c = R.floor(e.onset);
    return c >= from && c < to;
  });
}
/** Events whose onset is before `bars`. */
export const firstBars = <T extends NEvent>(events: readonly T[], bars: number): T[] =>
  inCycles(events, 0, bars);

/** Sorted, deduplicated onsets. */
export function onsets(events: readonly NEvent[], o: { drum?: DrumRole; dedupe?: boolean } = {}): Rat[] {
  const src = o.drum ? events.filter((e) => e.drum === o.drum) : events;
  const sorted = src.map((e) => e.onset).sort(R.cmp);
  if (o.dedupe === false) return sorted;
  const out: Rat[] = [];
  for (const r of sorted) if (out.length === 0 || !R.eq(out[out.length - 1] as Rat, r)) out.push(r);
  return out;
}

export interface Simultaneity {
  onset: Rat;
  /** Longest duration among the notes that start here. */
  dur: Rat;
  /** Ascending. */
  midis: number[];
  ids: string[];
  events: NEvent[];
}
/** Pitched events grouped by exact onset. */
export function simultaneities(events: readonly NEvent[]): Simultaneity[] {
  const out: Simultaneity[] = [];
  for (const e of sortEvents(pitched(events))) {
    const last = out[out.length - 1];
    if (last && R.eq(last.onset, e.onset)) {
      last.midis.push(e.midi);
      last.ids.push(e.id);
      last.events.push(e);
      last.dur = R.max(last.dur, e.dur);
    } else out.push({ onset: e.onset, dur: e.dur, midis: [e.midi], ids: [e.id], events: [e] });
  }
  for (const s of out) s.midis.sort((a, b) => a - b);
  return out;
}

/** Highest pitched event per onset. */
export function skyline(events: readonly NEvent[]): (NEvent & { midi: number })[] {
  return simultaneities(events).map(
    (s) =>
      s.events.reduce((hi, e) => ((e.midi ?? -1) > (hi.midi ?? -1) ? e : hi)) as NEvent & { midi: number },
  );
}
/** Lowest pitched event per onset. */
export function bassline(events: readonly NEvent[]): (NEvent & { midi: number })[] {
  return simultaneities(events).map(
    (s) =>
      s.events.reduce((lo, e) => ((e.midi ?? 999) < (lo.midi ?? 999) ? e : lo)) as NEvent & { midi: number },
  );
}
/** Pitched events sounding at `at` (onset ≤ at < onset + dur). */
export function sounding(events: readonly NEvent[], at: Rat): (NEvent & { midi: number })[] {
  return pitched(events).filter((e) => R.lte(e.onset, at) && R.lt(at, R.add(e.onset, e.dur)));
}

/** The length a note is heard for: clipped by `clip`/`legato`, and by the next onset of a monophonic line. */
export function effectiveDur(e: NEvent, nextOnset?: Rat): Rat {
  const own = e.clipDur ?? e.dur;
  if (!nextOnset) return own;
  const gap = R.sub(nextOnset, e.onset);
  return R.lt(gap, own) && gap[0] > 0 ? gap : own;
}

/** True when no onset carries more than one pitch. */
export function isMonophonic(events: readonly NEvent[]): boolean {
  return simultaneities(events).every((s) => s.midis.length === 1);
}

export interface PosContext {
  meter: MeterId;
  pickup?: PickupSpec;
}
/** Where a diagnostic points: bar (0 = the pickup bar), beat, beat label, and optionally the track, notes and code. */
export function locAt(onset: Rat, ctx: PosContext, extra: Partial<Loc> = {}): Loc {
  const p = barPosition(onset, ctx.meter, ctx.pickup);
  return { bar: p.bar, beat: p.beat, beatLabel: p.label, ...extra };
}
/** `locAt` for an event, with its track, id and code ranges. */
export function locOf(e: NEvent, ctx: PosContext, extra: Partial<Loc> = {}): Loc {
  return locAt(e.onset, ctx, {
    track: e.track,
    noteIds: [e.id],
    ...(e.locs.length > 0 ? { code: e.locs } : {}),
    ...extra,
  });
}

/** One tempo unit (the "beat" BPM counts) in cycles. */
export function beatLen(meter: MeterId): Rat {
  return rat(1, METERS[meter].unitsPerBar);
}
/** One eighth note in cycles: quarter meters have 2 per tempo unit, dotted-quarter meters 3, eighth meters 1. */
export function eighthLen(meter: MeterId): Rat {
  const m = METERS[meter];
  const perUnit = m.tempoUnit === "quarter" ? 2 : m.tempoUnit === "dottedQuarter" ? 3 : 1;
  return rat(1, m.unitsPerBar * perUnit);
}

/** Position of an onset inside its bar, in [0, 1). */
export const inBar = (onset: Rat): Rat => R.frac(onset);

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}
export function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
/** Most frequent value; ties go to the value seen first. */
export function modeOf<T>(xs: readonly T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestN = 0;
  for (const x of xs) {
    const n = (counts.get(x) ?? 0) + 1;
    counts.set(x, n);
    if (n > bestN) {
      best = x;
      bestN = n;
    }
  }
  return best;
}
export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
export const mod12 = (x: number): number => ((Math.round(x) % 12) + 12) % 12;

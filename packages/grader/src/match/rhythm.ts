// The rhythm matcher (exercises §3.3, contracts §6.10–§6.11): onset sets compared with a tolerance,
// per-role F-measure, durations of monophonic lines, displacement and pickup detection, subdivision,
// period and swing findings.
import type { Diagnostic, Matcher, MeterId, NEvent, PickupSpec, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { effectiveDur, isMonophonic, locAt, locOf, pitched, ratKey, sortEvents } from "../analyze/events.ts";
import { finestGrid, gridFeel } from "../analyze/meter.ts";
import { swingRatio } from "../analyze/swing.ts";
import { periodOf, roleOfTrack, selectTracks } from "../analyze/tracks.ts";
import { diag } from "../feedback/catalog.ts";
import type { MatchResult, NormalizeContext, Normalized } from "../types.ts";
import { alignFeel, clampScore, f1, lengthLabel, shiftLabel } from "./common.ts";

export interface OnsetMatch {
  /** [target index, answer index]. */
  pairs: [number, number][];
  missing: number[];
  extra: number[];
}
/**
 * Matches two sorted onset lists. With `tol = 0` it is exact rational intersection; otherwise a
 * two-pointer greedy, which is maximum-cardinality for a uniform window.
 */
export function matchOnsets(t: readonly Rat[], a: readonly Rat[], tol: Rat = [0, 1]): OnsetMatch {
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  const missing: number[] = [];
  const extra: number[] = [];
  while (i < t.length && j < a.length) {
    const d = R.sub(a[j] as Rat, t[i] as Rat);
    if (R.lte(R.abs(d), tol)) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (d[0] < 0) extra.push(j++);
    else missing.push(i++);
  }
  while (i < t.length) missing.push(i++);
  while (j < a.length) extra.push(j++);
  return { pairs, missing, extra };
}

const dedupe = (xs: readonly Rat[]): Rat[] => {
  const out: Rat[] = [];
  for (const x of [...xs].sort(R.cmp))
    if (out.length === 0 || !R.eq(out[out.length - 1] as Rat, x)) out.push(x);
  return out;
};
const mod = (x: Rat, p: Rat): Rat => {
  const q = R.div(x, p);
  return R.mul(R.frac(q), p);
};

/**
 * The circular shift of the answer (a multiple of `grid`, within one `period`) that best matches the
 * target. Shifts of 0 are skipped. Returns the shift (positive = the answer is later) and its F1.
 */
export function bestDisplacement(
  t: readonly Rat[],
  a: readonly Rat[],
  period: Rat,
  grid: Rat,
): { shift: Rat; f1: number } {
  const steps = R.floor(R.div(period, grid));
  const tm = dedupe(t.map((x) => mod(x, period)));
  let best = { shift: rat(0), f1: -1 };
  for (let k = 1; k < steps; k++) {
    const s = R.mul(grid, [k, 1]);
    const shifted = dedupe(a.map((x) => mod(R.sub(x, s), period)));
    const m = matchOnsets(tm, shifted);
    const score = f1(m.pairs.length, tm.length, shifted.length);
    // Report the shift as the smallest move: 7/8 of a bar later is 1/8 earlier.
    const signed = R.lt(R.mul(s, [2, 1]), period) || R.eq(R.mul(s, [2, 1]), period) ? s : R.sub(s, period);
    if (
      score > best.f1 + 1e-9 ||
      (Math.abs(score - best.f1) < 1e-9 && R.lt(R.abs(signed), R.abs(best.shift)))
    )
      best = { shift: signed, f1: score };
  }
  return best.f1 < 0 ? { shift: rat(0), f1: 0 } : best;
}

/** F1 of the answer shifted linearly (not circularly) by `shift` cycles. */
export function linearShiftF1(t: readonly Rat[], a: readonly Rat[], shift: Rat): number {
  const m = matchOnsets(
    t,
    a.map((x) => R.sub(x, shift)),
  );
  return f1(m.pairs.length, t.length, a.length);
}

interface Group {
  key: string;
  label: string;
  target: NEvent[];
  answer: NEvent[];
  pitchedLine: boolean;
}
function groupKey(n: Normalized, e: NEvent): string {
  if (e.drum) return `drum:${e.drum}`;
  return `line:${roleOfTrack(n, e.track) ?? e.track}`;
}
const ROLE_WORDS: Record<string, string> = {
  hatClosed: "hi-hat",
  hatOpen: "open hi-hat",
  melody: "melody",
};
function groupLabel(key: string): string {
  const [, name] = key.split(":") as [string, string];
  return ROLE_WORDS[name] ?? name;
}

/** First onset of each distinct onset group, with the event it came from. */
function onsetEvents(events: readonly NEvent[]): NEvent[] {
  const seen = new Set<string>();
  const out: NEvent[] = [];
  for (const e of sortEvents(events)) {
    const k = ratKey(e.onset);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

export type RhythmMatcher = Extract<Matcher, { m: "rhythm" }>;

/**
 * Scores the answer's rhythm against the reference (exercises §3.3 `rhythmScore`, contracts §6.10–6.11).
 */
export function rhythmMatch(
  reference: Normalized,
  answer: Normalized,
  cfg: RhythmMatcher,
  ctx: NormalizeContext,
): MatchResult {
  const meter: MeterId = ctx.meter;
  const rawT = selectTracks(reference, cfg.tracks);
  const rawA = selectTracks(answer, cfg.tracks);
  const [tEvents, aEvents] = alignFeel(rawT, rawA, ctx);
  const tol = cfg.tol;
  const diagnostics: Diagnostic[] = [];
  const pos = { meter, ...(ctx.pickup ? { pickup: ctx.pickup } : {}) };

  // 1. Groups: per drum role and per pitched line (by role), or everything as one onset set.
  const groups = new Map<string, Group>();
  const add = (side: "target" | "answer", n: Normalized, e: NEvent): void => {
    const key = cfg.perRole ? groupKey(n, e) : "all:rhythm";
    const g = groups.get(key) ?? {
      key,
      label: groupLabel(key),
      target: [],
      answer: [],
      pitchedLine: !e.drum,
    };
    g[side].push(e);
    groups.set(key, g);
  };
  for (const e of tEvents) add("target", reference, e);
  for (const e of aEvents) add("answer", answer, e);

  let weighted = 0;
  let totalW = 0;
  let durHits = 0;
  let durPairs = 0;
  const overlay: NonNullable<MatchResult["overlay"]> = { answer: [], missing: [] };
  const perNote: Diagnostic[] = [];
  for (const g of groups.values()) {
    const tOn = onsetEvents(g.target);
    const aOn = onsetEvents(g.answer);
    const m = matchOnsets(
      tOn.map((e) => e.onset),
      aOn.map((e) => e.onset),
      tol,
    );
    const w = cfg.perRole && cfg.roleWeight === "equal" ? 1 : Math.max(tOn.length, aOn.length);
    weighted += f1(m.pairs.length, tOn.length, aOn.length) * w;
    totalW += w;
    const role = cfg.perRole || g.key.startsWith("drum:") ? ` (${g.label})` : "";
    if (tOn.length > 0 && aOn.length === 0 && cfg.perRole) {
      diagnostics.push(diag("rhythm.role-missing", { role: g.label }, undefined, "rhythm"));
    } else {
      for (const i of m.missing) {
        const e = tOn[i] as NEvent;
        perNote.push(diag("rhythm.missing", { role }, locAt(e.onset, pos, { track: e.track }), "rhythm"));
        overlay.missing.push(e);
      }
    }
    for (const j of m.extra) {
      const e = aOn[j] as NEvent;
      perNote.push(diag("rhythm.extra", { role }, locOf(e, pos), "rhythm"));
    }
    const okIds = new Set(m.pairs.map(([, j]) => (aOn[j] as NEvent).onset).map(ratKey));
    for (const e of g.answer) overlay.answer.push({ id: e.id, ok: okIds.has(ratKey(e.onset)) });

    // 3. Durations, for monophonic pitched lines only.
    if (cfg.durations && g.pitchedLine && isMonophonic(g.target) && isMonophonic(g.answer)) {
      const tp = pitched(tOn);
      const ap = pitched(aOn);
      for (const [i, j] of m.pairs) {
        const te = tOn[i] as NEvent;
        const ae = aOn[j] as NEvent;
        if (!tp.includes(te as never) || !ap.includes(ae as never)) continue;
        const td = effectiveDur(te, tOn[i + 1]?.onset);
        const ad = effectiveDur(ae, aOn[j + 1]?.onset);
        durPairs++;
        if (R.eq(td, ad)) durHits++;
        else
          perNote.push(
            diag(
              "rhythm.duration",
              { got: lengthLabel(ad, meter), expected: lengthLabel(td, meter) },
              locOf(ae, pos),
              "duration",
            ),
          );
      }
    }
  }
  const F1 = totalW === 0 ? 1 : weighted / totalW;
  const durAcc = durPairs === 0 ? 1 : durHits / durPairs;
  let score = F1 * (cfg.durations ? 0.8 + 0.2 * durAcc : 1);

  // 4. Displacement and pickups: one finding replaces the per-note ones.
  const tAll = dedupe(tEvents.map((e) => e.onset));
  const aAll = dedupe(aEvents.map((e) => e.onset));
  let replaced = false;
  if (F1 < 1 && tAll.length > 0 && aAll.length > 0) {
    if (ctx.pickup) {
      const p = R.div(ctx.pickup.units, [ctxUnits(meter), 1]);
      for (const shift of [p, R.neg(R.sub(rat(1), p))]) {
        if (linearShiftF1(tAll, aAll, shift) >= 0.999) {
          diagnostics.push(
            diag("rhythm.pickup-missing", { units: R.str(ctx.pickup.units) }, undefined, "rhythm"),
          );
          score = Math.max(score, cfg.displacementCredit);
          replaced = true;
          break;
        }
      }
    }
    if (!replaced) {
      const periodBars = Math.max(1, periodOf(rawT, 16));
      const grid = finestGrid([...tAll, ...aAll], meter);
      const best = bestDisplacement(tAll, aAll, rat(periodBars), grid);
      if (best.f1 >= 0.999) {
        diagnostics.push(
          diag("rhythm.displaced", { shiftLabel: shiftLabel(best.shift, meter) }, undefined, "rhythm"),
        );
        score = Math.max(score, cfg.displacementCredit);
        replaced = true;
      }
    }
  }
  if (!replaced) diagnostics.push(...perNote);
  else diagnostics.push(...perNote.filter((d) => d.id === "rhythm.duration"));

  // 5. Subdivision: triplets against straight subdivisions.
  if (tAll.length > 0 && aAll.length > 0) {
    const ft = gridFeel(finestGrid(tAll, meter), meter);
    const fa = gridFeel(finestGrid(aAll, meter), meter);
    if ((ft === "ternary" && fa === "binary") || (ft === "binary" && fa === "ternary"))
      diagnostics.push(
        diag("rhythm.subdivision", { got: feelWord(fa), expected: feelWord(ft) }, undefined, "rhythm"),
      );
  }
  // Period: the loop lengths differ.
  if (rawT.length > 0 && rawA.length > 0) {
    const bars = Math.max(
      1,
      ...rawT.map((e) => R.floor(e.onset) + 1),
      ...rawA.map((e) => R.floor(e.onset) + 1),
    );
    const pt = periodOf(rawT, 16, bars);
    const pa = periodOf(rawA, 16, bars);
    if (pt !== pa && bars >= 2 * Math.max(pt, pa))
      diagnostics.push(diag("rhythm.period", { got: pa, expected: pt }, undefined, "rhythm"));
  }
  // Swing: right onsets after straightening, but the feel differs.
  diagnostics.push(...swingFindings(rawT, rawA, ctx));

  const dims: MatchResult["dims"] = { rhythm: { score: F1, weight: 1, n: tAll.length } };
  if (cfg.durations) dims.duration = { score: durAcc, weight: 0.25, n: durPairs };
  return { score: clampScore(score), dims, diagnostics, overlay };
}

const ctxUnits = (meter: MeterId): number => METERS[meter].unitsPerBar;

/**
 * The shift (in cycles) that turns the answer's onsets into the reference's when the answer put the declared
 * pickup on a downbeat (contracts §6.11 item 5): `p` (the answer is late by the pickup) or `−(1 − p)` (the
 * pickup landed on the downbeat before it). `null` when neither fits exactly.
 */
export function pickupShift(
  t: readonly Rat[],
  a: readonly Rat[],
  pickup: PickupSpec,
  meter: MeterId,
): Rat | null {
  if (t.length === 0 || a.length === 0) return null;
  const p = R.div(pickup.units, [ctxUnits(meter), 1]);
  for (const shift of [p, R.neg(R.sub(rat(1), p))]) if (linearShiftF1(t, a, shift) >= 0.999) return shift;
  return null;
}
const feelWord = (f: string): string =>
  f === "ternary" ? "triplets" : f === "binary" ? "straight 8ths and 16ths" : f;

/** `rhythm.swing-missing` when the answer is straight where the exercise swings, or the reverse. */
export function swingFindings(
  rawT: readonly NEvent[],
  rawA: readonly NEvent[],
  ctx: NormalizeContext,
): Diagnostic[] {
  const sub = ctx.swing?.subdivision ?? 8;
  const mA = swingRatio(rawA, ctx.meter, sub);
  if (mA.n < 2) return [];
  if (ctx.swing && ctx.swing.amount > 0) {
    if (mA.cls === "straight")
      return [diag("rhythm.swing-missing", { got: "straight", expected: "swung" }, undefined, "rhythm")];
    return [];
  }
  const mT = swingRatio(rawT, ctx.meter, sub);
  if (mT.n >= 2 && mT.cls === "straight" && (mA.cls === "light" || mA.cls === "triplet"))
    return [diag("rhythm.swing-missing", { got: "swung", expected: "straight" }, undefined, "rhythm")];
  return [];
}

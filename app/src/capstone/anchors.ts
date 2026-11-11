// Bar anchors for rubric results (ux §2.3 "living Requirements checklist"): where in the piece an unmet rule
// is unmet, as a bar range the learner can find. The grader's rubric reports pass/fail and a detail line; this
// reads the same normalized events to say *where*. Pure: the grader's track selection plus exact rationals.
import type { NEvent, Rat, RubricRule } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { type Normalized, selectTrack } from "@oak/grader";
import { noteToMidi } from "@oak/theory";

/** 1-based, inclusive. */
export interface BarAnchor {
  from: number;
  to: number;
}

export function anchorText(a: BarAnchor): string {
  return a.from === a.to ? `Bar ${a.from}` : `Bars ${a.from}–${a.to}`;
}

/** Collapses a set of 1-based bars into the smallest range that holds them. */
export function spanOf(bars: Iterable<number>): BarAnchor | null {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const b of bars) {
    if (b < from) from = b;
    if (b > to) to = b;
  }
  return Number.isFinite(from) ? { from, to } : null;
}

const key = (r: Rat): string => `${r[0]}/${r[1]}`;

function onsetsOf(events: readonly NEvent[]): Set<string> {
  return new Set(events.map((e) => key(e.onset)));
}

/**
 * Where an unmet rule is unmet, or `null` when the rule is about the whole piece (tempo, the number of
 * tracks, a tool that must be used) or when the events say nothing more precise.
 */
export function anchorFor(rule: RubricRule, n: Normalized, totalBars: number): BarAnchor | null {
  switch (rule.rule) {
    case "bars": {
      if (rule.min !== undefined && totalBars < rule.min) return { from: totalBars + 1, to: rule.min };
      if (rule.max !== undefined && totalBars > rule.max) return { from: rule.max + 1, to: totalBars };
      return null;
    }
    case "onsets": {
      let ev = selectTrack(n, rule.track);
      if (rule.drum) ev = ev.filter((e) => e.drum === rule.drum);
      const want = rule.contains ?? rule.equals ?? [];
      const bad = new Set<number>();
      if (!rule.perBar) {
        const got = onsetsOf(ev);
        for (const w of want) if (!got.has(key(w))) bad.add(R.floor(w) + 1);
        if (rule.equals) {
          const allowed = new Set(rule.equals.map(key));
          for (const e of ev) if (!allowed.has(key(e.onset))) bad.add(R.floor(e.onset) + 1);
        }
        return spanOf(bad);
      }
      for (let b = 0; b < totalBars; b++) {
        const got = new Set(ev.filter((e) => R.floor(e.onset) === b).map((e) => key(R.frac(e.onset))));
        const missing = want.some((w) => !got.has(key(R.frac(w))));
        const extra =
          rule.equals !== undefined && got.size !== new Set(rule.equals.map((w) => key(R.frac(w)))).size;
        if (missing || extra) bad.add(b + 1);
      }
      return spanOf(bad);
    }
    case "range": {
      const ev = selectTrack(n, rule.track).filter((e) => e.midi !== null && !e.drum);
      if (ev.length === 0) return null;
      if (Array.isArray(rule.within)) {
        const lo = noteToMidi(rule.within[0]) ?? 0;
        const hi = noteToMidi(rule.within[1]) ?? 127;
        const out = ev.filter((e) => (e.midi as number) < lo || (e.midi as number) > hi);
        if (out.length > 0) return spanOf(out.map((e) => R.floor(e.onset) + 1));
      }
      if (rule.maxSpan !== undefined) {
        const midis = ev.map((e) => e.midi as number);
        const lo = Math.min(...midis);
        const hi = Math.max(...midis);
        if (hi - lo > rule.maxSpan)
          return spanOf(ev.filter((e) => e.midi === lo || e.midi === hi).map((e) => R.floor(e.onset) + 1));
      }
      return null;
    }
    case "ends-on-degree":
    case "cadence":
      return totalBars >= 2 ? { from: totalBars - 1, to: totalBars } : { from: 1, to: 1 };
    default:
      return null;
  }
}

/** Anchors for every unmet rule of a result; met rules and whole-piece rules map to `null`. */
export function anchorsOf(
  rules: readonly RubricRule[],
  unmet: ReadonlySet<string>,
  n: Normalized | null,
  totalBars: number,
): Record<string, BarAnchor | null> {
  const out: Record<string, BarAnchor | null> = {};
  for (const r of rules) out[r.id] = n && unmet.has(r.id) ? anchorFor(r, n, totalBars) : null;
  return out;
}

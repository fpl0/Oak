// Bar anchors for rubric results (ux §2.3 "living Requirements checklist"): where in the piece an unmet rule
// is unmet, as a bar range the learner can find. The grader's rubric reports pass/fail and a detail line; this
// reads the same normalized events to say *where*. Pure: the grader's track selection plus exact rationals.
import type { NEvent, Rat, RubricRule, SectionRef } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { type Normalized, selectTrack } from "@oak/grader";
import { noteToMidi } from "@oak/theory";

/** 1-based, inclusive. */
export interface BarAnchor {
  from: number;
  to: number;
  /** The section the bars are ("Chorus 2"), when the anchor is a section. */
  label?: string;
}

export function anchorText(a: BarAnchor): string {
  const bars = a.from === a.to ? `Bar ${a.from}` : `Bars ${a.from}–${a.to}`;
  return a.label ? `${a.label} · ${bars.toLowerCase()}` : bars;
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

/**
 * The bars a rubric detail line names ("bar 3 is a cluster", "bars 7–8 end on V"): the harmony rules (progression,
 * cadence, chord qualities, voice leading) say where in words. `null` when the line names no bar.
 */
export function anchorFromText(text: string | null | undefined, totalBars?: number): BarAnchor | null {
  if (!text) return null;
  const bars: number[] = [];
  const re = /\bbars? (\d+)(?:\s*(?:–|-|to|and)\s*(\d+))?/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (Number.isFinite(a)) bars.push(a);
    if (Number.isFinite(b)) bars.push(b);
  }
  const span = spanOf(bars.filter((b) => b >= 0 && (totalBars === undefined || b <= Math.max(totalBars, 1))));
  return span;
}

/**
 * Anchors for every unmet rule of a result; met rules and whole-piece rules map to `null`. Where the events say
 * nothing precise, the rubric's own detail line may name the bars.
 */
export function anchorsOf(
  rules: readonly RubricRule[],
  unmet: ReadonlySet<string>,
  n: Normalized | null,
  totalBars: number,
  details: Readonly<Record<string, string | null | undefined>> = {},
  /** The piece's sections (Wave 5): a rule read in one section points at it when nothing more precise does. */
  sections: readonly SectionSpan[] = [],
): Record<string, BarAnchor | null> {
  const out: Record<string, BarAnchor | null> = {};
  for (const r of rules) {
    if (!unmet.has(r.id)) {
      out[r.id] = null;
      continue;
    }
    const fromEvents = n ? anchorFor(r, n, totalBars) : null;
    out[r.id] =
      fromEvents ?? anchorFromText(details[r.id], totalBars) ?? sectionOfRule(r, sections, totalBars);
  }
  return out;
}

/** A section as the anchors read it (`FormViewSection`): 0-based first bar. */
export interface SectionSpan {
  label: string;
  tag: string;
  text: string;
  startBar: number;
  bars: number;
}

/** The section a rule is read in (`rule.section`, or the first section a contrast compares). */
export function sectionOfRule(
  rule: RubricRule,
  sections: readonly SectionSpan[],
  totalBars: number,
): BarAnchor | null {
  const ref: SectionRef | undefined =
    rule.rule === "contrast"
      ? rule.a
      : "section" in rule
        ? (rule.section as SectionRef | undefined)
        : undefined;
  return ref ? sectionRefAnchor(ref, sections, totalBars) : null;
}

/** Where a section reference lands (1-based inclusive bars, with the section's name); `null` when it isn't there. */
export function sectionRefAnchor(
  ref: SectionRef,
  sections: readonly SectionSpan[],
  totalBars: number,
): BarAnchor | null {
  if (ref === "last") {
    const s = sections.at(-1);
    if (s) return { from: s.startBar + 1, to: s.startBar + s.bars, label: s.text };
    return totalBars > 0 ? { from: 1, to: totalBars } : null;
  }
  if ("bars" in ref) {
    const from = Math.max(1, ref.bars[0]);
    const to = Math.min(Math.max(totalBars, from), ref.bars[1]);
    return { from, to: Math.max(from, to) };
  }
  const want = ref.section.toLowerCase();
  const matches = sections.filter((s) => s.tag === want || s.label === want);
  const s =
    ref.nth === undefined
      ? matches[0]
      : ref.nth < 0
        ? matches[matches.length + ref.nth]
        : matches[ref.nth - 1];
  return s ? { from: s.startBar + 1, to: s.startBar + s.bars, label: s.text } : null;
}
